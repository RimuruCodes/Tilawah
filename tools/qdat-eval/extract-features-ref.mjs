// Reference-anchored QDAT feature extraction — the counterpart to
// extract-features.mjs, for the constants checkTajweedRules uses when a
// DTW-aligned reference-reciter window IS available (qalqalahRefRatioFactor,
// nasalHoldRefRatioFactor, nasalSpikeRefToleranceFactor, maddRefMinRatioFactor,
// etc. — see TAJWEED_THRESHOLDS in src/lib/tajweedAnalysis.js). Those were
// shipped as hand-picked placeholders because, until now, this harness had
// no reference-audio/DTW path to validate them against — it only ever ran
// the plain-threshold branch. This does the same thing extract-features.mjs
// does, but also builds a real referenceAlignment (the exact structure
// compareSamples produces in the shipping app) and passes it through, so
// checkTajweedRules exercises its reference-anchored branch for real.
//
// Coverage note (important): QDAT only labels madd/ghunnah/ikhfa. It has NO
// qalqalah or idgham labels (verse 5:109 contains neither), so this can only
// validate maddRefMinRatioFactor, nasalHoldRefRatioFactor, and
// nasalSpikeRefToleranceFactor — not qalqalahRefRatioFactor/qalqalahRefMinDb
// or idghamNoGhunnahTransientDb/idghamNoGhunnahRefToleranceFactor. Same
// limitation the threshold-mode harness already has for Qalqalah.
//
// Reference audio: fetched from everyayah.com — the SAME source and SAME
// usage pattern (DTW reference comparison) already running in production
// for every non-QUA reciter, so this introduces no new licensing exposure.
// QDAT recordings are of a FRAGMENT of 5:109, not the whole ayah, so the
// full reference ayah audio is transcribed once and trimmed to that
// fragment's start before use — otherwise DTW would try to align the whole
// (longer) reference ayah against the (shorter) fragment and produce a
// meaningless mapping.
//
// Run with vite-node:
//   npx vite-node tools/qdat-eval/extract-features-ref.mjs -- --data <dir> [--limit N] [--reciter Husary_128kbps]
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { execFileSync } from "node:child_process";
import { pipeline } from "@huggingface/transformers";
import { analyzeTajweedFromTranscription, normalizeArabic, alignWords } from "@/lib/tajweedAnalysis";
import { compareSamples, TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { parseWav, resampleLinear, parseCsv, findLabelCsv, indexWavs, COLUMNS, pickColumn } from "./qdat-io.mjs";

const QDAT_FRAGMENT = "قَالُوا۟ لَا عِلْمَ لَنَآ إِنَّكَ أَنتَ عَلَّٰمُ ٱلْغُيُوبِ";
const DEFAULT_MODEL_ID = "onnx-community/whisper-base_timestamped";
const RULE_TO_CHECK = { madd: "madd_extended", ghunnah: "ghunnah", ikhfa: "ikhfa" };

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  return {
    dataDir: get("--data"),
    outFile: get("--out") || path.join("tools", "qdat-eval", "features-ref.json"),
    limit: get("--limit") ? parseInt(get("--limit"), 10) : Infinity,
    modelId: get("--model") || DEFAULT_MODEL_ID,
    reciterFolder: get("--reciter") || "Husary_128kbps",
    refCacheDir: get("--ref-cache") || path.join("tools", "qdat-eval", "ref-audio-cache"),
  };
}

