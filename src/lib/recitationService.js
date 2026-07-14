import { getAudioUrl, RECITERS } from "@/lib/quranData";
import { isPaceMatchEnabled, folderBitrateKbps, estimateDurationFromBytes, pickClosestPaceReciter } from "@/lib/paceMatching";
import {
  decodeToMonoSamples,
  compareSamples,
  analyzeRecordingQualityOnly,
  fetchArrayBuffer,
  reduceNoise,
  TARGET_SAMPLE_RATE,
} from "@/lib/audioAnalysis";
import { RecitationLog, DailyStreak } from "@/lib/localDb";
import { ensureAsrModelLoaded, transcribeAudio, resetAsrWorker } from "@/lib/asrEngine";
import { analyzeTajweedFromTranscription, summarizeTajweedChecks } from "@/lib/tajweedAnalysis";
import { getStoredCalibration } from "@/lib/micCalibration";
import { pickBestAyahCount, pickAyahCountFromTranscript } from "@/lib/ayahWindowMatching";
import { recordLifecycleEvent } from "@/lib/lifecycleDebug";
import { trackBuffer, releaseBuffer } from "@/lib/memoryLedger";

// Rejects if the promise doesn't settle within `ms`. Every await in the
// analysis pipeline is bounded by this: on low-memory devices (phones
// especially, but reproduced in e2e on desktop too) decodeAudioData /
// OfflineAudioContext rendering and the ASR worker can stall *forever*
// without throwing, which parked the UI on a spinner with no way out.
export function withTimeout(promise, ms, label) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); }
    );
  });
}

// Fetches + decodes the reference reciter's audio for one ayah. Returns
// null (rather than throwing) if it's unavailable, so callers can fall
// back gracefully instead of crashing the whole analysis.
async function fetchAyahSamples(reciterFolder, surahNumber, ayahNumber) {
  try {
    const url = getAudioUrl(reciterFolder, surahNumber, ayahNumber);
    const arrayBuffer = await fetchArrayBuffer(url);
    return await withTimeout(
      decodeToMonoSamples(arrayBuffer, TARGET_SAMPLE_RATE),
      30_000,
      "Decoding reference audio"
    );
  } catch {
    return null;
  }
}

const CONTINUOUS_GAP_SEC = 0.25;

// Fetches reference audio for a window of ayahs (wider than what was
// tapped, so the duration-matching below has room to correct in either
// direction), returning per-ayah samples/durations alongside the total.
async function fetchAyahWindow(reciterFolder, surahNumber, ayahNumbers) {
  const perAyah = [];
  for (const ayahNumber of ayahNumbers) {
    const samples = await fetchAyahSamples(reciterFolder, surahNumber, ayahNumber);
    perAyah.push(samples); // null on failure, handled by caller
  }
  return perAyah;
}

// Joins a set of already-fetched per-ayah sample arrays (nulls skipped)
// into one continuous track with short silence gaps at the splices.
function joinAyahSamples(perAyahSamples, gapSamples) {
  const parts = [];
  let anySucceeded = false;
  for (const samples of perAyahSamples) {
    if (samples) {
      anySucceeded = true;
      parts.push(samples, gapSamples);
    }
  }
  if (!anySucceeded) return null;

  const totalLength = parts.reduce((sum, p) => sum + p.length, 0);
  const combined = new Float32Array(totalLength);
  let offset = 0;
  for (const part of parts) {
    combined.set(part, offset);
    offset += part.length;
  }
  return combined;
}

