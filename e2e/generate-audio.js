// Generates the audio fixtures the e2e suite feeds into the app — both as
// the browser's fake microphone (--use-file-for-fake-audio-capture) and as
// uploaded files. Nothing here is real recitation: the synthetic "speech"
// only exists to exercise the technical pipeline (decode -> DSP -> ASR ->
// result UI), never to validate scoring accuracy. Files are written to
// e2e/fixtures/ (gitignored) on demand by global-setup.js.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const SAMPLE_RATE = 16000;
export const FIXTURES_DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), "fixtures");

function wavBytes(samples, sampleRate = SAMPLE_RATE) {
  const dataLen = samples.length * 2;
  const buf = Buffer.alloc(44 + dataLen);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + dataLen, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16); // fmt chunk size
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(sampleRate, 24);
  buf.writeUInt32LE(sampleRate * 2, 28); // byte rate
  buf.writeUInt16LE(2, 32); // block align
  buf.writeUInt16LE(16, 34); // bits per sample
  buf.write("data", 36);
  buf.writeUInt32LE(dataLen, 40);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    buf.writeInt16LE(Math.round(s * 32767), 44 + i * 2);
  }
  return buf;
}

// Speech-like syllable bursts: a moving fundamental with harmonics weighted
// toward vowel formant bands, so the app's voiced-speech/pitch detectors
// treat it as speech (a plain sine tone would not register as voiced
// syllables). Every 4th "syllable" is held longer, loosely mimicking a madd.
function speechLike(durationSec) {
  const n = Math.round(durationSec * SAMPLE_RATE);
  const out = new Float32Array(n);
  let t = 0.15;
  let idx = 0;
  while (t < durationSec - 0.15) {
    const len = idx % 4 === 3 ? 0.55 : 0.25;
    const f0 = 125 + 40 * Math.sin(idx * 1.7);
    const start = Math.round(t * SAMPLE_RATE);
    const lenSamples = Math.round(len * SAMPLE_RATE);
    for (let i = 0; i < lenSamples && start + i < n; i++) {
      const tt = i / SAMPLE_RATE;
      const env = Math.sin((Math.PI * i) / lenSamples) ** 0.7;
      let v = 0;
      for (let h = 1; h <= 10; h++) {
        const freq = f0 * h;
        if (freq > 4000) break;
        const formant =
          Math.exp(-(((freq - 700) / 350) ** 2)) + 0.7 * Math.exp(-(((freq - 1200) / 450) ** 2));
        v += (0.6 / h + 0.25 * formant) * Math.sin(2 * Math.PI * freq * tt);
      }
      out[start + i] += 0.28 * env * (v / 3);
    }
    t += len + 0.12;
    idx++;
  }
  return out;
}

export function generateFixtures() {
  fs.mkdirSync(FIXTURES_DIR, { recursive: true });
  const files = {
    // Fed in as the fake microphone and used for happy-path uploads. Long
    // enough (12s) that mic tests always stop recording before the fake
    // capture file runs out — when it ends, Chromium ends the audio track,
    // which auto-stops MediaRecorder mid-test.
    "recitation.wav": () => wavBytes(speechLike(12)),
    // Decodes fine but contains no speech at all.
    "silence.wav": () => wavBytes(new Float32Array(4 * SAMPLE_RATE)),
    // Shorter than the 0.35s minimum the analyzer accepts.
    "too-short.wav": () => wavBytes(speechLike(0.15)),
    // Claims to be a WAV but the payload is garbage — decodeAudioData must reject it.
    "corrupted.wav": () => {
      const junk = Buffer.alloc(2048);
      for (let i = 0; i < junk.length; i++) junk[i] = (i * 73 + 41) % 256;
      junk.write("RIFF", 0);
      junk.write("WAVE", 8);
      return junk;
    },
  };
  for (const [name, make] of Object.entries(files)) {
    const file = path.join(FIXTURES_DIR, name);
    if (!fs.existsSync(file)) fs.writeFileSync(file, make());
  }
  return FIXTURES_DIR;
}

export function fixturePath(name) {
  return path.join(FIXTURES_DIR, name);
}
