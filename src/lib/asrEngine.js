// Main-thread interface to the ASR worker. Keeps a single worker + tracks
// in-flight requests by id so multiple callers don't collide.
import { recordLifecycleEvent } from "@/lib/lifecycleDebug";
import { describeMemoryCheckpoint } from "@/lib/memoryLedger";

const MODEL_PREF_KEY = "qc_asr_model_pref"; // "fast" | "accurate"

// TEMP DIAGNOSTIC (mobile OOM investigation, 2026-07): force the tiny
// model for EVERY device, bypassing preference and device detection. If
// the tab kill stops with this on, the crash is conclusively model-size
// driven; if it persists, the bottleneck is elsewhere (wasm runtime
// baseline, decode buffers). Only affects which model the worker loads —
// getAsrModelPreference (and the Settings UI) stay truthful, and the
// asr-load-start lifecycle event names the actually-loaded model.
const FORCE_FAST_MODEL_DIAGNOSTIC = true;

// Keep ids in sync with ASR_MODELS in src/workers/asrWorker.js (see the
// comment there for why the accurate slot is currently generic whisper-base
// rather than a Quran fine-tune).
export const ASR_MODEL_OPTIONS = {
  fast: { id: "Xenova/whisper-tiny", label: "Fast (~40MB, generic Arabic, less accurate)" },
  accurate: { id: "onnx-community/whisper-base_timestamped", label: "More accurate (~80MB, recommended)" },
};

// Default model for devices with no saved preference: phones and
// low-memory devices get the tiny model. Loading the ~80MB base model
// into WASM memory OOM-kills mobile Chrome tabs (confirmed on-device via
// video, 2026-07) — completing with the smaller model beats crashing
// while trying to be more accurate. An explicit choice in Settings always
// wins. (navigator.deviceMemory is Chrome-only and capped at 8; treat
// missing values as "not low-memory".)
export function defaultAsrModelPreference({ userAgent, deviceMemory } = {}) {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  const mem = deviceMemory ?? (typeof navigator !== "undefined" ? navigator.deviceMemory : undefined);
  const isMobile = /Android|iPhone|iPad|Mobile/i.test(ua || "");
  const lowMemory = typeof mem === "number" && mem <= 4;
  return isMobile || lowMemory ? "fast" : "accurate";
}

export function getAsrModelPreference() {
  const stored = localStorage.getItem(MODEL_PREF_KEY);
  if (stored === "fast" || stored === "accurate") return stored;
  return defaultAsrModelPreference();
}

// ---- ASR on/off (the crash-proof safety net) -------------------------
// A dead tab can't catch its own errors, so on devices where the ASR
// stage is known-hostile the only real protection is not starting it.
// The acoustic DSP score works everywhere and is never affected.

const ASR_ENABLED_KEY = "qc_asr_enabled"; // "on" | "off" — explicit user choice
// Set by lifecycleDebug when a previous session died during an asr-* stage.
export const ASR_CRASH_SUSPECT_KEY = "qc_asr_crash_suspected";

// iOS/WebKit detection, on the MAIN thread deliberately: the worker can't
// tell iPadOS from macOS (its navigator lacks maxTouchPoints), so the
// worker is told rather than left to guess.
export function isIosWebKit({ userAgent } = {}) {
  const ua = userAgent ?? (typeof navigator !== "undefined" ? navigator.userAgent : "");
  // iPadOS 13+ masquerades as Macintosh; maxTouchPoints betrays it.
  return (
    /iPhone|iPad|iPod/i.test(ua || "") ||
    (/Macintosh/.test(ua || "") && typeof navigator !== "undefined" && navigator.maxTouchPoints > 1)
  );
}

// Pure default: ASR off on iOS/WebKit (tighter wasm memory limits) and on
// any device where a previous session died mid-ASR. An explicit Settings
// choice always wins over this.
export function defaultAsrEnabled({ userAgent, crashSuspected } = {}) {
  if (crashSuspected) return false;
  return !isIosWebKit({ userAgent });
}

export function isAsrEnabled() {
  const stored = localStorage.getItem(ASR_ENABLED_KEY);
  if (stored === "on") return true;
  if (stored === "off") return false;
  return defaultAsrEnabled({ crashSuspected: !!localStorage.getItem(ASR_CRASH_SUSPECT_KEY) });
}

export function setAsrEnabled(on) {
  localStorage.setItem(ASR_ENABLED_KEY, on ? "on" : "off");
}

// Same decision as isAsrEnabled(), but with the WHY attached — the
// lifecycle log must show the reason speech recognition didn't run
// (deliberate skip vs failure), not just that Tajweed came out empty.
export function describeAsrGate() {
  const stored = localStorage.getItem(ASR_ENABLED_KEY);
  if (stored === "on") return { enabled: true, reason: "explicitly enabled in Settings" };
  if (stored === "off") return { enabled: false, reason: "explicitly disabled in Settings" };
  const suspect = localStorage.getItem(ASR_CRASH_SUSPECT_KEY);
  if (suspect) return { enabled: false, reason: `default off — a previous session died mid-ASR (${suspect})` };
  const enabled = defaultAsrEnabled({});
  return {
    enabled,
    reason: enabled
      ? "default on for this device"
      : "default off — iOS/WebKit device (tighter wasm memory limits); can be enabled in Settings",
  };
}

// True once a model finished loading in this page-session — after that the
// session-creation memory spike is behind us and it's safe to overlap ASR
// with other memory-hungry work (reference-audio buffers).
let modelWarm = false;
export function isAsrModelWarm() {
  return modelWarm;
}

export function setAsrModelPreference(pref) {
  localStorage.setItem(MODEL_PREF_KEY, pref === "fast" ? "fast" : "accurate");
}