// Decodes a recorded Blob into mono 16kHz samples once, so callers can
// reuse the same decoded audio for both the acoustic score and the
// ASR/Tajweed pass instead of decoding twice.
export async function decodeUserRecording(userBlob) {
  recordLifecycleEvent("decode-start", `${userBlob.size}B ${userBlob.type || ""}`);
  // An (almost) empty blob means the microphone delivered no data at all —
  // decodeAudioData would fail with a cryptic "Unable to decode audio
  // data"; name the real problem instead. Even a fraction of a second of
  // real opus/webm audio is comfortably past 1KB.
  if (userBlob.size < 1024) {
    throw new Error(
      "Your microphone didn't capture any audio — the recording came out empty. " +
        "Check that the right microphone is selected and allowed: click the padlock/mic icon in the address bar, " +
        "and in Windows check Settings > Privacy & security > Microphone."
    );
  }
  const arrayBuffer = await userBlob.arrayBuffer();
  try {
    // Bounded: a hung decode now surfaces the error state (with Try Again)
    // instead of an infinite "analyzing" spinner.
    const decoded = await withTimeout(decodeToMonoSamples(arrayBuffer, TARGET_SAMPLE_RATE), 30_000, "Decoding your recording");
    recordLifecycleEvent("decode-complete", `${(decoded.length / TARGET_SAMPLE_RATE).toFixed(1)}s decoded`);
    // Lightweight, model-free noise gate BEFORE any analysis — only when this
    // device has been calibrated (its real noise floor is known). It attenuates
    // steady background hum in the gaps around speech while leaving actual
    // voice untouched; on an uncalibrated device reduceNoise is a no-op (it
    // returns the same array), so the default path is unchanged. See
    // reduceNoise in audioAnalysis.js for the safety guards.
    const noiseFloorDb = getStoredCalibration()?.noiseFloorDb ?? null;
    const samples = noiseFloorDb == null ? decoded : reduceNoise(decoded, TARGET_SAMPLE_RATE, { noiseFloorDb });
    if (samples !== decoded) recordLifecycleEvent("noise-reduced", `gated to calibrated floor ${noiseFloorDb.toFixed(1)} dBFS`);
    // Held for the whole analysis by design (the Tajweed stage windows into
    // it after ASR) — the ledger makes that retention visible at the ASR
    // memory checkpoints rather than leaving it implied.
    trackBuffer("user-samples", samples.length * 4);
    return samples;
  } catch (err) {
    // A fresh MediaRecorder blob that won't decode almost always means the
    // mic delivered no usable audio (classic with Bluetooth headsets that
    // are connected but idle/asleep): the file has a container header but
    // no sound frames. Name that instead of the cryptic decode error.
    recordLifecycleEvent("decode-error", `${userBlob.size}B ${userBlob.type || ""}: ${err?.message || err}`);
    if (/decod/i.test(String(err?.message || ""))) {
      throw new Error(
        "Your recording couldn't be read — usually the microphone captured no actual sound. " +
          "This is common with Bluetooth headsets that are connected but idle: make sure it's awake (play any sound through it), " +
          "or switch to the built-in microphone (browser padlock icon > Site settings > Microphone)."
      );
    }
    throw err;
  }
}

// HEAD request for a reference file's byte size (used only for the cheap
// duration estimate behind pace matching). Null on any failure.
async function headContentLength(url, timeoutMs = 6000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: "HEAD", mode: "cors", signal: controller.signal });
    if (!res.ok) return null;
    const len = parseInt(res.headers.get("content-length") || "", 10);
    return Number.isFinite(len) ? len : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

// When pace matching is on (Settings toggle, default off), picks the reciter
// whose recording of this ayah is closest in duration to the user's — from
// duration estimates alone, before any scoring (see src/lib/paceMatching.js
// for why it must never be chosen by resulting score). Falls back to the
// user's chosen reciter whenever estimates can't be fetched.
async function resolveReciterForPace({ userDurationSec, surahNumber, ayahNumber, reciterFolder, reciterName }) {
  const fallback = { folder: reciterFolder, name: reciterName, paceMatched: false };
  if (!isPaceMatchEnabled() || RECITERS.length < 2) return fallback;

  const candidates = await Promise.all(
    RECITERS.map(async (r) => {
      const bytes = await headContentLength(getAudioUrl(r.folder, surahNumber, ayahNumber));
      return { folder: r.folder, name: r.name, durationSec: estimateDurationFromBytes(bytes, folderBitrateKbps(r.folder)) };
    })
  );
  const pick = pickClosestPaceReciter(userDurationSec, candidates.filter((c) => c.durationSec != null));
  if (!pick) return fallback;
  return { folder: pick.folder, name: pick.name, paceMatched: pick.folder !== reciterFolder };
}

