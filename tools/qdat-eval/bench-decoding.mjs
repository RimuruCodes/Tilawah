// Greedy vs beam-search decoding: does transformers.js support num_beams
// together with word timestamps, does it change transcripts on real
// recitation audio, and what does it cost in latency?
//   npx vite-node tools/qdat-eval/bench-decoding.mjs -- <model_id> <wav1> [wav2...]
import fs from "node:fs";
import { pipeline } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";

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
const [modelId, ...wavs] = args;

const t = await pipeline("automatic-speech-recognition", modelId, {
  dtype: "q8",
  session_options: { enableCpuMemArena: false, enableMemPattern: false },
});
patchWhisperGenerationConfig(t);

for (const wav of wavs) {
  const audio = wavToFloat16k(wav);
  console.log(`\n=== ${wav.split(/[\\/]/).pop()} (${(audio.length / 16000).toFixed(1)}s)`);
  for (const num_beams of [1, 3, 5]) {
    const started = Date.now();
    try {
      const res = await t(audio, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
        num_beams,
        ...(num_beams > 1 ? { do_sample: false } : {}),
      });
      const secs = ((Date.now() - started) / 1000).toFixed(1);
      console.log(`beams=${num_beams}  ${secs}s  words=${res.chunks?.length}  text=${res.text.trim()}`);
    } catch (err) {
      console.log(`beams=${num_beams}  FAILED: ${err.message.split("\n")[0].slice(0, 120)}`);
    }
  }
}
