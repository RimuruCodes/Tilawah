// Phase 1 (ASR-on-real-mistakes investigation, 2026-07): downloads a small,
// deliberately diverse set of REAL human "error" recordings from
// MuazAhmad7/Surah_Ikhlas-Labeled_Dataset (real learners, real annotated
// Tajweed mistakes — not professional reciters, not synthetic), plus a few
// "correct" rows per verse as controls. Saves audio + a manifest with the
// ground-truth annotation so asr-error-testset-run.mjs can compare the ASR's
// transcript against what was ACTUALLY said, not just the canonical text.
//
// Selection is by explicit row index within already-fetched JSON snapshots
// (tools/qdat-eval/ikhlas_rows_*.json) rather than a fresh live query, so the
// exact set here is reproducible from those cached files.
import fs from "node:fs";
import path from "node:path";

const OUT_DIR = path.join("tools", "qdat-eval", "asr-error-audio");
const MANIFEST_FILE = path.join("tools", "qdat-eval", "asr-error-testset.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

const SOURCES = [
  { file: "tools/qdat-eval/ikhlas_rows_1.json", label: "v1a" },
  { file: "tools/qdat-eval/ikhlas_rows_2.json", label: "v1b" },
  { file: "tools/qdat-eval/ikhlas_rows_off400.json", label: "v2" },
  { file: "tools/qdat-eval/ikhlas_rows_off800.json", label: "v3" },
  { file: "tools/qdat-eval/ikhlas_rows_off1200.json", label: "v4" },
];

function loadRows() {
  const all = [];
  for (const { file, label } of SOURCES) {
    const rows = JSON.parse(fs.readFileSync(file, "utf8")).rows.map((r) => r.row);
    rows.forEach((r, i) => all.push({ ...r, _src: label, _idx: i }));
  }
  return all;
}

// Hand-picked for diversity of REAL Tajweed-rule category and verse, found by
// inspecting distinct error_explanation values per verse (see Phase 1 report).
const WANTED_ERRORS = [
  { src: "v1a", idx: 0, why: "Qalqalah (Dal) — verse 1" },
  { src: "v1a", idx: 85, why: "Ha makhraj — verse 1" },
  { src: "v1a", idx: 86, why: "sukoon pronunciation — verse 1" },
  { src: "v1a", idx: 160, why: "Lam tarqiq — verse 1" },
  { src: "v2", idx: 1, why: "hamzat al-wasl — verse 2" },
  { src: "v3", idx: 2, why: "Lam kasra + Qalqalah — verse 3" },
  { src: "v3", idx: 4, why: "Meem sukoon — verse 3" },
  { src: "v4", idx: 0, why: "Izhar of Meem — verse 4" },
  { src: "v4", idx: 4, why: "Fa damma — verse 4" },
  { src: "v4", idx: 2, why: "Lam fatha — verse 4" },
];

async function download(url, destPath) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  fs.writeFileSync(destPath, buf);
  return buf.length;
}

async function main() {
  const all = loadRows();
  const bySrc = new Map();
  for (const r of all) {
    if (!bySrc.has(r._src)) bySrc.set(r._src, []);
    bySrc.get(r._src).push(r);
  }

  const manifest = [];

  // Real error rows, hand-picked for diversity.
  for (const want of WANTED_ERRORS) {
    const rows = bySrc.get(want.src).filter((r) => r.label_name === "error" && r.error_explanation);
    const row = rows[want.idx];
    if (!row) {
      console.log(`SKIP (not found): ${want.src}#${want.idx} — ${want.why}`);
      continue;
    }
    const filename = `error_${want.src}_${want.idx}.wav`;
    const destPath = path.join(OUT_DIR, filename);
    try {
      const bytes = await download(row.audio[0].src, destPath);
      console.log(`Downloaded ${filename} (${bytes} bytes) — ${want.why}`);
      manifest.push({
        filename,
        kind: "real-error",
        why: want.why,
        verseNumber: row.verse_number,
        verseText: row.verse_text,
        errorLocation: row.error_location,
        errorExplanation: row.error_explanation,
        errorCount: row.error_count,
      });
    } catch (err) {
      console.log(`FAILED ${filename}: ${err.message}`);
    }
  }

  // One "correct" control row per verse, for baseline comparison.
  for (const src of ["v1a", "v2", "v3", "v4"]) {
    const rows = bySrc.get(src).filter((r) => r.label_name === "correct");
    const row = rows[0];
    if (!row) continue;
    const filename = `correct_${src}.wav`;
    const destPath = path.join(OUT_DIR, filename);
    try {
      const bytes = await download(row.audio[0].src, destPath);
      console.log(`Downloaded ${filename} (${bytes} bytes) — correct control, verse ${row.verse_number}`);
      manifest.push({
        filename,
        kind: "correct-control",
        verseNumber: row.verse_number,
        verseText: row.verse_text,
      });
    } catch (err) {
      console.log(`FAILED ${filename}: ${err.message}`);
    }
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 1));
  console.log(`\nManifest written: ${MANIFEST_FILE} (${manifest.length} entries)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
