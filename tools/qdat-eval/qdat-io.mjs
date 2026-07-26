// Shared QDAT dataset I/O: WAV decoding, resampling, and the dataset's own
// CSV/file layout — used by both extract-features.mjs (threshold-mode
// extraction) and extract-features-ref.mjs (reference-anchored extraction),
// so the two extraction passes can't silently drift on how they read the
// same dataset.
import fs from "node:fs";
import path from "node:path";

// ---- WAV decoding (QDAT ships 16-bit mono PCM WAVs at 11 kHz) ----

export function parseWav(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("Not a RIFF/WAVE file");
  }
  let offset = 12;
  let fmt = null;
  let dataStart = -1;
  let dataLen = 0;
  while (offset + 8 <= buffer.length) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    if (id === "fmt ") {
      fmt = {
        audioFormat: buffer.readUInt16LE(offset + 8),
        channels: buffer.readUInt16LE(offset + 10),
        sampleRate: buffer.readUInt32LE(offset + 12),
        bitsPerSample: buffer.readUInt16LE(offset + 22),
      };
    } else if (id === "data") {
      dataStart = offset + 8;
      dataLen = Math.min(size, buffer.length - dataStart);
    }
    offset += 8 + size + (size % 2);
  }
  if (!fmt || dataStart < 0) throw new Error("Missing fmt/data chunk");

  const bytesPerSample = fmt.bitsPerSample / 8;
  const frameCount = Math.floor(dataLen / (bytesPerSample * fmt.channels));
  const mono = new Float32Array(frameCount);
  for (let i = 0; i < frameCount; i++) {
    let sum = 0;
    for (let c = 0; c < fmt.channels; c++) {
      const at = dataStart + (i * fmt.channels + c) * bytesPerSample;
      if (fmt.bitsPerSample === 16) sum += buffer.readInt16LE(at) / 32768;
      else if (fmt.bitsPerSample === 8) sum += (buffer.readUInt8(at) - 128) / 128;
      else if (fmt.bitsPerSample === 32 && fmt.audioFormat === 3) sum += buffer.readFloatLE(at);
      else throw new Error(`Unsupported WAV format: ${fmt.audioFormat}/${fmt.bitsPerSample}bit`);
    }
    mono[i] = sum / fmt.channels;
  }
  return { samples: mono, sampleRate: fmt.sampleRate };
}

export function resampleLinear(samples, fromRate, toRate) {
  if (fromRate === toRate) return samples;
  const outLen = Math.round((samples.length * toRate) / fromRate);
  const out = new Float32Array(outLen);
  for (let i = 0; i < outLen; i++) {
    const t = (i * (samples.length - 1)) / (outLen - 1);
    const lo = Math.floor(t);
    const hi = Math.min(lo + 1, samples.length - 1);
    out[i] = samples[lo] + (samples[hi] - samples[lo]) * (t - lo);
  }
  return out;
}

// ---- CSV parsing (simple: QDAT's label file has no quoted commas) ----

export function parseCsv(text) {
  const lines = text.replace(/^﻿/, "").split(/\r?\n/).filter((l) => l.trim());
  const headers = lines[0].split(",").map((h) => h.trim());
  return {
    headers,
    rows: lines.slice(1).map((line) => {
      const cells = line.split(",").map((c) => c.trim());
      return Object.fromEntries(headers.map((h, i) => [h, cells[i]]));
    }),
  };
}

export function findLabelCsv(dataDir) {
  const stack = [dataDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.csv$/i.test(entry.name)) return full;
    }
  }
  throw new Error(`No CSV label file found under ${dataDir}`);
}

export function indexWavs(dataDir) {
  const map = new Map(); // lowercased basename -> full path
  const stack = [dataDir];
  while (stack.length) {
    const dir = stack.pop();
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (/\.wav$/i.test(entry.name)) map.set(entry.name.toLowerCase(), full);
    }
  }
  return map;
}

// Column names in the QDAT CSV (verified against the actual download —
// headers are: ,title,Separate tide,The tight noon,Concealment,Target,Age,Gender
// where `title` matches the WAV basename, e.g. S0_1 -> S0_1.wav).
export const COLUMNS = {
  file: ["title", "Sound", "sound", "file", "File", "name", "Name"],
  madd: ["Separate tide", "S1", "Mad", "madd"],
  ghunnah: ["The tight noon", "S2", "Ghunnah", "ghunnah"],
  ikhfa: ["Concealment", "S3", "Hide", "ikhfa"],
};

export function pickColumn(headers, candidates, kind) {
  const found = candidates.find((c) => headers.includes(c));
  if (!found) throw new Error(`Couldn't find a "${kind}" column among: ${headers.join(", ")}`);
  return found;
}
