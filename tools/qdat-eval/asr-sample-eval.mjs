// Phase 2 ASR validation (2026-07 — see README.md): broadens the ASR fix's
// validation from the single Surah 114:4 ayah / 2-reciter spot-check to a
// deliberately stratified 150-(ayah,reciter)-pair sample across all 5
// currently-supported reciters, surah lengths, ayah lengths, and
// muqatta'at (disjointed-letter) openings — with a word-count-weighted
// accuracy breakdown by each of those dimensions, not a single aggregate.
//
// Sample selection is DETERMINISTIC (a stable hash, not Math.random or
// hand-picked verses) within deliberately-designed strata — reproducible on
// re-run, but not cherry-picked by me verse-by-verse. See buildSamplePairs.
//
// Resumable, same convention as extract-features.mjs — re-running after an
// interruption or error skips already-completed (surah,ayah,reciter) keys.
//   npx vite-node tools/qdat-eval/asr-sample-eval.mjs
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { pipeline } from "@huggingface/transformers";
import { patchWhisperGenerationConfig } from "@/lib/whisperGenerationPatch";
import { SURAHS, RECITERS, getAudioUrl, fetchSurahText } from "@/lib/quranData";
import { alignWords, normalizeArabic } from "@/lib/tajweedAnalysis";
import { ASR_MODEL_OPTIONS } from "@/lib/asrEngine";

const OUT_FILE = path.join("tools", "qdat-eval", "asr-sample-results.json");
const MODEL_ID = ASR_MODEL_OPTIONS.accurate.id;

function hashOf(s) {
  return [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
}

// --- Strata 1: representative bulk (120 pairs) ---
// Stratified by surah length (short <=20 ayahs / medium 21-100 / long >100),
// 40 picks each, via a stable hash walk (deterministic, not hand-curated —
// avoids both true randomness and my own verse-recall bias for 120 picks).
// 2:282 (the longest ayah in the Quran) is force-included as the deliberate
// long-ayah-length outlier; the short-surah bucket naturally surfaces very
// short ayahs (much of Juz Amma) without needing a hand-picked "shortest".
function buildBulkSample() {
  const short = SURAHS.filter((s) => s.ayahs <= 20);
  const medium = SURAHS.filter((s) => s.ayahs > 20 && s.ayahs <= 100);
  const long = SURAHS.filter((s) => s.ayahs > 100);
  const buckets = [
    ["short", short],
    ["medium", medium],
    ["long", long],
  ];
  const picks = [];
  const seen = new Set();
  for (const [label, list] of buckets) {
    let i = 0;
    let guard = 0;
    while (picks.filter((p) => p.bucket === label).length < 40 && guard < 5000) {
      guard++;
      const surah = list[hashOf(`${label}-surah-${i}`) % list.length];
      const ayah = (hashOf(`${label}-ayah-${i}`) % surah.ayahs) + 1;
      i++;
      const key = `${surah.number}:${ayah}`;
      if (seen.has(key)) continue;
      seen.add(key);
      picks.push({ surah: surah.number, ayah, bucket: label });
    }
  }
  if (!seen.has("2:282")) {
    const idx = picks.findIndex((p) => p.bucket === "long");
    seen.delete(`${picks[idx].surah}:${picks[idx].ayah}`);
    picks[idx] = { surah: 2, ayah: 282, bucket: "long", note: "longest ayah in the Quran (forced)" };
  }
  return picks;
}

// --- Strata 2: muqatta'at / disjointed letters (20 pairs) ---
// One representative surah per DISTINCT letter-group (14 groups) so
// acoustically-identical repeats (six الم surahs share the same letters)
// don't masquerade as extra coverage, plus 6 of the more complex letter
// combinations repeated with a second reciter — checking whether difficulty
// is text-inherent (shows up for both reciters) or reciter-specific.
const MUQATTAAT = [
  { surah: 2, letters: "الم" },
  { surah: 7, letters: "المص" },
  { surah: 10, letters: "الر" },
  { surah: 13, letters: "المر" },
  { surah: 19, letters: "كهيعص" },
  { surah: 20, letters: "طه" },
  { surah: 26, letters: "طسم" },
  { surah: 27, letters: "طس" },
  { surah: 36, letters: "يس" },
  { surah: 38, letters: "ص" },
  { surah: 40, letters: "حم" },
  { surah: 42, letters: "حم عسق" },
  { surah: 50, letters: "ق" },
  { surah: 68, letters: "ن" },
];
const MUQATTAAT_REPEAT_SURAHS = [19, 42, 26, 2, 10, 40]; // كهيعص, حم عسق, طسم, الم, الر, حم

function buildMuqattaatSample() {
  const picks = MUQATTAAT.map((m) => ({ surah: m.surah, ayah: 1, bucket: "muqattaat", letters: m.letters }));
  for (const surah of MUQATTAAT_REPEAT_SURAHS) {
    const m = MUQATTAAT.find((x) => x.surah === surah);
    picks.push({ surah, ayah: 1, bucket: "muqattaat", letters: m.letters, repeat: true });
  }
  return picks; // 20
}

// --- Strata 3: direct regression check (10 pairs) ---
// Surah 114 ayah 4 (الوسواس الخناس — the ayah this whole investigation
// started from) across all 5 reciters, plus ayah 1 (a contrasting, simpler
// ayah from the same short surah) across all 5, as a same-surah baseline.
function buildRegressionSample() {
  const pairs = [];
  for (const ayah of [4, 1]) {
    for (const reciter of RECITERS) {
      pairs.push({ surah: 114, ayah, bucket: "regression", reciter });
    }
  }
  return pairs; // 10
}

function buildSamplePairs() {
  const bulk = buildBulkSample(); // 120, no reciter yet
  const muqattaat = buildMuqattaatSample(); // 20, no reciter yet
  const regression = buildRegressionSample(); // 10, reciter already assigned

  let rr = 0;
  const nextReciter = () => RECITERS[rr++ % RECITERS.length];

  const pairs = [];
  for (const p of bulk) pairs.push({ ...p, reciter: nextReciter() });
  for (const p of muqattaat) pairs.push({ ...p, reciter: nextReciter() });
  pairs.push(...regression);
  return pairs; // 150
}

// --- Audio: fetch mp3, decode+resample via ffmpeg (already on PATH; same
// tool used manually earlier this session for the Phase 3 ASR sanity
// tests) straight to 16-bit mono PCM at 16kHz, no temp files. ---
function mp3BufferToFloat16k(mp3Buffer) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ar", "16000", "-ac", "1", "pipe:1"],
    { input: mp3Buffer, maxBuffer: 1024 * 1024 * 50 }
  );
  if (result.status !== 0) {
    throw new Error(`ffmpeg failed: ${(result.stderr?.toString() || "").slice(0, 300)}`);
  }
  const pcm = result.stdout;
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