// Fetches an everyayah MP3, converts to WAV via ffmpeg (already a project
// dependency — see qua_jobs/download_audio.py's own use of it), decodes
// with the same Node-side WAV parser the QDAT recordings use.
async function fetchAndDecodeMp3(url, tmpBase) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Failed to fetch ${url}: HTTP ${res.status}`);
  const mp3Path = `${tmpBase}.mp3`;
  const wavPath = `${tmpBase}.wav`;
  fs.writeFileSync(mp3Path, Buffer.from(await res.arrayBuffer()));
  execFileSync("ffmpeg", ["-y", "-i", mp3Path, "-ar", "16000", "-ac", "1", wavPath], { stdio: "pipe" });
  const { samples, sampleRate } = parseWav(fs.readFileSync(wavPath));
  fs.rmSync(mp3Path, { force: true });
  fs.rmSync(wavPath, { force: true });
  return resampleLinear(samples, sampleRate, TARGET_SAMPLE_RATE);
}

// Locates where QDAT_FRAGMENT begins in the FULL 5:109 reference audio (the
// fragment starts partway through the ayah, at "قَالُوا۟...") by transcribing
// the whole ayah and word-aligning against the full ayah text the same way
// analyzeTajweedFromTranscription aligns any expected text against ASR
// output — reusing that exact alignment logic rather than a new heuristic.
async function prepareReferenceAudio({ reciterFolder, refCacheDir, transcriber }) {
  fs.mkdirSync(refCacheDir, { recursive: true });
  const cachePath = path.join(refCacheDir, `${reciterFolder}_5_109_fragment.json`);
  if (fs.existsSync(cachePath)) {
    const cached = JSON.parse(fs.readFileSync(cachePath, "utf8"));
    console.log(`Reference audio: using cached trim (${cached.samples.length} samples) from ${cachePath}`);
    return new Float32Array(cached.samples);
  }

  const surahStr = "005";
  const ayahStr = "109";
  const url = `https://everyayah.com/data/${reciterFolder}/${surahStr}${ayahStr}.mp3`;
  console.log(`Reference audio: fetching ${url}`);
  const fullSamples = await fetchAndDecodeMp3(url, path.join(refCacheDir, "_tmp_full"));

  // Full 5:109 Uthmani text (api.alquran.cloud), for locating the fragment.
  const FULL_AYAH_TEXT =
    "يَوْمَ يَجْمَعُ ٱللَّهُ ٱلرُّسُلَ فَيَقُولُ مَاذَآ أُجِبْتُمْ قَالُوا۟ لَا عِلْمَ لَنَآ إِنَّكَ أَنتَ عَلَّٰمُ ٱلْغُيُوبِ";
  const expectedWords = FULL_AYAH_TEXT.trim().split(/\s+/).map(normalizeArabic);
  const fragmentFirstWordNormalized = normalizeArabic(QDAT_FRAGMENT.trim().split(/\s+/)[0]);
  const fragmentStartWordIndex = expectedWords.findIndex((w) => w === fragmentFirstWordNormalized);
  if (fragmentStartWordIndex === -1) {
    throw new Error(`Couldn't locate the fragment's first word ("${fragmentFirstWordNormalized}") in the full ayah text`);
  }

  const asrResult = await transcriber(fullSamples, {
    language: "arabic",
    task: "transcribe",
    return_timestamps: "word",
    chunk_length_s: 30,
  });
  const chunks = asrResult?.chunks || [];
  const recognizedWords = chunks.map((c) => normalizeArabic((c.text || "").trim()));
  const alignments = alignWords(expectedWords, recognizedWords);
  const align = alignments[fragmentStartWordIndex];
  if (!align || align.recognizedIndex == null) {
    throw new Error(
      `Couldn't align the fragment's start word in the reference reciter's audio (word ${fragmentStartWordIndex}) — try a different --reciter.`
    );
  }
  const startSec = Math.max(0, (chunks[align.recognizedIndex].timestamp[0] ?? 0) - 0.1); // small lead-in margin
  const startSample = Math.round(startSec * TARGET_SAMPLE_RATE);
  const trimmed = fullSamples.slice(startSample);
  console.log(
    `Reference audio: located fragment start at word ${fragmentStartWordIndex} (~${startSec.toFixed(2)}s into the ayah), ` +
      `trimmed ${fullSamples.length} -> ${trimmed.length} samples`
  );

  fs.writeFileSync(cachePath, JSON.stringify({ reciterFolder, startSec, samples: Array.from(trimmed) }));
  return trimmed;
}