// Analyzes a single-ayah recording against its reference reciter audio.
// Accepts already-decoded samples (see decodeUserRecording) to avoid
// redundant work when the caller also needs the raw samples for ASR.
export async function analyzeSingleAyahRecitation({ userSamples, reciterFolder, reciterName, surahNumber, ayahNumber }) {
  const userNoiseFloorDb = getStoredCalibration()?.noiseFloorDb ?? null;
  const userDurationSec = userSamples.length / TARGET_SAMPLE_RATE;

  const reciter = await resolveReciterForPace({ userDurationSec, surahNumber, ayahNumber, reciterFolder, reciterName });
  let refSamples = await fetchAyahSamples(reciter.folder, surahNumber, ayahNumber);
  if (refSamples) {
    trackBuffer("reference-samples", refSamples.length * 4);
    const result = compareSamples(userSamples, refSamples, TARGET_SAMPLE_RATE, { userNoiseFloorDb });
    // Explicit dereference, not just scope expiry: the ASR model load (the
    // memory spike) starts after this returns, and the ledger must be able
    // to PROVE the reference audio was no longer referenced by then.
    refSamples = null;
    releaseBuffer("reference-samples");
    if (reciter.paceMatched) {
      result.reciterUsed = reciter.name;
      result.feedback.push(
        `Pace match: you were compared against ${reciter.name}, whose recording of this ayah is closest in length to yours (chosen by duration before scoring — turn this off in Settings to always use your selected reciter).`
      );
    }
    return result;
  }
  return analyzeRecordingQualityOnly(userSamples, TARGET_SAMPLE_RATE, userNoiseFloorDb);
}

