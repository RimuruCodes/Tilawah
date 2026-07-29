// Phase 1/2 (ASR-on-real-mistakes investigation, 2026-07): runs the real
// production ASR model (same pipeline construction as asr-sample-eval.mjs)
// against both the real-labeled-error audio (fetch-asr-error-testset.mjs)
// and the spliced synthetic audio (build-spliced-testset.mjs), and reports
// the raw transcript next to the ground truth for each — including a
// specific canonical-bias check (Phase 2): does the transcript match the
// CANONICAL verse text even where the audio deviates from it?
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { normalizeArabic } from "@/lib/tajweedAnalysis";
import { ASR_MODEL_OPTIONS } from "@/lib/asrEngine";

const AUDIO_DIR = path.join("tools", "qdat-eval", "asr-error-audio");
const OUT_FILE = path.join("tools", "qdat-eval", "asr-error-testset-results.json");
const MODEL_ID = ASR_MODEL_OPTIONS.accurate.id;

function wavFileToFloat16k(filePath) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", filePath, "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
    { maxBuffer: 1024 * 1024 * 50 }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${(result.stderr?.toString() || "").slice(0, 300)}`);
  const pcm = result.stdout;
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

function loadManifests() {
  const files = [
    path.join("tools", "qdat-eval", "asr-error-testset.json"),
    path.join("tools", "qdat-eval", "asr-spliced-testset.json"),
  ];
  const entries = [];
  for (const f of files) {
    if (!fs.existsSync(f)) continue;
    entries.push(...JSON.parse(fs.readFileSync(f, "utf8")));
  }
  return entries;
}

async function main() {
  const entries = loadManifests();
  console.log(`Loaded ${entries.length} manifest entries.`);

  console.log(`Loading ASR model ${MODEL_ID}...`);
  const transcriber = await pipeline("automatic-speech-recognition", MODEL_ID, {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
    progress_callback: (d) => {
      if (d?.status === "progress" && typeof d.progress === "number" && d.progress % 20 < 1) {
        process.stdout.write(`\rmodel download ${Math.round(d.progress)}%   `);
      }
    },
  });
  patchWhisperGenerationConfig(transcriber);
  console.log("\nModel ready.\n");

  const results = [];
  for (const entry of entries) {
    const filePath = path.join(AUDIO_DIR, entry.filename);
    if (!fs.existsSync(filePath)) {
      console.log(`MISSING FILE: ${entry.filename}`);
      continue;
    }
    try {
      const audio = wavFileToFloat16k(filePath);
      const asrResult = await transcriber(audio, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
        repetition_penalty: 1.3,
      });
      const transcript = (asrResult?.text || "").trim();
      const canonical = (entry.verseText || "").trim();
      const matchesCanonicalExactly = normalizeArabic(transcript) === normalizeArabic(canonical);
      const record = {
        filename: entry.filename,
        kind: entry.kind,
        why: entry.why || null,
        errorLocation: entry.errorLocation || null,
        errorExplanation: entry.errorExplanation || null,
        actuallySaid: entry.actuallySaid || null,
        canonicalVerseText: canonical,
        asrTranscript: transcript,
        matchesCanonicalExactly,
      };
      results.push(record);
      console.log(`--- ${entry.filename} (${entry.kind}) ---`);
      console.log(`  canonical:  ${canonical}`);
      if (entry.actuallySaid) console.log(`  actually:   ${entry.actuallySaid}`);
      if (entry.errorExplanation) console.log(`  real error: [${entry.errorLocation}] ${entry.errorExplanation}`);
      console.log(`  ASR heard:  ${transcript}`);
      console.log(`  == canonical exactly: ${matchesCanonicalExactly}`);
      console.log();
    } catch (err) {
      console.log(`ERROR on ${entry.filename}: ${err.message}`);
      results.push({ filename: entry.filename, kind: entry.kind, error: err.message });
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify({ model: MODEL_ID, results }, null, 1));
  console.log(`\nWrote ${results.length} results to ${OUT_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