async function fetchAudioAsFloat16k(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed (HTTP ${res.status})`);
  const buf = Buffer.from(await res.arrayBuffer());
  return mp3BufferToFloat16k(buf);
}

async function main() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const limitIdx = args.indexOf("--limit");
  const limit = limitIdx === -1 ? Infinity : parseInt(args[limitIdx + 1], 10);

  const pairs = buildSamplePairs();
  console.log(`Sample built: ${pairs.length} (ayah, reciter) pairs.`);

  const existing = fs.existsSync(OUT_FILE)
    ? new Map(
        JSON.parse(fs.readFileSync(OUT_FILE, "utf8"))
          .records.filter((r) => !r.error)
          .map((r) => [r.key, r])
      )
    : new Map();

  console.log(`Loading ASR model ${MODEL_ID} (cached after first run)...`);
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

  let processed = 0;
  const started = Date.now();

  for (const p of pairs) {
    if (processed >= limit) break;
    const key = `${p.surah}:${p.ayah}:${p.reciter.folder}${p.repeat ? ":repeat" : ""}`;
    if (existing.has(key)) continue;

    try {
      const ayahs = await fetchSurahText(p.surah);
      const ayahData = ayahs.find((a) => a.number === p.ayah);
      if (!ayahData) throw new Error(`ayah ${p.surah}:${p.ayah} not found in surah text`);
      const expectedText = ayahData.arabic;

      const url = getAudioUrl(p.reciter.folder, p.surah, p.ayah);
      const audio16k = await fetchAudioAsFloat16k(url);

      const asrResult = await transcriber(audio16k, {
        language: "arabic",
        task: "transcribe",
        return_timestamps: "word",
        chunk_length_s: 30,
      });

      const expectedWordsOriginal = expectedText.trim().split(/\s+/).filter(Boolean);
      const expectedWords = expectedWordsOriginal.map(normalizeArabic);
      const chunks = asrResult?.chunks || [];
      const recognizedWords = chunks.map((c) => normalizeArabic((c.text || "").trim()));
      const alignments = alignWords(expectedWords, recognizedWords);

      const missed = alignments.filter((a) => a.similarity < 0.35).length;
      const shaky = alignments.filter((a) => a.similarity >= 0.35 && a.similarity < 0.7).length;
      const clean = alignments.filter((a) => a.similarity >= 0.7).length;
      const sumSimilarity = alignments.reduce((s, a) => s + a.similarity, 0);

      existing.set(key, {
        key,
        surah: p.surah,
        ayah: p.ayah,
        reciter: p.reciter.folder,
        bucket: p.bucket,
        letters: p.letters || null,
        repeat: p.repeat || false,
        wordCount: expectedWordsOriginal.length,
        missed,
        shaky,
        clean,
        sumSimilarity,
        expectedText,
        recognizedText: asrResult?.text?.trim() || "",
      });
    } catch (err) {
      existing.set(key, {
        key,
        surah: p.surah,
        ayah: p.ayah,
        reciter: p.reciter.folder,
        bucket: p.bucket,
        error: err.message,
      });
    }

    processed++;
    if (processed % 5 === 0 || processed === pairs.length) {
      const rate = processed / ((Date.now() - started) / 1000);
      fs.writeFileSync(OUT_FILE, JSON.stringify({ model: MODEL_ID, records: [...existing.values()] }, null, 1));
      console.log(`processed ${processed}/${pairs.length} (total cached ${existing.size}) — ${rate.toFixed(2)} rec/s`);
    }
  }

  fs.writeFileSync(OUT_FILE, JSON.stringify({ model: MODEL_ID, records: [...existing.values()] }, null, 1));
  console.log(`\nDone. ${existing.size} records in ${OUT_FILE}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