// Analyzes a continuous, multi-ayah recording. Rather than trusting the
// tapped ayah count outright (manual "Next Ayah" taps can easily drift
// from the actual pace), the recited count is resolved from two signals:
//  1. The ASR transcript (when `transcriptPromise` + `allAyahTexts` are
//     provided): the words actually recognized are matched against the
//     surah text — the strongest signal, but it yields to (2) whenever
//     ASR failed/stalled or the transcript explains the audio poorly.
//  2. Reference-audio duration matching (always computed): whichever
//     count's expected duration best matches the recording's length.
// The transcript promise is awaited *after* the reference audio fetch, so
// transcription and fetching overlap rather than queue.
//
// `searchMargin` defaults to 6 (search a window around the tapped count).
// Pass 0 with `manualOverride` to pin the resolved count exactly to
// `taggedCount` — the user has said how many ayahs they recited.
export async function analyzeContinuousRecitation({
  userSamples,
  reciterFolder,
  surahNumber,
  allAyahNumbers,
  allAyahTexts = null,
  transcriptPromise = null,
  taggedCount,
  searchMargin = 6,
  manualOverride = false,
}) {
  const userNoiseFloorDb = getStoredCalibration()?.noiseFloorDb ?? null;
  const userDurationSec = userSamples.length / TARGET_SAMPLE_RATE;

  const windowSize = Math.min(allAyahNumbers.length, taggedCount + searchMargin);
  const windowAyahNumbers = allAyahNumbers.slice(0, windowSize);

  let perAyahSamples = await fetchAyahWindow(reciterFolder, surahNumber, windowAyahNumbers);
  const refBytes = perAyahSamples.reduce((sum, s) => sum + (s ? s.length * 4 : 0), 0);
  trackBuffer("reference-samples", refBytes);
  recordLifecycleEvent("refs-fetched", `${perAyahSamples.filter(Boolean).length}/${perAyahSamples.length} reference ayahs decoded (${(refBytes / 1048576).toFixed(1)}MB)`);
  const rawDurations = perAyahSamples.map((s) => (s ? s.length / TARGET_SAMPLE_RATE : null));
  const knownDurations = rawDurations.filter((d) => d != null);
  const avgKnownDuration = knownDurations.length
    ? knownDurations.reduce((a, b) => a + b, 0) / knownDurations.length
    : 0;
  // A failed individual fetch (rare) gets an estimated duration instead of
  // 0, so it doesn't silently shrink the expected total and skew matching.
  const ayahDurationsSec = rawDurations.map((d) => d ?? avgKnownDuration);

  let { resolvedCount, corrected } = pickBestAyahCount({
    ayahDurationsSec,
    gapSec: CONTINUOUS_GAP_SEC,
    userDurationSec,
    taggedCount,
    searchMargin,
  });
  let countMethod = "duration";

  if (transcriptPromise && allAyahTexts && !manualOverride) {
    try {
      // Wait only briefly for the transcript: the score must never sit
      // behind a model download/load — that's exactly the window where
      // memory-constrained mobile tabs OOM. If the transcript isn't ready
      // in time, the duration-based count above stands; transcription
      // keeps running in the background for Tajweed either way.
      const TRANSCRIPT_COUNT_WAIT_MS = 15_000;
      const asrResult = await Promise.race([
        transcriptPromise, // resolves null when ASR failed/stalled
        new Promise((resolve) => setTimeout(resolve, TRANSCRIPT_COUNT_WAIT_MS)),
      ]);
      if (asrResult?.text) {
        const pick = pickAyahCountFromTranscript({
          transcriptText: asrResult.text,
          ayahTexts: allAyahTexts,
          taggedCount,
          searchMargin,
        });
        if (pick.reliable) {
          resolvedCount = pick.resolvedCount;
          corrected = pick.corrected;
          countMethod = "transcript";
        }
      }
    } catch {
      // Transcript unavailable — the duration-based result above stands.
    }
  }

  const gapSamples = new Float32Array(Math.round(TARGET_SAMPLE_RATE * CONTINUOUS_GAP_SEC));
  let refSamples = joinAyahSamples(perAyahSamples.slice(0, resolvedCount), gapSamples);

  const result = refSamples
    ? compareSamples(userSamples, refSamples, TARGET_SAMPLE_RATE, { userNoiseFloorDb })
    : analyzeRecordingQualityOnly(userSamples, TARGET_SAMPLE_RATE, userNoiseFloorDb);
  // Explicit dereference, not just scope expiry: on a cold model the ASR
  // session creation (the memory spike) starts after this returns, and the
  // ledger must be able to PROVE the reference audio wasn't still held.
  perAyahSamples = null;
  refSamples = null;
  releaseBuffer("reference-samples");
  recordLifecycleEvent("dsp-complete", `score=${result.score} count=${resolvedCount} (${countMethod}); reference buffers dereferenced`);

  return { ...result, resolvedAyahCount: resolvedCount, taggedAyahCount: taggedCount, ayahCountCorrected: corrected, manualOverride, countMethod };
}

// ---- ASR/Tajweed failure reason ---------------------------------------
// When the Tajweed layer degrades to null, the UI used to say only "wasn't
// available" and the log only "unavailable" — true but useless. This records
// WHY, per analysis run, so the log line is diagnostic and the result panel
// can tell the user something actionable (especially backgrounding, which
// the user can actually fix). Module-level is safe: one analysis runs at a
// time (the modals sequence runs via runSeqRef).
let lastAsrFailure = null; // { code, detail } | null

function setAsrFailure(code, detail = "") {
  lastAsrFailure = { code, detail };
}

export function getLastAsrFailure() {
  return lastAsrFailure;
}

