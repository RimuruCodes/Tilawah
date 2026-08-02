// Runs actual speech recognition (Whisper, via transformers.js/ONNX
// Runtime Web) entirely in the browser, in a worker so model download +
// inference don't freeze the recording UI.
//
// The "accurate" model is a Quran-specific fine-tune of Whisper
// (tarteel-ai/whisper-base-ar-quran), converted to ONNX for browser use.
// The "fast" model is a smaller, general-purpose multilingual Whisper
// checkpoint as a lighter-weight fallback.
import { pipeline, env } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { createModelCache } from "@/lib/asrModelCache";

// Single-threaded WASM, explicitly: the threaded build pre-allocates
// per-thread stacks and SharedArrayBuffer memory up front — fixed overhead
// that contributes to the mobile OOM at session creation independent of
// model size. We serve no COOP/COEP headers so SAB is unavailable anyway;
// pinning numThreads avoids any threaded pre-allocation attempt.
if (env?.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

// Word-level timestamps (which the Tajweed windowing depends on) require a
// decoder exported with cross-attention outputs. As of 2026-07 this is a
// real, from-scratch export of tarteel-ai/whisper-base-ar-quran (encoder +
// decoder + decoder-with-past, generation_config baked in at export time —
// see tools/qdat-eval/README.md "Converting the Quran-tuned model yourself"
// for the recipe and the exact toolchain pitfalls it took to get a working
// build). This replaces both the earlier generic-model fallback and an
// even earlier An0xity export that shipped an encoder only and couldn't
// even load — that name is reused here for the same HF account, now with a
// real decoder.
export const ASR_MODELS = {
  fast: { id: "Xenova/whisper-tiny", label: "Fast (smaller download, generic Arabic)" },
  accurate: {
    id: "An0xity/whisper-base-ar-quran-onnx-timestamped",
    label: "More accurate (larger download, Quran-tuned Arabic)",
  },
};

// Diagnostic breadcrumbs relayed to the main thread's persisted lifecycle
// log (workers can't touch localStorage) — a tab killed during session
// creation leaves these as its last words.
function postDiag(note) {
  self.postMessage({ type: "diag", note });
}

function heapNote() {
  // Chrome-only; iOS Safari exposes no heap measurement API at all.
  const mem = self.performance?.memory;
  return mem
    ? `jsHeap=${Math.round(mem.usedJSHeapSize / 1048576)}MB used of ${Math.round(mem.jsHeapSizeLimit / 1048576)}MB limit`
    : "jsHeap=unmeasurable on this browser";
}

async function detectDevice(allowWebGpu) {
  // WebGPU is refused outright on iOS/WebKit (the main thread decides —
  // worker UAs can't detect iPadOS masquerading as macOS): transformers.js
  // loads FP32 weights on webgpu (only the wasm device defaults to q8 —
  // see DEFAULT_DEVICE_DTYPE_MAPPING in its utils/dtypes.js), so
  // "whisper-tiny" was really ~150MB of weights there, and every
  // memory mitigation in this file (q8, single thread, arena off) only
  // applies to the wasm path. A webgpu session creation that OOM-kills the
  // tab also can't be caught by the try/catch fallback below — the tab
  // dies instead of throwing — so on the memory-tightest platform the
  // known-bounded wasm path is the only sane choice.
  if (!allowWebGpu) return "wasm";
  // `navigator.gpu` existing does NOT mean a usable GPU exists — headless
  // browsers and blocklisted GPUs expose the API but return no adapter, and
  // ONNX Runtime Web does not fall back to WASM on its own (it fails with
  // "no available backend found", killing all Tajweed/word feedback). So
  // actually probe for an adapter before committing to webgpu.
  try {
    if (typeof self !== "undefined" && self.navigator?.gpu) {
      const adapter = await self.navigator.gpu.requestAdapter();
      if (adapter) return "webgpu";
    }
  } catch {
    // fall through to wasm
  }
  return "wasm";
}

// WASM needs two workarounds, both verified against onnxruntime-web's
// "Missing required scale ... MatMulNBits" session-creation failure: the
// 8-bit export (same dtype the offline eval harness validated), and graph
// optimization capped at "basic" — the extended-level DQ->MatMulNBits
// fusion misfires on these quantized weights.
//
// The remaining options all trade inference speed for a lower peak at
// session creation, which is where memory-tight tabs die:
//  - enableCpuMemArena=false: the arena grows in doubling chunks and
//    over-reserves; direct allocation tracks actual need.
//  - enableMemPattern=false: pattern planning pre-allocates the inferred
//    peak up front instead of incrementally.
//  - disable_prepacking: prepacking keeps a SECOND, kernel-shaped copy of
//    MatMul weights alongside the originals.
//  - use_device_allocator_for_initializers: weights bypass the arena so
//    they can't trigger an oversized arena growth.
const wasmOptions = {
  device: "wasm",
  dtype: "q8",
  session_options: {
    graphOptimizationLevel: "basic",
    enableCpuMemArena: false,
    enableMemPattern: false,
    extra: {
      session: {
        disable_prepacking: "1",
        use_device_allocator_for_initializers: "1",
      },
    },
  },
};

// The actual "how to load model X" logic — the impure half of what used to
// be one large getTranscriber function. Separated (2026-08-01 code audit)
// from the cache/eviction mechanics below (see asrModelCache.js) so the
// caching logic itself is unit-testable without a real Worker, real model
// downloads, or real timers.
async function loadTranscriber(modelId, onProgress, allowWebGpu) {
  const progress_callback = (data) => {
    if (data?.status === "progress" && typeof data.progress === "number") {
      onProgress?.(Math.round(data.progress));
    }
  };
  const device = await detectDevice(allowWebGpu);
  // Last words before the spike: which execution provider + dtype is about
  // to create the session, and the heap where measurable.
  postDiag(
    device === "wasm"
      ? `execution provider: wasm (dtype q8, 1 thread, arena+prepacking off); ${heapNote()}`
      : `execution provider: webgpu (dtype fp32 — transformers.js default for webgpu); ${heapNote()}`
  );
  let transcriber;
  try {
    const options = device === "wasm" ? wasmOptions : { device };
    transcriber = await pipeline("automatic-speech-recognition", modelId, { ...options, progress_callback });
  } catch (err) {
    // Even with an adapter, webgpu session creation can still fail (driver
    // quirks, out-of-memory) — WASM is the reliable floor.
    if (device === "wasm") throw err;
    postDiag(`webgpu session creation failed (${err?.message || err}) — retrying on wasm`);
    transcriber = await pipeline("automatic-speech-recognition", modelId, { ...wasmOptions, progress_callback });
  }
  patchWhisperGenerationConfig(transcriber);
  return transcriber;
}

// Only ONE model may live in memory at a time: switching models (Settings)
// used to leave the previous pipeline loaded alongside the new one — a
// guaranteed OOM on memory-constrained devices. createModelCache evicts
// every other cached entry whenever a new modelId is requested. (Repeated
// analyses of the same model reuse the cached pipeline — no per-recording
// growth.)
//
// RACE CONDITION FOUND AND FIXED (2026-08-01 code audit + same-day
// follow-up — see asrModelCache.js and asrModelCache.test.js): eviction
// alone isn't safe to dispose on. Concretely: caller A requests model X
// (starts loading); the main-thread flow that started A gets abandoned
// (e.g. user backs out of a recording); the user changes their model
// preference in Settings; caller B then requests model Y on this same
// singleton worker. Naively, B's request would evict X the moment X's load
// completes — racing directly against A's own dangling `await` on that
// same X instance trying to actually run inference on it. Fixed via
// reference counting in asrModelCache.js: every getTranscriber() call MUST
// be matched by a modelCache.release(modelId) call once that caller is
// done (success OR failure — see the finally blocks below) — an evicted
// model is only actually disposed once its active-user count reaches zero,
// never the instant a newer request's load resolves. Proven fixed, not
// just plausible: asrModelCache.test.js's race test failed against the
// pre-fix code with the exact predicted error, and passes now.
//
// (escalateAsrUpgrade in recitationService.js still separately calls
// resetAsrWorker() — a full worker teardown — before loading a second
// model for its own reasons: that's the deliberate, heavier-handed
// cleanup for the one place the app INTENTIONALLY switches models
// mid-session, not a substitute for this fix.)
const modelCache = createModelCache(loadTranscriber);

function getTranscriber(modelId, onProgress, allowWebGpu) {
  return modelCache.get(modelId, onProgress, allowWebGpu);
}

self.onmessage = async (event) => {
  // allowWebGpu defaults to false: an execution provider with unbounded
  // fp32 memory behavior must be opted INTO by the main thread, never
  // fallen into by a stale/absent flag.
  const { id, type, modelId = ASR_MODELS.accurate.id, allowWebGpu = false } = event.data;

  if (type === "load") {
    try {
      await getTranscriber(modelId, (pct) => self.postMessage({ id, type: "progress", pct }), allowWebGpu);
      self.postMessage({ id, type: "loaded" });
    } catch (err) {
      self.postMessage({ id, type: "error", message: err?.message || String(err) });
    } finally {
      // Must run on every path — success, error, doesn't matter — or this
      // call's claim on modelId never releases and an evicted-but-still-
      // referenced model leaks its wasm memory forever instead of ever
      // being disposed (see asrModelCache.js).
      modelCache.release(modelId);
    }
    return;
  }

  if (type === "transcribe") {
    try {
      const transcriber = await getTranscriber(modelId, (pct) => self.postMessage({ id, type: "progress", pct }), allowWebGpu);
      const { audio } = event.data;
      // Second spike checkpoint: inference allocates KV-cache/activations
      // on top of the resident model.
      postDiag(`inference starting (model resident); ${heapNote()}`);
      const result = await transcriber(audio, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
        // Suppresses Whisper's repetition-loop failure mode (one phrase
        // repeated until the 448-token ceiling, with corrupted word
        // timestamps along the way). Validated offline on loop-triggering
        // audio: 1.1/1.2 still looped, 1.3 broke the loop cleanly. A soft
        // penalty is used deliberately instead of no_repeat_ngram_size —
        // the Quran legitimately repeats phrases (e.g. Ar-Rahman's
        // refrain), and a hard n-gram ban would corrupt correct recitation.
        repetition_penalty: 1.3,
      });
      self.postMessage({ id, type: "result", result });
    } catch (err) {
      self.postMessage({ id, type: "error", message: err?.message || String(err) });
    } finally {
      modelCache.release(modelId);
    }
  }
};
