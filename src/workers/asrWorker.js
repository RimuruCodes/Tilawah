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

// Single-threaded WASM, explicitly: the threaded build pre-allocates
// per-thread stacks and SharedArrayBuffer memory up front — fixed overhead
// that contributes to the mobile OOM at session creation independent of
// model size. We serve no COOP/COEP headers so SAB is unavailable anyway;
// pinning numThreads avoids any threaded pre-allocation attempt.
if (env?.backends?.onnx?.wasm) {
  env.backends.onnx.wasm.numThreads = 1;
}

// Word-level timestamps (which the Tajweed windowing depends on) require a
// decoder exported with cross-attention outputs. As of 2026-07 NO public
// ONNX conversion of tarteel-ai/whisper-base-ar-quran has that export —
// every one fails at transcription time (verified in
// tools/qdat-eval/probe-models.mjs), including the An0xity repo previously
// referenced here, which shipped an encoder only and couldn't even load.
// Until a Quran-tuned timestamped conversion is hosted (see the qdat-eval
// README for the conversion recipe), the accurate slot uses the official
// timestamped export of generic multilingual whisper-base.
export const ASR_MODELS = {
  fast: { id: "Xenova/whisper-tiny", label: "Fast (smaller download, generic Arabic)" },
  accurate: { id: "onnx-community/whisper-base_timestamped", label: "More accurate (larger download, generic Arabic)" },
};

const transcribers = new Map(); // modelId -> pipeline promise

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

function getTranscriber(modelId, onProgress, allowWebGpu) {
  if (!transcribers.has(modelId)) {
    // Only ONE model may live in memory at a time: switching models
    // (Settings) used to leave the previous pipeline loaded alongside the
    // new one — a guaranteed OOM on memory-constrained devices. Dispose
    // any other model before loading this one. (Repeated analyses of the
    // same model reuse the cached pipeline — no per-recording growth.)
    for (const [otherId, otherPromise] of transcribers) {
      transcribers.delete(otherId);
      otherPromise.then((t) => t?.dispose?.()).catch(() => {});
    }
    const progress_callback = (data) => {
      if (data?.status === "progress" && typeof data.progress === "number") {
        onProgress?.(Math.round(data.progress));
      }
    };
    // WASM needs two workarounds, both verified against onnxruntime-web's
    // "Missing required scale ... MatMulNBits" session-creation failure:
    // the 8-bit export (same dtype the offline eval harness validated), and
    // graph optimization capped at "basic" — the extended-level
    // DQ->MatMulNBits fusion misfires on these quantized weights.
    //
    // The remaining options all trade inference speed for a lower peak at
    // session creation, which is where memory-tight tabs die:
    //  - enableCpuMemArena=false: the arena grows in doubling chunks and
    //    over-reserves; direct allocation tracks actual need.
    //  - enableMemPattern=false: pattern planning pre-allocates the
    //    inferred peak up front instead of incrementally.
    //  - disable_prepacking: prepacking keeps a SECOND, kernel-shaped copy
    //    of MatMul weights alongside the originals.
    //  - use_device_allocator_for_initializers: weights bypass the arena
    //    so they can't trigger an oversized arena growth.
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
    const load = async () => {
      const device = await detectDevice(allowWebGpu);
      // Last words before the spike: which execution provider + dtype is
      // about to create the session, and the heap where measurable.
      postDiag(
        device === "wasm"
          ? `execution provider: wasm (dtype q8, 1 thread, arena+prepacking off); ${heapNote()}`
          : `execution provider: webgpu (dtype fp32 — transformers.js default for webgpu); ${heapNote()}`
      );
      try {
        const options = device === "wasm" ? wasmOptions : { device };
        return await pipeline("automatic-speech-recognition", modelId, { ...options, progress_callback });
      } catch (err) {
        // Even with an adapter, webgpu session creation can still fail
        // (driver quirks, out-of-memory) — WASM is the reliable floor.
        if (device !== "wasm") {
          postDiag(`webgpu session creation failed (${err?.message || err}) — retrying on wasm`);
          return await pipeline("automatic-speech-recognition", modelId, { ...wasmOptions, progress_callback });
        }
        throw err;
      }
    };
    transcribers.set(
      modelId,
      load().then((transcriber) => {
        patchWhisperGenerationConfig(transcriber);
        return transcriber;
      }).catch((err) => {
        transcribers.delete(modelId); // allow retry on next call
        throw err;
      })
    );
  }
  return transcribers.get(modelId);
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
    }
  }
};
