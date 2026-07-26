// Builds a per-reciter "style profile" — real statistical summaries of how a
// specific reciter typically paces their Madd elongation, nasal holds, and
// pauses, and how volatile their pitch contour is — for reciters that have
// no QUA ground-truth timing (see src/lib/quaReferenceData.js: only
// Al-Husary and Al-Minshawi are covered there). Phase 2 (not built yet) will
// use this to adjust Madd/nasal-hold thresholds toward the SPECIFIC
// reciter's own typical delivery, instead of one generic baseline for every
// reciter.
//
// Deliberately statistical, not a trained model: every number here is a
// mean over real measurements the app's own existing threshold-mode Tajweed
// checks already produce (see checkTajweedRules in src/lib/tajweedAnalysis.js)
// plus two small, already-existing audioAnalysis.js primitives
// (analyzeSingle's pause detection, pitchStdSemitones). No new signal
// processing was written for this.
//
// Fairness/scope, deliberately narrow: this profiles TIMING/RHYTHM/PITCH-
// CONTOUR-SHAPE only —
//   - Madd elongation ratio and nasal-hold duration ratio: pure duration
//     measurements, nothing about how they sound.
//   - Pause frequency/duration: pure timing between words.
//   - Pitch-contour volatility: standard deviation of the semitone-relative
//     pitch contour — shift-invariant by construction, so it cannot reflect
//     pitch REGISTER (how high/low a voice naturally sits), only how much it
//     moves. This codebase has no spectral/formant analysis anywhere, so
//     voice TIMBRE isn't something these numbers could capture even
//     incidentally.
// Qalqalah bounce-dB was deliberately left OUT of this profiler: unlike the
// four stats above, a release's dB "pop" plausibly reflects some amount of
// natural vocal power/mic proximity, not just deliberate technique — using
// it to adjust the bar for OTHER users would risk penalizing someone with a
// naturally softer voice for picking a reciter with a punchier one. Qalqalah
// stays on the generic, non-reciter-specific threshold.
//
// Usage (resumable — safe to Ctrl+C and re-run):
//   npx vite-node tools/qdat-eval/build-reciter-profile.mjs -- --reciter Alafasy_128kbps [--count 300] [--model <id>]
//
// Writes a raw per-ayah cache to tools/qdat-eval/reciter-profile-cache/<reciterFolder>.json.
// Run compile-reciter-profile.mjs afterward to aggregate that cache into the
// small, checked-in src/lib/reciterStyleProfiles.js the app actually reads.
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pipeline } from "@huggingface/transformers";
import { analyzeTajweedFromTranscription, TAJWEED_THRESHOLDS } from "@/lib/tajweedAnalysis";
import { analyzeSingle, pitchStdSemitones, TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { SURAHS, getAudioUrl, fetchSurahText } from "@/lib/quranData";
import { parseWav, resampleLinear } from "./qdat-io.mjs";

const DEFAULT_MODEL_ID = "onnx-community/whisper-base_timestamped";

// The same nasal-hold rule family checkTajweedRules groups under one
// acceptance check (NASAL_HOLD_RULE_TYPES in tajweedAnalysis.js — not
// exported, so named again here, same pattern extract-features-ref.mjs
// already uses for its own rule-name list).
const NASAL_HOLD_RULE_TYPES = new Set(["ghunnah", "iqlab", "idgham_ghunnah", "ikhfa"]);

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  return {
    reciterFolder: get("--reciter") || "Alafasy_128kbps",
    count: get("--count") ? parseInt(get("--count"), 10) : 300,
    modelId: get("--model") || DEFAULT_MODEL_ID,
    cacheDir: get("--cache-dir") || path.join("tools", "qdat-eval", "reciter-profile-cache"),
  };
}

// Picks `count` (surah, ayah) pairs spread across the whole mushaf: every
// 3rd surah (~38 of 114, covering short/medium/long surahs from beginning
// to end), then within each chosen surah, ayahs evenly spaced across its
// length. This is "many different ayahs, cross-ayah" per the brief — not
// multiple takes of one ayah, which doesn't exist in this data source.
function pickAyahSample(count) {
  const chosenSurahs = SURAHS.filter((s) => (s.number - 1) % 3 === 0);
  const perSurah = Math.max(1, Math.ceil(count / chosenSurahs.length));
  const pairs = [];
  for (const surah of chosenSurahs) {
    const n = Math.min(perSurah, surah.ayahs);
    const seen = new Set();
    for (let k = 0; k < n; k++) {
      const ayahNum = n === 1 ? 1 : 1 + Math.round((k * (surah.ayahs - 1)) / (n - 1));
      if (seen.has(ayahNum)) continue;
      seen.add(ayahNum);
      pairs.push({ surahNumber: surah.number, ayahNumber: ayahNum });
    }
    if (pairs.length >= count) break;
  }
  return pairs.slice(0, count);
}

