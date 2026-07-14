import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, ChevronRight, X, Loader2, CheckCircle2, RotateCcw, AlertTriangle, Upload, RefreshCw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { analyzeContinuousRecitation, persistRecitationResult, revertRecitationResult, runTajweedAnalysis, decodeUserRecording, assessRecitationConfidence, attachTajweedToLogs, transcribeUserRecording, getLastAsrFailure, describeAsrFailureForUser, describeAsrFailureForLog } from "@/lib/recitationService";
import { describeAsrGate, isAsrModelWarm, resetAsrWorker } from "@/lib/asrEngine";
import { getVisualizationEnvelope, TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";
import { getAudioUrl } from "@/lib/quranData";
import { getSupportedRecorderMimeType } from "@/lib/mediaUtils";
import { runMicCheck } from "@/lib/micCheck";
import { setLifecyclePhase, recordLifecycleEvent } from "@/lib/lifecycleDebug";
import TajweedResultsPanel from "@/components/quran/TajweedResultsPanel";
import WaveformTimeline from "@/components/quran/WaveformTimeline";
import ComparePlayback from "@/components/quran/ComparePlayback";
import MetricBadge from "@/components/quran/MetricBadge";
import ResultFeedback from "@/components/quran/ResultFeedback";

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

export default function ContinuousRecitation({ open, onClose, ayahs, surahName, surahNumber, reciterName, reciterFolder, onRecitationSaved }) {
  const [state, setState] = useState("idle"); // idle, recording, analyzing, transcribing, result, error
  const [recordingTime, setRecordingTime] = useState(0);
  const [currentAyahIdx, setCurrentAyahIdx] = useState(0);
  const [results, setResults] = useState(null);
  const [tajweedResult, setTajweedResult] = useState(null);
  const [tajweedUnavailableMsg, setTajweedUnavailableMsg] = useState(null);
  const [tajweedPending, setTajweedPending] = useState(false);
  const [envelope, setEnvelope] = useState(null);
  const [modelProgress, setModelProgress] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [micCheckResult, setMicCheckResult] = useState(null);
  const [micChecking, setMicChecking] = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [playheadSec, setPlayheadSec] = useState(null);
  const [compareUrl, setCompareUrl] = useState(null);
  const [uploadAyahCount, setUploadAyahCount] = useState(ayahs?.length || 1);
  const [overrideCount, setOverrideCount] = useState("");
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);
  const lastBlobRef = useRef(null);
  const lastElapsedRef = useRef(null);
  const lastPersistRef = useRef(null);
  const lastAsrRef = useRef(null); // last ASR result (or null) — reused on override rescoring
  const runSeqRef = useRef(0); // invalidates background Tajweed work from a previous run/reset

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
    };
  }, []);

  useEffect(() => {
    if (!open) {
      resetState();
    }
  }, [open]);

  // TEMP (mobile reload diagnosis): stamp every state change into the
  // persisted lifecycle log so a post-reload log shows exactly where the
  // session died. Remove with lifecycleDebug.js.
  useEffect(() => {
    setLifecyclePhase(open ? `continuous:${state}` : "idle");
  }, [state, open]);

  const resetState = () => {
    runSeqRef.current++; // orphan any in-flight background Tajweed UI updates
    setState("idle");
    setRecordingTime(0);
    setCurrentAyahIdx(0);
    setResults(null);
    setTajweedResult(null);
    setTajweedUnavailableMsg(null);
    setTajweedPending(false);
    setEnvelope(null);
    setModelProgress(null);
    setErrorMessage("");
    setMicCheckResult(null);
    setMicChecking(false);
    setConfidence(null);
    setOverrideCount("");
    lastBlobRef.current = null;
    setCompareUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    setPlayheadSec(null);
    lastElapsedRef.current = null;
    lastPersistRef.current = null;
    lastAsrRef.current = null;
    chunksRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  const handleMicCheck = async () => {
    setMicChecking(true);
    setMicCheckResult(null);
    try {
      const result = await runMicCheck();
      setMicCheckResult(result);
    } catch (err) {
      setMicCheckResult({ verdict: "silent", message: "Couldn't access your microphone to test it — check permissions." });
    } finally {
      setMicChecking(false);
    }
  };

  const startRecording = async () => {
    try {
      // Disable the browser's mic auto-processing: AGC ramping the gain
      // mid-recitation distorts the loudness contour we score against, and
      // noise suppression/echo cancellation are tuned for speech calls, not
      // recitation analysis.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          autoGainControl: false,
          noiseSuppression: false,
          echoCancellation: false,
        },
      });
      // Some devices ignore these constraints — log what was actually applied.
      const trackSettings = stream.getAudioTracks()[0]?.getSettings?.() || {};
      console.log("[tilawah] mic settings applied:", {
        autoGainControl: trackSettings.autoGainControl,
        noiseSuppression: trackSettings.noiseSuppression,
        echoCancellation: trackSettings.echoCancellation,
      });
      streamRef.current = stream;
      const mimeType = getSupportedRecorderMimeType();
      const mediaRecorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      mediaRecorderRef.current = mediaRecorder;
      chunksRef.current = [];

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.start(100);
      setState("recording");
      setRecordingTime(0);
      setCurrentAyahIdx(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage("Couldn't access your microphone. Please check permissions and try again.");
      setState("error");
    }
  };

  // Shared analysis pipeline: decode -> bounded ASR transcription (runs
  // concurrently with the reference-audio fetch) -> ayah-count resolution
  // (transcript first, duration fallback) -> DSP compare -> persist ->
  // Tajweed (reusing the same transcript). Used for a freshly-stopped live
  // recording, an uploaded file, and a manual ayah-count override re-run
  // (elapsedSeconds is null for the upload case, since there's no
  // recording timer to read from — it's derived from the decoded audio's
  // actual length instead).
  const runAnalysis = async (blob, taggedCount, elapsedSeconds, { searchMargin, manualOverride = false, cachedAsrResult } = {}) => {
    const runId = ++runSeqRef.current;
    const isCurrentRun = () => runSeqRef.current === runId;
    const asrGate = describeAsrGate();
    const asrEnabled = asrGate.enabled;
    // Persisted: "Tajweed unavailable" has looked identical whether ASR was
    // deliberately skipped or actually failed — this names the decision.
    recordLifecycleEvent("asr-gate", `${asrEnabled ? "ASR will run" : "ASR skipped"} — ${asrGate.reason}`);
    setState("analyzing");
    let result;
    let userSamples;
    let recitedAyahs;
    let actualDurationSeconds;
    let transcriptPromise;
    try {
      userSamples = await decodeUserRecording(blob);
      setEnvelope(getVisualizationEnvelope(userSamples));
      actualDurationSeconds = elapsedSeconds ?? Math.round(userSamples.length / TARGET_SAMPLE_RATE);
      setRecordingTime(actualDurationSeconds);
      // ASR sequencing is memory-aware (mobile tabs OOM at model/session
      // creation — confirmed on-device):
      //  - model already warm this session: start transcription now; it can
      //    resolve the ayah count within the budget and the creation spike
      //    is already behind us.
      //  - cold model (or ASR disabled): do NOT start it here — the DSP
      //    step below holds the decoded reference-ayah buffers, and they
      //    must be released (function return -> GC) before the model loads.
      //    Transcription then starts AFTER the result is shown, holding
      //    only the user's own samples.
      // Override re-runs pass the cached transcript instead.
      if (cachedAsrResult !== undefined) {
        transcriptPromise = Promise.resolve(cachedAsrResult);
      } else if (asrEnabled && isAsrModelWarm()) {
        transcriptPromise = transcribeUserRecording(userSamples, (pct) => { if (isCurrentRun()) setModelProgress(pct); });
      } else {
        transcriptPromise = null;
      }
      result = await analyzeContinuousRecitation({
        userSamples,
        reciterFolder,
        surahNumber,
        allAyahNumbers: ayahs.map(a => a.number),
        allAyahTexts: ayahs.map(a => a.arabic),
        transcriptPromise,
        taggedCount,
        ...(searchMargin != null ? { searchMargin } : {}),
        manualOverride,
      });
      recitedAyahs = ayahs.slice(0, result.resolvedAyahCount || taggedCount);
      setResults({ ...result, recitedCount: recitedAyahs.length });
    } catch (err) {
      console.error(err);
      // Persist the real reason: "something went wrong" alone made failures
      // undiagnosable outside DevTools (the log survives reloads; Settings
      // shows it under "Lifecycle debug log").
      const detail = err?.message || String(err);
      const frame = String(err?.stack || "").split("\n").find((l) => l.trimStart().startsWith("at "));
      recordLifecycleEvent("analysis-error", frame ? `${detail} | ${frame.trim()}` : detail);
      setErrorMessage(`Something went wrong analyzing your recording. Please try again. (${detail})`);
      setState("error");
      return;
    }

    // Persist the acoustic score NOW, before the ASR stage: Tajweed is a
    // bonus layer, and saving the attempt must not depend on transcription
    // surviving (a model failure, crash, or reload mid-transcription used
    // to lose the whole attempt).
    let persisted = null;
    try {
      persisted = await persistRecitationResult({
        surahNumber,
        surahName,
        ayahs: recitedAyahs,
        reciterName,
        result,
        durationSeconds: actualDurationSeconds,
        tajweedResult: null,
      });
      lastBlobRef.current = blob;
      setCompareUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(blob); });
      lastElapsedRef.current = actualDurationSeconds;
      lastPersistRef.current = persisted;
      onRecitationSaved?.();
    } catch (err) {
      // Saving failed but the analysis itself is fine — still show it.
      console.error("Couldn't save the recitation attempt:", err);
    }

    // Show the result NOW — the score is earned and persisted; Tajweed
    // finishes in the background below (or is skipped entirely when ASR is
    // disabled — the crash-proof safety net for devices where the model
    // load itself kills the tab).
    setTajweedResult(null);
    setTajweedUnavailableMsg(null);
    setTajweedPending(asrEnabled);
    console.log(`[tilawah] continuous result ready: score=${result.score} (Tajweed ${asrEnabled ? "continuing in background" : "skipped — ASR disabled"})`);
    setState("result");

    if (!asrEnabled) {
      setConfidence(assessRecitationConfidence({ dspResult: result, tajweedResult: null }));
      return;
    }

    (async () => {
      let tajweed = null;
      try {
        // Cold model: transcription starts only now — the DSP step above
        // has returned, so the reference-ayah buffers are unreachable and
        // GC-eligible before the model's session-creation memory spike.
        const asrPromise = transcriptPromise
          ?? transcribeUserRecording(userSamples, (pct) => { if (isCurrentRun()) setModelProgress(pct); });
        const asrResult = await asrPromise;
        if (isCurrentRun()) lastAsrRef.current = asrResult ?? null;
        if (asrResult) {
          const combinedAyahText = recitedAyahs.map(a => a.arabic).join(" ");
          tajweed = await runTajweedAnalysis({
            userSamples,
            ayahArabicText: combinedAyahText,
            asrResult,
          });
        }
      } catch (err) {
        console.error("Background Tajweed stage failed — result stands without it:", err);
        recordLifecycleEvent("tajweed-error", `background stage threw: ${err?.message || err}`);
      }
      // On failure, name WHY (recorded by the transcription/analysis layer)
      // — "unavailable" alone confirmed the fallback fired but diagnosed
      // nothing.
      const asrFailure = tajweed ? null : getLastAsrFailure();
      recordLifecycleEvent(
        "tajweed-result",
        tajweed ? `${tajweed.ruleChecks?.length ?? 0} rule checks` : `unavailable (${describeAsrFailureForLog(asrFailure)})`
      );

      // The storage update is valid even if the modal was closed meanwhile.
      if (tajweed && persisted) {
        const combinedFeedback = [
          ...result.feedback,
          ...tajweed.wordFeedback,
          ...tajweed.ruleChecks.filter(r => r.verdict === "warn").map(r => `${r.label}: ${r.note}`),
        ];
        try {
          await attachTajweedToLogs({ logIds: persisted.logIds, feedback: combinedFeedback, tajweedResult: tajweed });
        } catch (err) {
          console.error("Couldn't attach Tajweed details to the saved attempt:", err);
        }
      }

      if (!isCurrentRun()) return; // modal was reset/closed — skip UI updates
      setTajweedResult(tajweed);
      setTajweedUnavailableMsg(tajweed ? null : describeAsrFailureForUser(asrFailure));
      setModelProgress(null);
      setTajweedPending(false);
      setConfidence(assessRecitationConfidence({ dspResult: result, tajweedResult: tajweed }));
    })();
  };

  const stopRecording = async () => {
    if (timerRef.current) clearInterval(timerRef.current);

    const recorder = mediaRecorderRef.current;
    const stream = streamRef.current;
    const taggedCount = currentAyahIdx + 1; // based on "Next Ayah" taps — may be imprecise
    const finalRecordingTime = recordingTime;
    const mimeType = recorder?.mimeType || "audio/webm";

    const blobPromise = new Promise((resolve) => {
      if (recorder && recorder.state === 'recording') {
        recorder.onstop = () => {
          resolve(new Blob(chunksRef.current, { type: mimeType }));
        };
        recorder.stop();
      } else {
        resolve(new Blob(chunksRef.current, { type: mimeType }));
      }
    });

    if (stream) stream.getTracks().forEach(t => t.stop());

    const audioBlob = await blobPromise;
    // Release the raw recorder chunks — the blob holds the bytes now, and
    // every MB freed before the ASR model loads matters on mobile.
    chunksRef.current = [];
    await runAnalysis(audioBlob, taggedCount, finalRecordingTime);
  };

  // Uploads a recording that already contains multiple ayahs. There's no
  // "Next Ayah" tap trail to infer a count from, so the person tells us how
  // many ayahs are in it directly — that becomes the tagged count, and the
  // same duration-matching correction still runs on top of it.
  const handleFileUpload = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await runAnalysis(file, uploadAyahCount, null);
  };

  // The auto-detected ayah count is a best guess from duration matching —
  // it can be wrong (e.g. a long mid-recitation pause throws off the
  // match). This lets the user say "actually it was N ayahs" and re-scores
  // against exactly that count, replacing the previously-logged attempt.
  const handleOverrideSubmit = async () => {
    const n = parseInt(overrideCount, 10);
    if (!Number.isFinite(n) || n < 1 || n > ayahs.length || !lastBlobRef.current) return;
    recordLifecycleEvent(
      "recalculate",
      `override count=${n}, cached transcript=${lastAsrRef.current ? "yes" : "no"} — releasing the ASR worker's wasm heap before re-analysis`
    );
    // Confirmed on-device OOM: the re-run decodes the recording AND all
    // reference ayahs again, and doing that on top of the still-resident
    // Whisper model (wasm memory never shrinks) tips phones over the same
    // limit the first pass survived — the first pass only survived because
    // the reference buffers were freed BEFORE the model loaded, an ordering
    // a warm second pass inverts. Terminate the worker first: the re-run
    // doesn't need it (Tajweed re-runs from the cached transcript on the
    // main thread), and this also cancels any still-running orphaned
    // inference from the first pass. The next fresh recording simply
    // reloads the model cold, in the safe order.
    resetAsrWorker("Speech-recognition worker was released to free memory for a recalculation");
    if (lastPersistRef.current) {
      await revertRecitationResult(lastPersistRef.current);
    }
    await runAnalysis(lastBlobRef.current, n, lastElapsedRef.current, {
      searchMargin: 0,
      manualOverride: true,
      // Same audio — reuse the transcript instead of re-transcribing.
      cachedAsrResult: lastAsrRef.current,
    });
  };

  const advanceAyah = () => {
    if (currentAyahIdx < ayahs.length - 1) {
      setCurrentAyahIdx(prev => prev + 1);
    }
  };

  const formatTime = (secs) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const getScoreColor = (score) => {
    if (score >= 90) return "text-emerald-400";
    if (score >= 75) return "text-amber-400";
    return "text-orange-400";
  };

  const getScoreGlow = (score) => {
    if (score >= 90) return "shadow-emerald-500/30";
    if (score >= 75) return "shadow-amber-500/30";
    return "shadow-orange-500/30";
  };

  const currentAyah = ayahs?.[currentAyahIdx];

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <div className="p-6 space-y-5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xl font-semibold text-white">Continuous Recitation</h3>
              <p className="text-sm text-slate-400">{surahName} · {ayahs?.length} Ayahs</p>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* No mode="wait"/exit animations: the result view must never
              wait on a previous view's exit animation to mount (a stalled
              animation wedged the UI on the analyzing spinner with the
              score already computed — see RecordingModal). */}
          <AnimatePresence>
            {state === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4">
                <div className="text-center space-y-2">
                  <p className="text-sm text-slate-400">
                    Recite the entire Surah in one go. Record once, tap "Next Ayah" as you progress, and get a full evaluation against {reciterName}'s recitation at the end.
                  </p>
                </div>
                {currentAyah && (
                  <div className="w-full bg-slate-800/50 rounded-xl p-4 border border-slate-700/30" dir="rtl">
                    <p className="text-xl text-white/90 leading-loose text-center" style={{ fontFamily: "'Scheherazade New', serif", lineHeight: "2.5" }}>
                      {currentAyah.arabic}
                    </p>
                    <p className="text-xs text-slate-500 text-center mt-2">Ayah {currentAyah.number}</p>
                  </div>
                )}
                <button onClick={startRecording} aria-label="Start continuous recording" className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center hover:bg-red-500/30 hover:border-red-400 transition-all group">
                  <Mic className="w-8 h-8 text-red-400 group-hover:text-red-300" />
                </button>
                <span className="text-xs text-slate-500">Tap to start continuous recording</span>

                <button
                  onClick={handleMicCheck}
                  disabled={micChecking}
                  className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2 disabled:opacity-50"
                >
                  {micChecking ? "Checking mic..." : "Test your mic first"}
                </button>
                {micCheckResult && (
                  <div className={`text-xs px-3 py-2 rounded-lg border max-w-xs text-center ${
                    micCheckResult.verdict === "good"
                      ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
                      : "bg-amber-500/10 text-amber-400 border-amber-500/20"
                  }`}>
                    {micCheckResult.message}
                  </div>
                )}

                <div className="flex items-center gap-2 w-full max-w-[240px]">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-[10px] text-slate-600">or</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                <div className="w-full bg-slate-800/30 rounded-xl p-3 border border-slate-700/30 space-y-2">
                  <label className="flex items-center justify-between gap-2 text-xs text-slate-400">
                    How many ayahs does the recording contain?
                    <input
                      type="number"
                      min={1}
                      max={ayahs?.length || 1}
                      value={uploadAyahCount}
                      onChange={(e) => setUploadAyahCount(clamp(parseInt(e.target.value, 10) || 1, 1, ayahs?.length || 1))}
                      className="w-16 text-center bg-slate-900 border border-slate-700 rounded-lg py-1 text-white text-sm"
                    />
                  </label>
                  <button
                    onClick={() => fileInputRef.current?.click()}
                    className="w-full flex items-center justify-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 transition-colors rounded-lg py-2"
                  >
                    <Upload className="w-3.5 h-3.5" />
                    Upload an audio file instead
                  </button>
                  <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />
                </div>
              </motion.div>
            )}

            {state === "recording" && (
              <motion.div key="recording" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-4">
                <div className="flex items-center justify-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-mono text-lg">{formatTime(recordingTime)}</span>
                </div>

                {currentAyah && (
                  <motion.div
                    key={currentAyah.number}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="w-full bg-emerald-500/10 rounded-xl p-4 border border-emerald-500/20" dir="rtl"
                  >
                    <p className="text-2xl text-emerald-200 leading-loose text-center" style={{ fontFamily: "'Scheherazade New', serif", lineHeight: "2.8" }}>
                      {currentAyah.arabic}
                    </p>
                    <p className="text-xs text-emerald-400/60 text-center mt-2">Reciting Ayah {currentAyah.number} of {ayahs.length}</p>
                  </motion.div>
                )}

                {currentAyah?.translation && (
                  <p className="text-xs text-slate-500 italic text-center px-4">{currentAyah.translation}</p>
                )}

                <div className="flex items-center gap-3">
                  {currentAyahIdx < ayahs.length - 1 ? (
                    <button
                      onClick={advanceAyah}
                      className="flex-1 py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors flex items-center justify-center gap-2 text-sm"
                    >
                      <ChevronRight className="w-4 h-4" />
                      Next Ayah
                    </button>
                  ) : (
                    <div className="flex-1 py-3 rounded-xl bg-emerald-500/10 text-emerald-400 font-medium flex items-center justify-center gap-2 text-sm">
                      <CheckCircle2 className="w-4 h-4" />
                      All verses covered
                    </div>
                  )}
                  <button
                    onClick={stopRecording}
                    className="px-6 py-3 rounded-xl bg-red-500 text-white font-medium hover:bg-red-400 transition-colors flex items-center justify-center gap-2 text-sm shadow-lg shadow-red-500/20"
                  >
                    <Square className="w-4 h-4" />
                    Finish & Analyze
                  </button>
                </div>
                <p className="text-xs text-slate-600 text-center">Recite each verse, tap "Next Ayah" as you go, then finish for real acoustic feedback.</p>
              </motion.div>
            )}

            {state === "analyzing" && (
              <motion.div key="analyzing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-8">
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                <p className="text-sm text-slate-400">Comparing your recitation to {reciterName}...</p>
                <p className="text-xs text-slate-600">This may take a moment</p>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-4 py-8 text-center">
                <AlertTriangle className="w-10 h-10 text-orange-400" />
                <p className="text-sm text-slate-300">{errorMessage}</p>
                <button
                  onClick={resetState}
                  className="px-5 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors text-sm"
                >
                  Try Again
                </button>
              </motion.div>
            )}

            {state === "result" && results && (
              <motion.div key="result" initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-5">
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full bg-slate-800 border-2 border-slate-700 shadow-xl ${getScoreGlow(results.score)}`}>
                    <span data-testid="recitation-score" className={`text-3xl font-bold ${getScoreColor(results.score)}`}>
                      {results.score}
                    </span>
                  </div>
                  {!results.referenceAvailable && (
                    <p className="mt-2 text-xs text-amber-400/80">Reference audio unavailable — recording-quality score only</p>
                  )}
                  <p className="text-xs text-slate-500 mt-1">Recited {results.recitedCount} ayahs in {formatTime(recordingTime)}</p>
                  {results.manualOverride ? (
                    <p className="text-xs text-emerald-400/80 mt-1">Recalculated using your correction — scored against {results.resolvedAyahCount} ayahs.</p>
                  ) : results.ayahCountCorrected && (
                    <p className="text-xs text-amber-400/80 mt-1">
                      Detected {results.countMethod === "transcript" ? `${results.resolvedAyahCount} ayahs from the words recognized in your recitation` : `~${results.resolvedAyahCount} ayahs based on your recording's actual length`} (you tapped through {results.taggedAyahCount}) — scored against {results.resolvedAyahCount}.
                    </p>
                  )}
                  {confidence?.isLow && (
                    <div
                      className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 cursor-help"
                      title={confidence.reasons.join("; ")}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Low confidence in this result
                    </div>
                  )}
                </div>


                <div className="bg-slate-800/30 rounded-xl p-3 border border-slate-700/30 space-y-2">
                  <p className="text-xs text-slate-400">That count not right? Tell us how many ayahs you actually recited and we'll rescore it.</p>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min={1}
                      max={ayahs?.length || 1}
                      placeholder={String(results.recitedCount)}
                      value={overrideCount}
                      onChange={(e) => setOverrideCount(e.target.value)}
                      className="w-20 text-center bg-slate-900 border border-slate-700 rounded-lg py-1.5 text-white text-sm"
                    />
                    <button
                      onClick={handleOverrideSubmit}
                      disabled={!overrideCount}
                      className="flex-1 flex items-center justify-center gap-1.5 text-xs text-slate-300 bg-slate-800 hover:bg-slate-700 disabled:opacity-40 disabled:cursor-not-allowed transition-colors rounded-lg py-2"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      Recalculate
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {results.feedback.map((note, i) => (
                    <div key={i} className="bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/30">
                      <p className="text-sm text-slate-300 leading-relaxed">{note}</p>
                    </div>
                  ))}
                </div>

                {results.referenceAvailable && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MetricBadge label="Rhythm" value={results.alignmentScore} />
                    <MetricBadge label="Loudness" value={results.energyScore} />
                    <MetricBadge label="Pitch" value={results.pitchScore} />
                  </div>
                )}

                <WaveformTimeline envelope={envelope} ruleMarkers={tajweedResult?.ruleChecks} playheadSec={playheadSec} />

                <ComparePlayback
                  userUrl={compareUrl}
                  referenceUrls={ayahs.slice(0, results.recitedCount).map((a) => getAudioUrl(reciterFolder, surahNumber, a.number))}
                  onPlayhead={setPlayheadSec}
                />

                {tajweedPending ? (
                  <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
                    <p className="text-xs text-slate-400">
                      {modelProgress == null
                        ? "Speech recognition for Tajweed details is still running in the background..."
                        : `Downloading speech recognition model in the background... ${modelProgress}%`}
                    </p>
                  </div>
                ) : (
                  <TajweedResultsPanel tajweedResult={tajweedResult} unavailableMessage={tajweedUnavailableMsg} />
                )}

                <ResultFeedback
                  surahNumber={surahNumber}
                  surahName={surahName}
                  ayahNumbers={ayahs.slice(0, results.recitedCount).map((a) => a.number)}
                  score={results.score}
                  ruleChecks={tajweedResult?.ruleChecks || []}
                  mode="continuous"
                />

                <div className="flex gap-2">
                  <button onClick={resetState} className="flex-1 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors text-sm flex items-center justify-center gap-2">
                    <RotateCcw className="w-4 h-4" />
                    Recite Again
                  </button>
                  <button onClick={onClose} className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-colors text-sm">
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
