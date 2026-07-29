// Verifies the ACTUAL shipped fixes (not a simulation copy) against the
// 150-pair corpus: waqf-mark filtering (splitAyahIntoWords) and the
// narrowed alif-wasla normalization fix (normalizeArabic), both in
// src/lib/tajweedAnalysis.js and src/lib/tajweedRules.js as committed.
import fs from "node:fs";
import path from "node:path";
import { alignWords, normalizeArabic } from "@/lib/tajweedAnalysis";
import { splitAyahIntoWords } from "@/lib/tajweedRules";

const IN_FILE = path.join("tools", "qdat-eval", "asr-sample-results.json");

function summarize(records, splitFn) {
  let occurrences = 0, misses = 0, shaky = 0, clean = 0;
  const missedWords = new Map();
  for (const r of records) {
    const expectedWordsOriginal = splitFn(r.expectedText);
    const expectedWords = expectedWordsOriginal.map(normalizeArabic);
    const recognizedWords = r.recognizedText.trim().split(/\s+/).filter(Boolean).map(normalizeArabic);
    const alignments = alignWords(expectedWords, recognizedWords);
    alignments.forEach((a, i) => {
      occurrences++;
      if (a.similarity < 0.35) {
        misses++;
        const w = expectedWordsOriginal[i];
        missedWords.set(w, (missedWords.get(w) || 0) + 1);
      } else if (a.similarity < 0.7) {
        shaky++;
      } else {
        clean++;
      }
    });
  }
  return { occurrences, misses, shaky, clean, missedWords };
}

function main() {
  const data = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
  const records = data.records.filter((r) => !r.error && r.expectedText && r.recognizedText != null);

  const oldSplit = (text) => text.trim().split(/\s+/).filter(Boolean);
  const before = summarize(records, oldSplit);
  const after = summarize(records, splitAyahIntoWords);

  console.log(`Corpus: ${records.length} pairs.\n`);
  console.log("BEFORE (raw split, no waqf filter, old normalizeArabic simulation N/A here — this run uses the ACTUAL current normalizeArabic for both, isolating just the split-function difference):");
  console.log(`  occurrences=${before.occurrences} missed=${before.misses} shaky=${before.shaky} clean=${before.clean}`);
  console.log("AFTER (splitAyahIntoWords, filters non-word tokens):");
  console.log(`  occurrences=${after.occurrences} missed=${after.misses} shaky=${after.shaky} clean=${after.clean}`);
  console.log(`\nNet: occurrences ${before.occurrences} -> ${after.occurrences} (${after.occurrences - before.occurrences}), missed ${before.misses} -> ${after.misses} (${after.misses - before.misses})`);

  console.log("\nTop missed words AFTER fix (should contain no waqf marks):");
  [...after.missedWords.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).forEach(([w, c]) => console.log(`  ${c}x "${w}"`));
}

main();