async function fetchAndDecodeMp3(url, tmpBase) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const mp3Path = `${tmpBase}.mp3`;
  const wavPath = `${tmpBase}.wav`;
  fs.writeFileSync(mp3Path, Buffer.from(await res.arrayBuffer()));
  try {
    execFileSync("ffmpeg", ["-y", "-i", mp3Path, "-ar", "16000", "-ac", "1", wavPath], { stdio: "pipe" });
    const { samples, sampleRate } = parseWav(fs.readFileSync(wavPath));
    return resampleLinear(samples, sampleRate, TARGET_SAMPLE_RATE);
  } finally {
    fs.rmSync(mp3Path, { force: true });
    fs.rmSync(wavPath, { force: true });
  }
}

async function main() {
  const { reciterFolder, count, modelId, cacheDir } = parseArgs();
  fs.mkdirSync(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${reciterFolder}.json`);

  const existing = fs.existsSync(cachePath)
    ? new Map(
        JSON.parse(fs.readFileSync(cachePath, "utf8"))
          .records.filter((r) => !r.error)
          .map((r) => [`${r.surahNumber}:${r.ayahNumber}`, r])
      )
    : new Map();

  const sample = pickAyahSample(count);
  console.log(`Reciter: ${reciterFolder} — sampling ${sample.length} ayahs across ${new Set(sample.map((p) => p.surahNumber)).size} surahs`);

  console.log(`Loading ASR model ${modelId} (cached after first run)...`);
  const transcriber = await pipeline("automatic-speech-recognition", modelId, {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
    progress_callback: (d) => {
      if (d?.status === "progress" && typeof d.progress === "number" && d.progress % 20 < 1) {
        process.stdout.write(`\rmodel download ${Math.round(d.progress)}%   `);
      }
    },
  });
  patchWhisperGenerationConfig(transcriber);
  console.log("\nModel ready.");

  const surahTextCache = new Map();
  let processed = 0;
  let errors = 0;
  const started = Date.now();

  for (const { surahNumber, ayahNumber } of sample) {
    const key = `${surahNumber}:${ayahNumber}`;
    if (existing.has(key)) continue;

    try {
      if (!surahTextCache.has(surahNumber)) surahTextCache.set(surahNumber, await fetchSurahText(surahNumber));
      const ayahText = surahTextCache.get(surahNumber).find((a) => a.number === ayahNumber)?.arabic;
      if (!ayahText) throw new Error("ayah text not found");

      const url = getAudioUrl(reciterFolder, surahNumber, ayahNumber);
      const tmpBase = path.join(cacheDir, `_tmp_${surahNumber}_${ayahNumber}`);
      const samples = await fetchAndDecodeMp3(url, tmpBase);

      const asrResult = await transcriber(samples, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
      });

      const analysis = analyzeTajweedFromTranscription({
        asrResult,
        ayahArabicText: ayahText,
        userSamples: samples,
        sampleRate: TARGET_SAMPLE_RATE,
      });

      const maddRatios = analysis.ruleChecks
        .filter((c) => c.ruleType.startsWith("madd") && c.measured?.mode === "threshold" && c.measured.expectedRatio > 0)
        .map((c) => c.measured.actualRatio / c.measured.expectedRatio);

      const nasalRatios = analysis.ruleChecks
        .filter((c) => NASAL_HOLD_RULE_TYPES.has(c.ruleType) && c.measured?.mode === "threshold")
        .map((c) => {
          const { segmentDurationSec, avgWordDur, expectedCounts } = c.measured;
          const expectedMinSec = (expectedCounts / 2) * (avgWordDur * TAJWEED_THRESHOLDS.nasalHoldCountWordFraction);
          return expectedMinSec > 0 ? segmentDurationSec / expectedMinSec : null;
        })
        .filter((v) => v != null);

      const a = analyzeSingle(samples, TARGET_SAMPLE_RATE);
      const pitchVolatility = a.isSilent ? null : pitchStdSemitones(a.pitchHz, a.start, a.end);

      existing.set(key, {
        surahNumber,
        ayahNumber,
        maddRatios,
        nasalRatios,
        pauseCount: a.pauseCount,
        pauseDurationsSec: a.pauseDurationsSec,
        activeDurationSec: a.activeDurationSec,
        pitchVolatility,
        recognizedRatio: analysis.alignmentStats.recognizedRatio,
      });
    } catch (err) {
      existing.set(key, { surahNumber, ayahNumber, error: err.message });
      errors++;
    }

    processed++;
    if (processed % 10 === 0) {
      const rate = processed / ((Date.now() - started) / 1000);
      fs.writeFileSync(cachePath, JSON.stringify({ model: modelId, reciterFolder, records: [...existing.values()] }));
      console.log(`processed ${processed}/${sample.length} (cached ${existing.size}, errors ${errors}) — ${rate.toFixed(2)} rec/s`);
    }
  }

  fs.writeFileSync(cachePath, JSON.stringify({ model: modelId, reciterFolder, records: [...existing.values()] }, null, 1));
  console.log(`Done. ${existing.size} records cached at ${cachePath} (${errors} errors).`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
