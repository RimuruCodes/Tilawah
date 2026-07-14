// QDAT feature extraction: runs the app's REAL Tajweed pipeline (same ASR
// model, same analyzeTajweedFromTranscription code the browser uses) over
// the QDAT dataset (~1,500 labeled recordings of the Surah Al-Ma'idah 5:109
// fragment) and caches, per recording, the raw measurements behind each
// rule verdict. tune-thresholds.mjs then re-derives verdicts under candidate
// thresholds from this cache without re-running ASR.
//
// Run with vite-node so the app's `@/lib/...` imports resolve:
//   npx vite-node tools/qdat-eval/extract-features.mjs -- --data <dir> [--limit N] [--inspect]
//
// The dataset comes from Kaggle (annealdahi/quran-recitation), cited by the
// QDAT paper (IJASAT 2021). Download via kagglehub (works anonymously):
//   python -c "import kagglehub; print(kagglehub.dataset_download('annealdahi/quran-recitation'))"
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { pipeline } from "@huggingface/transformers";
import { analyzeTajweedFromTranscription } from "@/lib/tajweedAnalysis";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";

// The recited fragment of 5:109 (Uthmani, from api.alquran.cloud), with the
// pause mark after لَنَآ omitted — QDAT's Madd label is for the connected
// reading (Madd Munfasil into إِنَّكَ), which is how the recordings recite it.
const QDAT_FRAGMENT = "قَالُوا۟ لَا عِلْمَ لَنَآ إِنَّكَ أَنتَ عَلَّٰمُ ٱلْغُيُوبِ";

// Default: the app's "accurate" model — keep in sync with asrWorker.js.
// Override with --model to compare candidates. (Note: only models exported
// with output_attentions support the word timestamps this pipeline needs;
// see tools/qdat-eval/probe-models.mjs.)
const DEFAULT_MODEL_ID = "onnx-community/whisper-base_timestamped";

// QDAT rule label -> the app rule check it corresponds to on this fragment.
const RULE_TO_CHECK = {
  madd: "madd_extended", // "separate stretching" = Madd Munfasil in لَنَآ إِنَّكَ
  ghunnah: "ghunnah", //    "tight noon" = shaddah noon in إِنَّكَ
  ikhfa: "ikhfa", //        "hide" = noon sakinah before ت in أَنتَ
};

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  return {
    dataDir: get("--data"),
    outFile: get("--out") || path.join("tools", "qdat-eval", "features.json"),
    limit: get("--limit") ? parseInt(get("--limit"), 10) : Infinity,
    inspect: args.includes("--inspect"),
    modelId: get("--model") || DEFAULT_MODEL_ID,
  };
}

// ---- WAV decoding (QDAT ships 16-bit mono PCM WAVs at 11 kHz) ----