async function main() {
  const { dataDir, outFile, limit, modelId, reciterFolder, refCacheDir } = parseArgs();
  if (!dataDir) {
    console.error("Usage: npx vite-node tools/qdat-eval/extract-features-ref.mjs -- --data <qdat-dir> [--limit N] [--reciter Husary_128kbps]");
    process.exit(1);
  }

  const csvPath = findLabelCsv(dataDir);
  const { headers, rows } = parseCsv(fs.readFileSync(csvPath, "utf8"));
  console.log(`Labels: ${csvPath} (${rows.length} rows)`);

  const fileCol = pickColumn(headers, COLUMNS.file, "file");
  const maddCol = pickColumn(headers, COLUMNS.madd, "madd");
  const ghunnahCol = pickColumn(headers, COLUMNS.ghunnah, "ghunnah");
  const ikhfaCol = pickColumn(headers, COLUMNS.ikhfa, "ikhfa");

  const wavs = indexWavs(dataDir);
  console.log(`WAV files found: ${wavs.size}`);

  const existing = fs.existsSync(outFile)
    ? new Map(
        JSON.parse(fs.readFileSync(outFile, "utf8"))
          .records.filter((r) => !r.error)
          .map((r) => [r.file, r])
      )
    : new Map();

  console.log(`Loading ASR model ${modelId} (cached after first run)...`);
  const transcriber = await pipeline("automatic-speech-recognition", modelId, {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
    progress_callback: (d) => {
      if (d?.status === "progress" && typeof d.progress === "number" && d.progress % 20 < 1) {
        process.stdout.write(`\rmodel download ${Math.round(d.progress)}%   `);
      }
    },
  });
  patchWhisperGenerationConfig(transcriber);
  console.log("\nModel ready.");

  const referenceSamples = await prepareReferenceAudio({ reciterFolder, refCacheDir, transcriber });

  let processed = 0;
  let skippedMissing = 0;
  let referenceModeCount = 0;
  let thresholdFallbackCount = 0;
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
      const audio16k = resampleLinear(samples, sampleRate, TARGET_SAMPLE_RATE);
      const asrResult = await transcriber(audio16k, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
      });

      // The exact same DTW/referenceAlignment structure compareSamples
      // produces in the shipping app (see audioAnalysis.js) — built here
      // from the QDAT recording against the trimmed reference audio.
      const { referenceAlignment } = compareSamples(audio16k, referenceSamples, TARGET_SAMPLE_RATE);

      const analysis = analyzeTajweedFromTranscription({
        asrResult,
        ayahArabicText: QDAT_FRAGMENT,
        userSamples: audio16k,
        sampleRate: TARGET_SAMPLE_RATE,
        referenceAlignment,
      });

      const checkFor = (type) => {
        const c = analysis.ruleChecks.find((r) => r.ruleType === type);
        if (!c) return null;
        if (c.measured?.mode === "reference") referenceModeCount++;
        else if (c.measured) thresholdFallbackCount++;
        return { verdict: c.verdict, measured: c.measured ?? null };
      };

      existing.set(wavName, {
        file: wavName,
        durationSec: Math.round((audio16k.length / TARGET_SAMPLE_RATE) * 100) / 100,
        labels: {
          madd: Number(row[maddCol]),
          ghunnah: Number(row[ghunnahCol]),
          ikhfa: Number(row[ikhfaCol]),
        },
        recognizedRatio: analysis.alignmentStats.recognizedRatio,
        hasReferenceAlignment: !!referenceAlignment,
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
      fs.writeFileSync(outFile, JSON.stringify({ model: modelId, reciterFolder, records: [...existing.values()] }));
      console.log(
        `processed ${processed} (total cached ${existing.size}) — ${rate.toFixed(2)} rec/s — ` +
          `reference-mode checks so far: ${referenceModeCount}, threshold-fallback: ${thresholdFallbackCount}`
      );
    }
  }

  fs.writeFileSync(outFile, JSON.stringify({ model: modelId, reciterFolder, records: [...existing.values()] }, null, 1));
  console.log(
    `Done. ${existing.size} records in ${outFile}; ${skippedMissing} label rows had no matching WAV. ` +
      `reference-mode checks: ${referenceModeCount}, threshold-fallback: ${thresholdFallbackCount}.`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