function currentModelId() {
  if (FORCE_FAST_MODEL_DIAGNOSTIC) return ASR_MODEL_OPTIONS.fast.id;
  return ASR_MODEL_OPTIONS[getAsrModelPreference()].id;
}

let worker = null;
let nextId = 1;
const pending = new Map(); // id -> { resolve, reject, onProgress }

function rejectAllPending(message) {
  for (const [id, entry] of pending) {
    entry.reject(new Error(message));
    pending.delete(id);
  }
}

function getWorker() {
  if (!worker) {
    worker = new Worker(new URL("../workers/asrWorker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event) => {
      const { id, type } = event.data;
      // Worker-side diagnostics (chosen execution provider, heap where
      // measurable) — persisted so a tab killed at session creation leaves
      // them as evidence. Not tied to any pending request.
      if (type === "diag") {
        recordLifecycleEvent("asr-diag", event.data.note);
        return;
      }
      const entry = pending.get(id);
      if (!entry) return;

      if (type === "progress") {
        entry.onProgress?.(event.data.pct);
      } else if (type === "loaded") {
        entry.resolve();
        pending.delete(id);
      } else if (type === "result") {
        entry.resolve(event.data.result);
        pending.delete(id);
      } else if (type === "error") {
        entry.reject(new Error(event.data.message));
        pending.delete(id);
      }
    };
    // Without these, a worker that fails to even load (e.g. its script URL
    // is stale after a redeploy) leaves every pending promise hanging and
    // the UI stuck on "transcribing" forever.
    worker.onerror = (event) => {
      const message = event?.message || "Speech-recognition worker failed to load";
      console.error("ASR worker error:", message);
      rejectAllPending(message);
      modelWarm = false; // the model dies with the worker
      // The worker is unusable — drop it so a later attempt can recreate it
      // (e.g. after the page picks up fresh assets).
      worker.terminate?.();
      worker = null;
    };
    worker.onmessageerror = () => {
      // A message failed to (de)serialize; we can't tell which request it
      // belonged to, so unblock everything rather than hang.
      rejectAllPending("Speech-recognition worker message failed to deserialize");
    };
  }
  return worker;
}

// Terminates the worker so the next attempt starts clean instead of
// queueing behind a dead one — used for a wedged worker (wasm stalled
// without erroring — seen under mobile memory pressure) and to force-release
// the model's wasm heap before a memory-heavy re-analysis (wasm memory
// never shrinks; termination is the only way to give it back). Pending
// calls are rejected with the given reason, never left hanging.
export function resetAsrWorker(reason = "Speech-recognition worker was reset after stalling") {
  rejectAllPending(reason);
  modelWarm = false; // the model dies with the worker
  if (worker) {
    worker.terminate();
    worker = null;
  }
}

// Downloads/caches the ASR model (a few dozen to ~150MB, cached by the
// browser after first use). Safe to call repeatedly; resolves immediately
// once already loaded. Uses whichever model is currently preferred.
export function ensureAsrModelLoaded(onProgress) {
  const w = getWorker();
  const id = nextId++;
  const modelId = currentModelId();
  // Fine-grained OOM checkpoints: the lifecycle log persists across a tab
  // kill, so whichever of these is the LAST entry pinpoints the crash line.
  recordLifecycleEvent("asr-load-start", `${modelId} (pref=${getAsrModelPreference()}${FORCE_FAST_MODEL_DIAGNOSTIC ? ", FORCED fast" : ""})`);
  let sawFirstProgress = false;
  let sawDownloadComplete = false;
  const trackedProgress = (pct) => {
    if (!sawFirstProgress) {
      sawFirstProgress = true;
      recordLifecycleEvent("asr-download-started", `${modelId} at ${pct}%`);
    }
    if (pct >= 100 && !sawDownloadComplete) {
      sawDownloadComplete = true;
      // The ledger names what the app itself still references at the exact
      // moment the spike starts — if the tab dies on the next line, this is
      // the memory evidence (iOS has no heap API; self-accounting is all).
      recordLifecycleEvent(
        "asr-download-complete",
        `${modelId} — creating inference session next (the memory spike); ${describeMemoryCheckpoint()}`
      );
    }
    onProgress?.(pct);
  };
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: () => {
        modelWarm = true;
        recordLifecycleEvent("asr-load-complete", `${modelId} — session created, model in memory`);
        resolve();
      },
      reject: (err) => {
        recordLifecycleEvent("asr-load-error", `${modelId}: ${err?.message || err}`);
        reject(err);
      },
      onProgress: trackedProgress,
    });
    w.postMessage({ id, type: "load", modelId, allowWebGpu: !isIosWebKit() });
  });
}

// Transcribes mono Float32Array audio (16kHz) and returns Whisper's result:
// { text, chunks: [{ text, timestamp: [start, end] }, ...] }
export function transcribeAudio(monoSamples16k, onProgress) {
  const w = getWorker();
  const id = nextId++;
  recordLifecycleEvent(
    "asr-inference-start",
    `${(monoSamples16k.length / 16000).toFixed(1)}s of audio; ${describeMemoryCheckpoint()}`
  );
  return new Promise((resolve, reject) => {
    pending.set(id, {
      resolve: (result) => {
        recordLifecycleEvent("asr-inference-complete", `${result?.chunks?.length ?? 0} word chunks`);
        resolve(result);
      },
      reject: (err) => {
        recordLifecycleEvent("asr-inference-error", String(err?.message || err));
        reject(err);
      },
      onProgress,
    });
    // Transfer the underlying buffer to avoid copying large arrays.
    const audio = Float32Array.from(monoSamples16k);
    w.postMessage({ id, type: "transcribe", modelId: currentModelId(), audio }, [audio.buffer]);
  });
}