function parseWav(buffer) {
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

function resampleLinear(samples, fromRate, toRate) {
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

function parseCsv(text) {
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

function findLabelCsv(dataDir) {
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

function indexWavs(dataDir) {
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
const COLUMNS = {
  file: ["title", "Sound", "sound", "file", "File", "name", "Name"],
  madd: ["Separate tide", "S1", "Mad", "madd"],
  ghunnah: ["The tight noon", "S2", "Ghunnah", "ghunnah"],
  ikhfa: ["Concealment", "S3", "Hide", "ikhfa"],
};

function pickColumn(headers, candidates, kind) {
  const found = candidates.find((c) => headers.includes(c));
  if (!found) throw new Error(`Couldn't find a "${kind}" column among: ${headers.join(", ")}`);
  return found;
}

async function main() {
  const { dataDir, outFile, limit, inspect, modelId } = parseArgs();
  if (!dataDir) {
    console.error("Usage: npx vite-node tools/qdat-eval/extract-features.mjs -- --data <qdat-dir> [--limit N] [--inspect]");
    process.exit(1);
  }

  const csvPath = findLabelCsv(dataDir);
  const { headers, rows } = parseCsv(fs.readFileSync(csvPath, "utf8"));
  console.log(`Labels: ${csvPath} (${rows.length} rows)`);
  if (inspect) {
    console.log("Headers:", headers);
    console.log("First 3 rows:", JSON.stringify(rows.slice(0, 3), null, 2));
    return;
  }

  const fileCol = pickColumn(headers, COLUMNS.file, "file");
  const maddCol = pickColumn(headers, COLUMNS.madd, "madd");
  const ghunnahCol = pickColumn(headers, COLUMNS.ghunnah, "ghunnah");
  const ikhfaCol = pickColumn(headers, COLUMNS.ikhfa, "ikhfa");

  const wavs = indexWavs(dataDir);
  console.log(`WAV files found: ${wavs.size}`);

  // Resumable: keep already-processed records keyed by file name. Records
  // that errored (e.g. transient out-of-memory during a contended run) are
  // dropped here so a follow-up run retries them.
  const existing = fs.existsSync(outFile)
    ? new Map(
        JSON.parse(fs.readFileSync(outFile, "utf8"))
          .records.filter((r) => !r.error)
          .map((r) => [r.file, r])
      )
    : new Map();

  console.log(`Loading ASR model ${modelId} (cached after first run)...`);
  const transcriber = await pipeline("automatic-speech-recognition", modelId, {
    // q8 matches what the app's WASM worker actually loads in the browser
    // (Node would otherwise default to fp32 files).
    dtype: "q8",
    // This machine is memory-constrained; the arena/mem-pattern preallocation
    // is what fails first, not the actual working set.
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
    progress_callback: (d) => {
      if (d?.status === "progress" && typeof d.progress === "number" && d.progress % 20 < 1) {
        process.stdout.write(`\rmodel download ${Math.round(d.progress)}%   `);
      }
    },
  });
  patchWhisperGenerationConfig(transcriber);
  console.log("\nModel ready.");

  let processed = 0;
  let skippedMissing = 0;
  const started = Date.now();

  for (const row of rows) {
    if (processed >= limit) break;
    const rawName = (row[fileCol] || "").split(/[\\/]/).pop();
    if (!rawName) continue;
    const wavName = /\.wav$/i.test(rawName) ? rawName : `${rawName}.wav`;
    if (existing.has(wavName)) continue;

    const wavPath = wavs.get(wavName.toLowerCase());
    if (!wavPath) {
      skippedMissing++;
      continue;
    }

    try {
      const { samples, sampleRate } = parseWav(fs.readFileSync(wavPath));
      const audio16k = resampleLinear(samples, sampleRate, 16000);
      const asrResult = await transcriber(audio16k, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
      });
      const analysis = analyzeTajweedFromTranscription({
        asrResult,
        ayahArabicText: QDAT_FRAGMENT,
        userSamples: audio16k,
        sampleRate: 16000,
      });

      const checkFor = (type) => {
        const c = analysis.ruleChecks.find((r) => r.ruleType === type);
        return c ? { verdict: c.verdict, measured: c.measured ?? null } : null;
      };

      existing.set(wavName, {
        file: wavName,
        durationSec: Math.round((audio16k.length / 16000) * 100) / 100,
        labels: {
          madd: Number(row[maddCol]),
          ghunnah: Number(row[ghunnahCol]),
          ikhfa: Number(row[ikhfaCol]),
        },
        recognizedRatio: analysis.alignmentStats.recognizedRatio,
        checks: {
          madd: checkFor(RULE_TO_CHECK.madd),
          ghunnah: checkFor(RULE_TO_CHECK.ghunnah),
          ikhfa: checkFor(RULE_TO_CHECK.ikhfa),
        },
      });
    } catch (err) {
      existing.set(wavName, { file: wavName, error: err.message });
    }

    processed++;
    if (processed % 10 === 0) {
      const rate = processed / ((Date.now() - started) / 1000);
      fs.writeFileSync(outFile, JSON.stringify({ model: modelId, records: [...existing.values()] }));
      console.log(`processed ${processed} (total cached ${existing.size}) — ${rate.toFixed(2)} rec/s`);
    }
  }

  fs.writeFileSync(outFile, JSON.stringify({ model: modelId, records: [...existing.values()] }, null, 1));
  console.log(`Done. ${existing.size} records in ${outFile}; ${skippedMissing} label rows had no matching WAV.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