// User-facing message for the result panel. Returns null for unknown/no
// failure — the panel then keeps its generic fallback line.
export function describeAsrFailureForUser(failure) {
  switch (failure?.code) {
    case "backgrounded-during-inference":
      return "Word-level analysis was interrupted because the app went to the background. Keep Tilawah in the foreground while it processes, then try again.";
    case "timed-out":
      return "Speech recognition took too long on this device and was stopped so your result wouldn't hang. Your score isn't affected.";
    case "empty-transcript":
      return "Speech recognition ran but couldn't make out any words in your recording. Check that the recording is clearly audible, then try again.";
    case "inference-error":
      return "Speech recognition failed on this device, so word-level detail isn't available for this attempt. Your score isn't affected.";
    case "analysis-error":
      return "Something went wrong while checking the Tajweed details. Your score isn't affected.";
    default:
      return null;
  }
}

// Compact "code: detail" form for the persisted lifecycle log.
export function describeAsrFailureForLog(failure) {
  if (!failure) return "no reason recorded";
  return failure.detail ? `${failure.code}: ${failure.detail}` : failure.code;
}

// Runs real speech-recognition-based Tajweed analysis: loads the ASR model
// (downloads/caches on first use), transcribes the user's recording, then
// checks word correctness + Qalqalah/Ghunnah/Madd timing against it.
// Degrades gracefully (returns null) if the model can't load or fails —
// callers should treat this as a bonus layer on top of the acoustic score,
// not a required one.
// Transcribes a recording once, bounded — returns Whisper's result or null,
// never throws and never hangs. The stall watchdog exists because the ASR
// worker can wedge without ever erroring (wasm abort / mobile memory
// pressure), which used to park the UI on a spinner forever. The deadline
// scales with audio length (inference emits no progress events) and is
// pushed forward by every model-download progress event so a slow
// connection isn't mistaken for a stall. The single result is shared by
// ayah-count detection AND Tajweed analysis — transcription runs once.
export async function transcribeUserRecording(userSamples, onModelProgress) {
  lastAsrFailure = null; // fresh run, fresh verdict
  // Backgrounding is the most common *user-fixable* cause of a stall:
  // hidden tabs get their timers throttled and (on iOS) their JS frozen
  // outright, so the worker never finishes within the watchdog ceiling.
  // Distinguishing that from a genuine stall makes the fallback message
  // actionable instead of generic.
  let wentHidden = false;
  const onVisibilityChange = () => {
    if (document.visibilityState === "hidden") wentHidden = true;
  };
  if (typeof document !== "undefined") {
    document.addEventListener("visibilitychange", onVisibilityChange);
  }
  try {
    const audioSec = userSamples.length / TARGET_SAMPLE_RATE;
    const ceilingMs = Math.min(Math.max(audioSec * 10, 180), 360) * 1000;
    let deadline = Date.now() + ceilingMs;
    let settled = false;

    const work = (async () => {
      await ensureAsrModelLoaded((pct) => {
        deadline = Date.now() + ceilingMs;
        onModelProgress?.(pct);
      });
      deadline = Date.now() + ceilingMs;
      return await transcribeAudio(userSamples);
    })().finally(() => { settled = true; });

    const STALLED = Symbol("stalled");
    const watchdog = new Promise((resolve) => {
      const interval = setInterval(() => {
        if (settled) { clearInterval(interval); return; }
        if (Date.now() > deadline) { clearInterval(interval); resolve(STALLED); }
      }, 2000);
    });

    const outcome = await Promise.race([work, watchdog]);
    if (outcome === STALLED) {
      setAsrFailure(
        wentHidden ? "backgrounded-during-inference" : "timed-out",
        `no completion within the ${Math.round(ceilingMs / 1000)}s ceiling for ${audioSec.toFixed(0)}s of audio`
      );
      console.error(
        `ASR transcription stalled (no completion within ${Math.round(ceilingMs / 1000)}s) — continuing without it and resetting the ASR worker.`
      );
      recordLifecycleEvent(
        "asr-stalled",
        `${wentHidden ? "the page went to the background during the run — " : ""}no completion within the ${Math.round(ceilingMs / 1000)}s ceiling for ${audioSec.toFixed(0)}s of audio — worker reset, continuing without a transcript`
      );
      // The abandoned work promise will reject once the worker is reset —
      // absorb it so it can't surface as an unhandled rejection.
      work.catch(() => {});
      resetAsrWorker();
      return null;
    }
    return outcome;
  } catch (err) {
    setAsrFailure("inference-error", describeError(err));
    console.error("ASR transcription unavailable:", err);
    recordLifecycleEvent("asr-unavailable", describeError(err));
    return null;
  } finally {
    if (typeof document !== "undefined") {
      document.removeEventListener("visibilitychange", onVisibilityChange);
    }
  }
}

