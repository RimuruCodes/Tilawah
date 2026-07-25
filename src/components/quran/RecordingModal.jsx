import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Play, Pause, RotateCcw, Send, Loader2, AlertTriangle, Upload } from "lucide-react";
import { Dialog, DialogContent, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { analyzeSingleAyahRecitation, persistRecitationResult, revertRecitationResult, runTajweedAnalysis, decodeUserRecording, assessRecitationConfidence, attachTajweedToLogs, getLastAsrFailure, describeAsrFailureForUser, describeAsrFailureForLog, escalateAnalysis } from "@/lib/recitationService";
import { getEscalationBudgetMs, describeEscalationOutcome } from "@/lib/escalation";
import { getVisualizationEnvelope } from "@/lib/audioAnalysis";
import { getSupportedRecorderMimeType } from "@/lib/mediaUtils";
import { runMicCheck } from "@/lib/micCheck";
import { setLifecyclePhase, recordLifecycleEvent } from "@/lib/lifecycleDebug";
import { describeAsrGate } from "@/lib/asrEngine";
import TajweedResultsPanel from "@/components/quran/TajweedResultsPanel";
import WaveformTimeline from "@/components/quran/WaveformTimeline";
import ComparePlayback from "@/components/quran/ComparePlayback";
import { getAudioUrl } from "@/lib/quranData";
import MetricBadge from "@/components/quran/MetricBadge";
import ResultFeedback from "@/components/quran/ResultFeedback";
import CelebrationOverlay, { celebrationFor } from "@/components/quran/CelebrationOverlay";
import { hapticTap, hapticSuccess } from "@/lib/haptics";

export default function RecordingModal({ open, onClose, ayah, surahName, surahNumber, reciterName, reciterFolder, onRecitationSaved }) {
  const [state, setState] = useState("idle"); // idle, recording, recorded, analyzing, transcribing, result, error
  const [recordingTime, setRecordingTime] = useState(0);
  const [audioUrl, setAudioUrl] = useState(null);
  const [audioBlob, setAudioBlob] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [tajweedResult, setTajweedResult] = useState(null);
  const [tajweedUnavailableMsg, setTajweedUnavailableMsg] = useState(null);
  const [envelope, setEnvelope] = useState(null);
  const [modelProgress, setModelProgress] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const [micCheckResult, setMicCheckResult] = useState(null);
  const [micChecking, setMicChecking] = useState(false);
  const [confidence, setConfidence] = useState(null);
  const [tajweedPending, setTajweedPending] = useState(false);
  const [escalating, setEscalating] = useState(false);
  const [escalationNote, setEscalationNote] = useState(null);
  const [celebration, setCelebration] = useState(null);
  const runSeqRef = useRef(0); // invalidates background Tajweed work from a previous run/reset
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);
  const timerRef = useRef(null);
  const audioPlaybackRef = useRef(null);
  const [isPlayingBack, setIsPlayingBack] = useState(false);
  const [playheadSec, setPlayheadSec] = useState(null);
  const streamRef = useRef(null);
  const fileInputRef = useRef(null);

  useEffect(() => {
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(t => t.stop());
      }
      if (audioPlaybackRef.current) {
        audioPlaybackRef.current.pause();
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
    setLifecyclePhase(open ? `single:${state}` : "idle");
  }, [state, open]);

  const resetState = () => {
    runSeqRef.current++; // orphan any in-flight background Tajweed UI updates
    setState("idle");
    setRecordingTime(0);
    setAudioUrl(null);
    setAudioBlob(null);
    setAnalysisResult(null);
    setTajweedResult(null);
    setTajweedUnavailableMsg(null);
    setTajweedPending(false);
    setEnvelope(null);
    setModelProgress(null);
    setErrorMessage("");
    setMicCheckResult(null);
    setMicChecking(false);
    setConfidence(null);
    setEscalating(false);
    setEscalationNote(null);
    setCelebration(null);
    chunksRef.current = [];
    if (timerRef.current) clearInterval(timerRef.current);
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
    }
  };

  // Lets someone score a recording they already have (e.g. captured on a
  // separate device) without going through speaker->mic->app, which adds
  // acoustic degradation that has nothing to do with recitation accuracy.
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    const url = URL.createObjectURL(file);
    const probe = new Audio(url);
    probe.addEventListener("loadedmetadata", () => {
      setRecordingTime(Number.isFinite(probe.duration) ? Math.round(probe.duration) : 0);
    });
    setAudioBlob(file);
    setAudioUrl(url);
    setState("recorded");
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

      mediaRecorder.onstop = () => {
        const blob = new Blob(chunksRef.current, { type: mediaRecorder.mimeType || "audio/webm" });
        // Release the raw recorder chunks — the blob holds the bytes now,
        // and every MB freed before the ASR model loads matters on mobile.
        chunksRef.current = [];
        const url = URL.createObjectURL(blob);
        setAudioBlob(blob);
        setAudioUrl(url);
        setState("recorded");
        stream.getTracks().forEach(t => t.stop());
      };

      mediaRecorder.start(100);
      setState("recording");
      setRecordingTime(0);
      timerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    } catch (err) {
      setErrorMessage("Couldn't access your microphone. Please check permissions and try again.");
      setState("error");
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state === 'recording') {
      mediaRecorderRef.current.stop();
    }
    if (timerRef.current) clearInterval(timerRef.current);
    hapticTap(); // subtle confirmation the recording stopped (no-op where unsupported)
  };

  const playBack = () => {
    if (!audioUrl) return;
    if (isPlayingBack && audioPlaybackRef.current) {
      audioPlaybackRef.current.pause();
      setIsPlayingBack(false);
      return;
    }
    const audio = new Audio(audioUrl);
    audioPlaybackRef.current = audio;
    audio.play();
    setIsPlayingBack(true);
    audio.onended = () => setIsPlayingBack(false);
  };

  const analyzeRecitation = async () => {
    const runId = ++runSeqRef.current;
    const isCurrentRun = () => runSeqRef.current === runId;
    setState("analyzing");
    let dspResult;
    let userSamples;
    try {
      userSamples = await decodeUserRecording(audioBlob);
      setEnvelope(getVisualizationEnvelope(userSamples));
      dspResult = await analyzeSingleAyahRecitation({
        userSamples,
        reciterFolder,
        reciterName,
        surahNumber,
        ayahNumber: ayah.number,
      });
      setAnalysisResult(dspResult);
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
        ayahs: [ayah],
        reciterName,
        result: dspResult,
        durationSeconds: recordingTime,
        tajweedResult: null,
      });
      onRecitationSaved?.();
      // Celebrate a personal best or streak milestone — once, on this
      // first persist (the escalation/recalc re-persists below don't
      // re-trigger it). No-op haptic where unsupported.
      const moment = celebrationFor(persisted);
      if (moment && isCurrentRun()) {
        hapticSuccess();
        setCelebration(moment);
      }
    } catch (err) {
      // Saving failed but the analysis itself is fine — still show it.
      console.error("Couldn't save the recitation attempt:", err);
    }

    // Show the result NOW — the score is earned and persisted; Tajweed
    // runs entirely in the background below (the ASR model load is exactly
    // when memory-constrained phones OOM-kill the tab, so the result
    // screen must never wait on it), or is skipped entirely when ASR is
    // disabled — the crash-proof safety net.
    const asrGate = describeAsrGate();
    const asrEnabled = asrGate.enabled;
    // Persisted: "Tajweed unavailable" has looked identical whether ASR was
    // deliberately skipped or actually failed — this names the decision.
    recordLifecycleEvent("asr-gate", `${asrEnabled ? "ASR will run" : "ASR skipped"} — ${asrGate.reason}`);
    setTajweedResult(null);
    setTajweedUnavailableMsg(null);
    setTajweedPending(asrEnabled);
    console.log(`[tilawah] single-ayah result ready: score=${dspResult.score} (Tajweed ${asrEnabled ? "continuing in background" : "skipped — ASR disabled"})`);
    setState("result");

    if (!asrEnabled) {
      setConfidence(assessRecitationConfidence({ dspResult, tajweedResult: null }));
      return;
    }

    (async () => {
      let tajweed = null;
      try {
        tajweed = await runTajweedAnalysis({
          userSamples,
          ayahArabicText: ayah.arabic,
          onModelProgress: (pct) => { if (isCurrentRun()) setModelProgress(pct); },
          referenceAlignment: dspResult.referenceAlignment,
          quaContext: { reciterFolder, surahNumber, ayahNumber: ayah.number },
        });
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
          ...dspResult.feedback,
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
      setConfidence(assessRecitationConfidence({ dspResult, tajweedResult: tajweed }));

      // Bounded confidence-seeking escalation — runs AFTER the result is
      // shown, only if the user granted a time budget. Never blocks or
      // changes the score by "retrying for a better number"; it upgrades the
      // METHOD behind a weak signal (reference fetch, ASR model) and keeps the
      // outcome only if it's genuinely more reliable.
      const budgetMs = getEscalationBudgetMs();
      if (budgetMs > 0 && isCurrentRun()) {
        setEscalating(true);
        let esc = null;
        try {
          esc = await escalateAnalysis({
            mode: "single",
            budgetMs,
            userSamples,
            dspResult,
            tajweedResult: tajweed,
            reciterFolder,
            surahNumber,
            ayahs: [ayah],
            ayahArabicText: ayah.arabic,
            onModelProgress: (pct) => { if (isCurrentRun()) setModelProgress(pct); },
            isCurrentRun,
          });
        } catch (err) {
          recordLifecycleEvent("escalation-error", `single orchestrator: ${err?.message || err}`);
        }
        if (!isCurrentRun()) return;
        setEscalating(false);
        setModelProgress(null);
        if (esc?.improved) {
          const scoreChanged = esc.dspResult !== dspResult;
          setAnalysisResult(esc.dspResult);
          setTajweedResult(esc.tajweedResult);
          setConfidence(assessRecitationConfidence({ dspResult: esc.dspResult, tajweedResult: esc.tajweedResult }));
          setEscalationNote(describeEscalationOutcome(true));
          // Keep the stored attempt honest: a changed score is reverted +
          // re-persisted (streak math stays correct); a Tajweed-only change
          // just re-attaches.
          try {
            if (scoreChanged && persisted) {
              await revertRecitationResult(persisted);
              persisted = await persistRecitationResult({
                surahNumber, surahName, ayahs: [ayah], reciterName,
                result: esc.dspResult, durationSeconds: recordingTime, tajweedResult: esc.tajweedResult,
              });
              onRecitationSaved?.();
            } else if (persisted && esc.tajweedResult) {
              const fb = [
                ...esc.dspResult.feedback,
                ...esc.tajweedResult.wordFeedback,
                ...esc.tajweedResult.ruleChecks.filter((r) => r.verdict === "warn").map((r) => `${r.label}: ${r.note}`),
              ];
              await attachTajweedToLogs({ logIds: persisted.logIds, feedback: fb, tajweedResult: esc.tajweedResult });
            }
          } catch (err) {
            console.error("Couldn't update the saved attempt after escalation:", err);
          }
        }
      }
    })();
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

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <CelebrationOverlay
          show={!!celebration}
          title={celebration?.title}
          subtitle={celebration?.subtitle}
          onDone={() => setCelebration(null)}
        />
        <div className="p-6 space-y-6">
          <div className="text-center space-y-2">
            {/* DialogTitle/Description (not bare h3/p) so the dialog has an
                accessible name — screen readers otherwise announce an
                unnamed dialog. */}
            <DialogTitle className="text-xl font-semibold text-white">Voice Comparison</DialogTitle>
            <DialogDescription className="text-sm text-slate-400">{surahName} · Ayah {ayah?.number}</DialogDescription>
          </div>

          {/* Live region: announces analysis progress/outcome to screen
              readers without re-reading the whole result view. */}
          <p className="sr-only" role="status" data-testid="a11y-status">
            {state === "analyzing"
              ? "Analyzing your recording…"
              : state === "result" && analysisResult
                ? `Analysis complete. Score ${analysisResult.score} out of 100.`
                : ""}
          </p>

          {ayah && (
            <div className="bg-slate-800/50 rounded-xl p-4 border border-slate-700/30" dir="rtl" lang="ar">
              <p className="text-xl text-white/90 leading-loose text-center" style={{ fontFamily: "var(--font-arabic)", lineHeight: "2.5" }}>
                {ayah.arabic}
              </p>
            </div>
          )}

          {/* No mode="wait" and no exit animations here: with mode="wait"
              the next view cannot mount until the previous view's exit
              animation finishes, and a stalled animation frame left the UI
              wedged on the analyzing spinner with the score already
              computed underneath (seen in e2e trace). State views swap
              instantly; only entrances animate. */}
          <AnimatePresence>
            {state === "idle" && (
              <motion.div
                key="idle"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <p className="text-sm text-slate-400 text-center">
                  Record yourself reciting this ayah. Your recording is analyzed against {reciterName}'s actual audio for this verse, plus real speech recognition for word accuracy and basic Tajweed checks (Qalqalah, Ghunnah, Madd).
                </p>

                <button
                  onClick={startRecording}
                  aria-label="Start recording"
                  className="w-20 h-20 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center hover:bg-red-500/30 hover:border-red-400 transition-all group"
                >
                  <Mic className="w-8 h-8 text-red-400 group-hover:text-red-300" />
                </button>
                <span className="text-xs text-slate-500">Tap to start recording</span>

                <div className="flex items-center gap-2 w-full max-w-[200px]">
                  <div className="h-px flex-1 bg-slate-800" />
                  <span className="text-[10px] text-slate-500">or</span>
                  <div className="h-px flex-1 bg-slate-800" />
                </div>

                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-200 underline underline-offset-2"
                >
                  <Upload className="w-3.5 h-3.5" />
                  Upload an audio file instead
                </button>
                <input ref={fileInputRef} type="file" accept="audio/*" className="hidden" onChange={handleFileUpload} />

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
              </motion.div>
            )}

            {state === "recording" && (
              <motion.div
                key="recording"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4"
              >
                <div className="relative">
                  <motion.div
                    animate={{ scale: [1, 1.2, 1] }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute inset-0 rounded-full bg-red-500/20"
                  />
                  <button
                    onClick={stopRecording}
                    aria-label="Stop recording"
                    className="relative w-20 h-20 rounded-full bg-red-500 flex items-center justify-center shadow-lg shadow-red-500/30"
                  >
                    <Square className="w-6 h-6 text-white" />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
                  <span className="text-red-400 font-mono text-lg">{formatTime(recordingTime)}</span>
                </div>
                <span className="text-xs text-slate-500">Recording... tap to stop</span>
              </motion.div>
            )}

            {state === "recorded" && (
              <motion.div
                key="recorded"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="space-y-4"
              >
                <div className="flex items-center justify-center gap-3">
                  <button
                    onClick={playBack}
                    aria-label={isPlayingBack ? "Pause playback" : "Play back your recording"}
                    className="p-3 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    {isPlayingBack ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5" />}
                  </button>
                  <div className="text-sm text-slate-400 font-mono">{formatTime(recordingTime)}</div>
                  <button
                    onClick={resetState}
                    aria-label="Discard recording and start over"
                    className="p-3 rounded-xl bg-slate-700/50 text-slate-300 hover:bg-slate-700 transition-colors"
                  >
                    <RotateCcw className="w-5 h-5" />
                  </button>
                </div>

                <button
                  onClick={analyzeRecitation}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20"
                >
                  <Send className="w-4 h-4" />
                  Analyze My Recitation
                </button>
              </motion.div>
            )}

            {state === "analyzing" && (
              <motion.div
                key="analyzing"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4 py-6"
              >
                <Loader2 className="w-10 h-10 text-emerald-400 animate-spin" />
                <p className="text-sm text-slate-400">Listening to your recording and comparing it to {reciterName}...</p>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div
                key="error"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                className="flex flex-col items-center gap-4 py-6 text-center"
              >
                <AlertTriangle className="w-10 h-10 text-orange-400" />
                {/* role="alert" so the error is announced immediately by
                    screen readers, from the same element that shows it. */}
                <p className="text-sm text-slate-300" role="alert">{errorMessage}</p>
                <button
                  onClick={resetState}
                  className="px-5 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors text-sm"
                >
                  Try Again
                </button>
              </motion.div>
            )}

            {state === "result" && analysisResult && (
              <motion.div
                key="result"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="space-y-5"
              >
                <div className="text-center">
                  <div className={`inline-flex items-center justify-center w-24 h-24 rounded-full bg-slate-800 border-2 border-slate-700 shadow-xl ${getScoreGlow(analysisResult.score)}`}>
                    <span data-testid="recitation-score" className={`text-3xl font-bold ${getScoreColor(analysisResult.score)}`}>
                      {analysisResult.score}
                    </span>
                  </div>
                  {!analysisResult.referenceAvailable && (
                    <p className="mt-2 text-xs text-amber-400/80">Reference audio unavailable — recording-quality score only</p>
                  )}
                  {analysisResult.referenceAvailable && (
                    <p className="mt-2 text-xs text-slate-500">
                      You: {analysisResult.userDuration}s · {analysisResult.reciterUsed || reciterName}: {analysisResult.referenceDuration}s
                    </p>
                  )}
                  {confidence?.isLow && (
                    <div
                      className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-amber-400/80 bg-amber-500/10 border border-amber-500/20 rounded-full px-2.5 py-1 cursor-help"
                      title={confidence.reasons.join("; ")}
                      aria-label={`Low confidence in this result: ${confidence.reasons.join("; ")}`}
                    >
                      <AlertTriangle className="w-3 h-3" />
                      Low confidence in this result
                    </div>
                  )}
                </div>

                <div className="space-y-2">
                  {analysisResult.feedback.map((note, i) => (
                    <div key={i} className="bg-slate-800/50 rounded-xl p-3.5 border border-slate-700/30">
                      <p className="text-sm text-slate-300 leading-relaxed">{note}</p>
                    </div>
                  ))}
                </div>

                {analysisResult.referenceAvailable && (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    <MetricBadge label="Rhythm" value={analysisResult.alignmentScore} />
                    <MetricBadge label="Loudness" value={analysisResult.energyScore} />
                    <MetricBadge label="Pitch" value={analysisResult.pitchScore} />
                  </div>
                )}

                <WaveformTimeline envelope={envelope} ruleMarkers={tajweedResult?.ruleChecks} playheadSec={playheadSec} />

                <ComparePlayback
                  userUrl={audioUrl}
                  referenceUrls={[getAudioUrl(reciterFolder, surahNumber, ayah.number)]}
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

                {escalating && (
                  <div className="flex items-center gap-2 bg-slate-800/40 border border-slate-700/30 rounded-xl p-3">
                    <Loader2 className="w-4 h-4 text-emerald-400 animate-spin flex-shrink-0" />
                    <p className="text-xs text-slate-400" role="status">
                      {modelProgress == null
                        ? "Double-checking for a more reliable reading…"
                        : `Loading a more accurate model to double-check… ${modelProgress}%`}
                    </p>
                  </div>
                )}
                {escalationNote && !escalating && (
                  <p className="text-[11px] text-emerald-400/80 text-center" role="status">{escalationNote}</p>
                )}

                <ResultFeedback
                  surahNumber={surahNumber}
                  surahName={surahName}
                  ayahNumbers={[ayah?.number]}
                  score={analysisResult.score}
                  ruleChecks={tajweedResult?.ruleChecks || []}
                  mode="single"
                />

                <div className="flex gap-2">
                  <button
                    onClick={resetState}
                    className="flex-1 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors text-sm"
                  >
                    Try Again
                  </button>
                  <button
                    onClick={onClose}
                    className="flex-1 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-colors text-sm"
                  >
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
