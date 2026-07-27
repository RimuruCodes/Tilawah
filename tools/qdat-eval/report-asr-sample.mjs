// Reports the Phase 2 ASR sample validation (see asr-sample-eval.mjs +
// README.md), broken down by reciter, ayah-length bucket, surah-length
// bucket, and muqatta'at-vs-not — word-count-weighted (a word in Al-Baqarah
// 2:282 counts the same as a word in a 3-word ayah, not the whole ayah as
// one unit), not a single aggregate.
//   npx vite-node tools/qdat-eval/report-asr-sample.mjs
import fs from "node:fs";
import path from "node:path";

const resultsFile = path.join("tools", "qdat-eval", "asr-sample-results.json");
const { model, records } = JSON.parse(fs.readFileSync(resultsFile, "utf8"));
const usable = records.filter((r) => !r.error);
const failed = records.filter((r) => r.error);

// Ayah-length buckets, by the ayah's OWN word count (distinct from the
// surah-length buckets already assigned at sampling time).
function ayahLengthBucket(wordCount) {
  if (wordCount <= 5) return "short (<=5 words)";
  if (wordCount <= 15) return "medium (6-15 words)";
  return "long (16+ words)";
}

function weighted(group) {
  const wordCount = group.reduce((s, r) => s + r.wordCount, 0);
  const missed = group.reduce((s, r) => s + r.missed, 0);
  const shaky = group.reduce((s, r) => s + r.shaky, 0);
  const clean = group.reduce((s, r) => s + r.clean, 0);
  const sumSimilarity = group.reduce((s, r) => s + r.sumSimilarity, 0);
  return {
    ayahs: group.length,
    words: wordCount,
    cleanRate: wordCount ? clean / wordCount : null,
    shakyRate: wordCount ? shaky / wordCount : null,
    missedRate: wordCount ? missed / wordCount : null,
    avgSimilarity: wordCount ? sumSimilarity / wordCount : null,
  };
}

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function reportGroup(title, groups) {
  console.log(`\n${title}`);
  for (const [label, group] of groups) {
    if (group.length === 0) continue;
    const w = weighted(group);
    console.log(
      `  ${label.padEnd(24)} n=${String(w.ayahs).padStart(3)} ayahs, ${String(w.words).padStart(4)} words` +
        `  |  clean ${pct(w.cleanRate)}  shaky ${pct(w.shakyRate)}  missed ${pct(w.missedRate)}` +
        `  |  avg word similarity ${w.avgSimilarity?.toFixed(3) ?? "n/a"}`
    );
  }
}

console.log(`Model: ${model}`);
console.log(`Total pairs: ${records.length}  (usable=${usable.length}, failed/errored=${failed.length})`);
if (failed.length) {
  console.log(`\nFailed pairs (excluded from accuracy, not hidden):`);
  for (const f of failed) console.log(`  ${f.surah}:${f.ayah} (${f.reciter}) — ${f.error}`);
}

console.log(`\n=== OVERALL (word-count-weighted) ===`);
reportGroup("", [["all", usable]]);

reportGroup(
  "=== BY RECITER ===",
  [...new Set(usable.map((r) => r.reciter))].sort().map((reciter) => [reciter, usable.filter((r) => r.reciter === reciter)])
);

reportGroup(
  "=== BY SURAH-LENGTH BUCKET (short <=20 ayahs / medium 21-100 / long >100) ===",
  ["short", "medium", "long"].map((b) => [b, usable.filter((r) => r.bucket === b)])
);

const ayahBucketOrder = ["short (<=5 words)", "medium (6-15 words)", "long (16+ words)"];
const byAyahLen = new Map(ayahBucketOrder.map((b) => [b, []]));
for (const r of usable) {
  if (r.bucket === "muqattaat" || r.bucket === "regression") continue; // reported separately below
  byAyahLen.get(ayahLengthBucket(r.wordCount)).push(r);
}
reportGroup("=== BY AYAH-LENGTH BUCKET (word count, bulk sample only) ===", [...byAyahLen.entries()]);

console.log(`\n=== MUQATTA'AT vs EVERYTHING ELSE ===`);
const muqattaat = usable.filter((r) => r.bucket === "muqattaat");
const notMuqattaat = usable.filter((r) => r.bucket !== "muqattaat");
reportGroup("", [
  ["muqatta'at ayahs", muqattaat],
  ["everything else", notMuqattaat],
]);

console.log(`\n=== MUQATTA'AT, PER LETTER-GROUP ===`);
reportGroup(
  "",
  [...new Set(muqattaat.map((r) => r.letters))].map((letters) => [letters, muqattaat.filter((r) => r.letters === letters)])
);

console.log(`\n=== REGRESSION CHECK: Surah 114 (4=الوسواس الخناس, 1=baseline), all 5 reciters ===`);
const regression = usable.filter((r) => r.bucket === "regression");
for (const r of regression.sort((a, b) => a.ayah - b.ayah || a.reciter.localeCompare(b.reciter))) {
  console.log(
    `  114:${r.ayah} (${r.reciter.padEnd(28)}) clean=${r.clean}/${r.wordCount} shaky=${r.shaky} missed=${r.missed}  recognized: "${r.recognizedText}"`
  );
}