// Compact error description for the persisted lifecycle ring buffer:
// message plus the first real stack frame, so a phone log names the
// actual failure instead of a generic "unavailable".
function describeError(err) {
  const message = `${err?.name && err.name !== "Error" ? `${err.name}: ` : ""}${err?.message || err}`;
  const frame = String(err?.stack || "")
    .split("\n")
    .find((l) => l.trimStart().startsWith("at "));
  return frame ? `${message} | ${frame.trim()}` : message;
}

export async function runTajweedAnalysis({ userSamples, ayahArabicText, onModelProgress, asrResult = null }) {
  try {
    // Reuse an already-obtained transcript when the caller has one (the
    // continuous flow transcribes early for ayah-count detection); only
    // transcribe here when called standalone (single-ayah flow).
    const result = asrResult ?? (await transcribeUserRecording(userSamples, onModelProgress));
    if (!result) {
      // The asr-* events just before this one say what actually happened
      // (stall, worker error, load failure); this closes the causal chain.
      recordLifecycleEvent(
        "tajweed-skipped",
        `no transcript available (${getLastAsrFailure()?.code ?? "unknown"}) — see the preceding asr-* events for the cause`
      );
      return null;
    }
    // A transcript with no recognized words at all can't anchor any word or
    // rule check — running the analysis anyway would render an empty panel
    // that looks like "0 issues found". Degrade honestly instead. (Text
    // without word chunks still proceeds: showing what was heard is useful
    // even when timing checks can't run.)
    if (!result.text?.trim() && !(result.chunks?.length > 0)) {
      setAsrFailure("empty-transcript", "speech recognition returned no words");
      recordLifecycleEvent("tajweed-skipped", "empty transcript — speech recognition heard no words in the recording");
      return null;
    }
    return analyzeTajweedFromTranscription({
      asrResult: result,
      ayahArabicText,
      userSamples,
      sampleRate: TARGET_SAMPLE_RATE,
    });
  } catch (err) {
    // This catch also covers analyzeTajweedFromTranscription itself — a
    // real code bug here must be named in the persisted log, not silently
    // collapsed into the same "unavailable" as an ASR failure.
    setAsrFailure("analysis-error", describeError(err));
    console.error("Tajweed/ASR analysis unavailable:", err);
    recordLifecycleEvent("tajweed-error", describeError(err));
    return null;
  }
}

// Shared persistence: logs the attempt(s) and rolls the score into today's
// streak record, all stored locally on this device. Returns enough of a
// receipt (log ids + the streak delta actually applied) that a caller can
// later undo this exact persist via revertRecitationResult — used when the
// user corrects an auto-detected ayah count after the fact and the result
// needs to be re-scored and re-logged.
export async function persistRecitationResult({ surahNumber, surahName, ayahs, reciterName, result, durationSeconds, tajweedResult }) {
  const tajweedSummary = tajweedResult ? summarizeTajweedChecks(tajweedResult.ruleChecks) : null;

  const logIds = [];
  for (const ayah of ayahs) {
    const log = await RecitationLog.create({
      surah_number: surahNumber,
      surah_name: surahName,
      ayah_number: ayah.number,
      ayah_text: ayah.arabic,
      accuracy_score: result.score,
      ai_feedback: result.feedback.join("\n\n"),
      reciter_used: reciterName,
      duration_seconds: durationSeconds,
      tajweed_summary: tajweedSummary,
    });
    logIds.push(log.id);
  }

  const date = new Date().toISOString().split("T")[0];
  const existing = await DailyStreak.filter({ date });
  const count = ayahs.length;

  if (existing.length > 0) {
    const prevTotal = existing[0].total_recordings || 0;
    const newTotal = prevTotal + count;
    await DailyStreak.update(existing[0].id, {
      total_recordings: newTotal,
      ayahs_practiced: (existing[0].ayahs_practiced || 0) + count,
      average_accuracy: Math.round(
        ((existing[0].average_accuracy || 0) * prevTotal + result.score * count) / newTotal
      ),
      minutes_spent: (existing[0].minutes_spent || 0) + Math.ceil(durationSeconds / 60),
    });
  } else {
    await DailyStreak.create({
      date,
      total_recordings: count,
      ayahs_practiced: count,
      average_accuracy: result.score,
      minutes_spent: Math.ceil(durationSeconds / 60),
    });
  }

  return { logIds, date, ayahCount: count, score: result.score, durationSeconds };
}

