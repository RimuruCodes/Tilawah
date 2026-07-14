// Probes candidate ASR model repos for what the app actually needs:
// loadable encoder+decoder, Arabic forcing, and word-level timestamps
// (requires a decoder exported with cross-attention outputs).
//   npx vite-node tools/qdat-eval/probe-models.mjs -- <path-to-a-wav>
import fs from "node:fs";
import { pipeline } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";

const REPOS = [
  "Xenova/whisper-tiny", // the app's current "fast" model
  "Oa-4/whisper-base-ar-quran-ONNX-tjs-v2",
  "raghibdarr/whisper-base-ar-quran-onnx",
  "softmills/whisper-base-ar-quran-onnx",
  "TMSH75/whisper-base-ar-quran-onnx",
  "aaqibhabib/whisper-base-ar-quran-onnx",
];

// Minimal WAV reader (16-bit PCM mono) + linear resample to 16 kHz.
function wavToFloat16k(file) {
  const b = fs.readFileSync(file);
  let offset = 12, sampleRate = 16000, dataStart = -1, dataLen = 0, channels = 1;
  while (offset + 8 <= b.length) {
    const id = b.toString("ascii", offset, offset + 4);
    const size = b.readUInt32LE(offset + 4);
    if (id === "fmt ") { channels = b.readUInt16LE(offset + 10); sampleRate = b.readUInt32LE(offset + 12); }
    else if (id === "data") { dataStart = offset + 8; dataLen = Math.min(size, b.length - dataStart); }
    offset += 8 + size + (size % 2);
  }
  const n = Math.floor(dataLen / (2 * channels));
  const mono = new Float32Array(n);
  for (let i = 0; i < n; i++) mono[i] = b.readInt16LE(dataStart + i * 2 * channels) / 32768;
  const outLen = Math.round((n * 16000) / sampleRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const t = (i * (n - 1)) / (outLen - 1);
    const lo = Math.floor(t);
    out[i] = mono[lo] + (mono[Math.min(lo + 1, n - 1)] - mono[lo]) * (t - lo);
  }
  return out;
}

const args = process.argv.slice(2).filter((a) => a !== "--");
const wavPath = args[0];
// Any extra args are repo ids to probe instead of the default list.
const repos = args.length > 1 ? args.slice(1) : REPOS;
const audio = wavToFloat16k(wavPath);
console.log(`Probe audio: ${wavPath} (${(audio.length / 16000).toFixed(1)}s)\n`);

for (const repo of repos) {
  const started = Date.now();
  try {
    const t = await pipeline("automatic-speech-recognition", repo, {
      dtype: "q8",
      session_options: { enableCpuMemArena: false, enableMemPattern: false },
    });
    patchWhisperGenerationConfig(t);
    const res = await t(audio, { language: "arabic", task: "transcribe", return_timestamps: "word", chunk_length_s: 30 });
    const words = res.chunks?.length ?? 0;
    console.log(`OK    ${repo} — ${words} word chunks in ${((Date.now() - started) / 1000).toFixed(1)}s`);
    console.log(`      text: ${res.text.trim().slice(0, 90)}`);
    if (res.chunks?.[0]) console.log(`      first chunk: ${JSON.stringify(res.chunks[0])}`);
    await t.dispose?.();
  } catch (err) {
    console.log(`FAIL  ${repo} — ${err.message.split("\n")[0].slice(0, 140)}`);
  }
}
