// Phase 4 (ASR investigation, 2026-07): does the app's existing
// calibration-driven noise gate (reduceNoise, audioAnalysis.js) help or
// hurt ASR transcription specifically? It's applied unconditionally before
// ANY analysis in decodeUserRecording (recitationService.js) whenever the
// device has a calibrated noise floor — the same decoded buffer is reused
// for both the acoustic DSP score and the ASR/Tajweed pass. Reuses the
// exact test corpus built for the Finding-3 follow-up (real labeled-error
// recordings, real correct controls, and the QUA-timestamp-spliced cases)
// rather than building new audio, per the explicit instruction to keep
// this grounded in already-validated material.
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { buildFeatures, reduceNoise, TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";
import { ASR_MODEL_OPTIONS } from "@/lib/asrEngine";

const AUDIO_DIR = path.join("tools", "qdat-eval", "asr-error-audio");
const OUT_FILE = path.join("tools", "qdat-eval", "noise-reduction-effect-results.json");

function wavFileToFloat16k(filePath) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", filePath, "-f", "s16le", "-ar", String(TARGET_SAMPLE_RATE), "-ac", "1", "pipe:1"],
    { maxBuffer: 1024 * 1024 * 50 }
  );
  if (result.status !== 0) throw new Error(`ffmpeg failed: ${(result.stderr?.toString() || "").slice(0, 300)}`);
  const pcm = result.stdout;
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

// Per-file realistic noise floor: the bottom 10th percentile of this
// specific recording's own per-frame energy (its quietest real moments —
// lead-in silence, inter-word gaps), the same signal a real device
// calibration would be trying to measure, rather than one arbitrary
// dB number applied uniformly to every file regardless of its actual
// recording conditions.
function estimateFloorDb(samples) {
  const { energyDb } = buildFeatures(samples, TARGET_SAMPLE_RATE);
  const finite = energyDb.filter(Number.isFinite).sort((a, b) => a - b);
  if (finite.length === 0) return null;
  return finite[Math.floor(finite.length * 0.1)];
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
  console.log(`Loaded ${entries.length} manifest entries.\n`);

  console.log(`Loading ASR model ${ASR_MODEL_OPTIONS.accurate.id}...`);
  const transcriber = await pipeline("automatic-speech-recognition", ASR_MODEL_OPTIONS.accurate.id, {
    dtype: "q8",
    session_options: { enableCpuMemArena: false, enableMemPattern: false },
  });
  patchWhisperGenerationConfig(transcriber);
  console.log("Model ready.\n");

  const results = [];
  let changed = 0;

  for (const entry of entries) {
    const filePath = path.join(AUDIO_DIR, entry.filename);
    if (!fs.existsSync(filePath)) continue;

    const raw = wavFileToFloat16k(filePath);
    const floorDb = estimateFloorDb(raw);
    const reduced = floorDb == null ? raw : reduceNoise(raw, TARGET_SAMPLE_RATE, { noiseFloorDb: floorDb });
    const wasNoOp = reduced === raw;

    const transcribeOne = async (audio) => {
      const r = await transcriber(audio, {
        language: "arabic", task: "transcribe", return_timestamps: "word", chunk_length_s: 30, repetition_penalty: 1.3,
      });
      return (r?.text || "").trim();
    };

    const rawText = await transcribeOne(raw);
    const reducedText = wasNoOp ? rawText : await transcribeOne(reduced);
    const differs = rawText !== reducedText;
    if (differs) changed++;

    results.push({
      filename: entry.filename, kind: entry.kind, floorDb, noiseGateWasNoOp: wasNoOp,
      rawTranscript: rawText, noiseReducedTranscript: reducedText, differs,
    });

    console.log(`--- ${entry.filename} (${entry.kind}) floor=${floorDb?.toFixed(1)}dB noOp=${wasNoOp} ---`);
    console.log(`  raw:           ${rawText}`);
    if (!wasNoOp) console.log(`  noise-reduced: ${reducedText}`);
    console.log(`  differs: ${differs}\n`);
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify({ results, changed, total: results.length }, null, 1));
  console.log(`\n${changed} of ${results.length} transcripts changed after noise reduction. Wrote ${OUT_FILE}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