// Attaches the Tajweed layer to logs that were persisted before the ASR
// stage ran (the modals save the acoustic score first, so a transcription
// failure — or a crash/reload mid-transcription — never loses the attempt).
// Score and streak math are untouched; only the feedback text and the
// tajweed summary are enriched.
export async function attachTajweedToLogs({ logIds, feedback, tajweedResult }) {
  const tajweedSummary = tajweedResult ? summarizeTajweedChecks(tajweedResult.ruleChecks) : null;
  for (const id of logIds) {
    await RecitationLog.update(id, {
      ai_feedback: feedback.join("\n\n"),
      tajweed_summary: tajweedSummary,
    });
  }
}

// Undoes exactly what a prior persistRecitationResult call did: deletes the
// logged entries and subtracts their contribution back out of that day's
// streak record. Used when the user overrides an auto-detected ayah count
// on the result screen — the original (wrong) persist is reverted before
// the corrected one is written.
export async function revertRecitationResult({ logIds, date, ayahCount, score, durationSeconds }) {
  for (const id of logIds) {
    await RecitationLog.delete(id);
  }

  const existing = await DailyStreak.filter({ date });
  if (existing.length === 0) return;

  const record = existing[0];
  const prevTotal = record.total_recordings || 0;
  const newTotal = Math.max(0, prevTotal - ayahCount);

  if (newTotal === 0) {
    await DailyStreak.update(record.id, {
      total_recordings: 0,
      ayahs_practiced: 0,
      average_accuracy: 0,
      minutes_spent: Math.max(0, (record.minutes_spent || 0) - Math.ceil(durationSeconds / 60)),
    });
    return;
  }

  await DailyStreak.update(record.id, {
    total_recordings: newTotal,
    ayahs_practiced: Math.max(0, (record.ayahs_practiced || 0) - ayahCount),
    average_accuracy: Math.round(
      ((record.average_accuracy || 0) * prevTotal - score * ayahCount) / newTotal
    ),
    minutes_spent: Math.max(0, (record.minutes_spent || 0) - Math.ceil(durationSeconds / 60)),
  });
}

// Assesses whether the underlying signals behind a score were strong enough
// to trust, so the UI can flag a low-confidence result rather than
// presenting every score with equal certainty. This is a heuristic over
// signals we already compute — not a new measurement.
export function assessRecitationConfidence({ dspResult, tajweedResult }) {
  const reasons = [];

  if (dspResult && !dspResult.referenceAvailable) {
    reasons.push("no reference reciter audio was available to compare against");
  }
  if (dspResult?.referenceAvailable && dspResult.pitchScore == null) {
    reasons.push("pitch/intonation couldn't be reliably measured from your recording");
  }
  if (!tajweedResult) {
    reasons.push("speech recognition didn't run, so word-level accuracy is unverified");
  } else {
    const stats = tajweedResult.alignmentStats;
    if (stats && stats.totalWords > 0 && stats.recognizedRatio != null && stats.recognizedRatio < 0.5) {
      reasons.push("speech recognition barely recognized any words in your recording");
    }
  }

  return { isLow: reasons.length > 0, reasons };
}
