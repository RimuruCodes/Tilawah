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
import { parseWav, resampleLinear, parseCsv, findLabelCsv, indexWavs, COLUMNS, pickColumn } from "./qdat-io.mjs";

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
