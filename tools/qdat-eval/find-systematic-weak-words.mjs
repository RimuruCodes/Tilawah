// Follow-up to Finding 3 (2026-07): reuses the existing 150-(ayah,reciter)
// broad ASR validation results (tools/qdat-eval/asr-sample-results.json —
// all professionally-recited, presumed-correct audio) to check whether
// كُفُوًا / يَلِدْ's mistranscription (found via the small Al-Ikhlas
// error-testset) is an isolated quirk or part of a broader pattern of
// specific words the model consistently mistranscribes regardless of
// whether the recitation itself is correct.
//
// Methodology note: asr-sample-results.json stores each record's full
// expectedText/recognizedText strings (not the original per-chunk ASR
// timestamps), so word alignment here is redone via alignWords() on a
// whitespace split of recognizedText, not the original chunk boundaries.
// For a frequency-across-150-samples aggregate this is a reasonable proxy
// (chunk vs. whitespace splitting rarely disagrees on where one word ends
// and the next begins for clean Whisper output) but isn't byte-identical to
// the live per-chunk alignment the app itself uses — flagged here rather
// than silently assumed equivalent.
import fs from "node:fs";
import path from "node:path";
import { alignWords, normalizeArabic } from "@/lib/tajweedAnalysis";

const IN_FILE = path.join("tools", "qdat-eval", "asr-sample-results.json");
const OUT_FILE = path.join("tools", "qdat-eval", "systematic-weak-words.json");

function main() {
  const data = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
  const records = data.records.filter((r) => !r.error && r.expectedText && r.recognizedText != null);
  console.log(`Analyzing ${records.length} usable records (of ${data.records.length} total).`);

  // normalized expected word -> { occurrences, misses (similarity<0.7),
  // exampleContexts: [{surah,ayah,reciter,similarity,recognizedNeighbor}] }
  const stats = new Map();

  for (const r of records) {
    const expectedWordsOriginal = r.expectedText.trim().split(/\s+/).filter(Boolean);
    const expectedWords = expectedWordsOriginal.map(normalizeArabic);
    const recognizedWordsOriginal = r.recognizedText.trim().split(/\s+/).filter(Boolean);
    const recognizedWords = recognizedWordsOriginal.map(normalizeArabic);
    const alignments = alignWords(expectedWords, recognizedWords);

    alignments.forEach((a, i) => {
      const key = expectedWords[i];
      if (!key) return;
      if (!stats.has(key)) stats.set(key, { word: expectedWordsOriginal[i], occurrences: 0, misses: 0, examples: [] });
      const s = stats.get(key);
      s.occurrences++;
      if (a.similarity < 0.7) {
        s.misses++;
        if (s.examples.length < 6) {
          s.examples.push({
            surah: r.surah,
            ayah: r.ayah,
            reciter: r.reciter,
            similarity: Math.round(a.similarity * 100) / 100,
            recognizedAs: a.recognizedIndex != null ? recognizedWordsOriginal[a.recognizedIndex] : null,
          });
        }
      }
    });
  }

  // Only words seen >=3 times across the corpus (enough to call a "pattern"
  // rather than one-off ASR noise), sorted by miss rate.
  const flagged = [...stats.values()]
    .filter((s) => s.occurrences >= 3)
    .map((s) => ({ ...s, missRate: s.misses / s.occurrences }))
    .filter((s) => s.missRate >= 0.5)
    .sort((a, b) => b.missRate - a.missRate || b.occurrences - a.occurrences);

  console.log(`\nWords appearing >=3x in the 150-pair corpus with >=50% miss rate: ${flagged.length}\n`);
  for (const f of flagged) {
    console.log(`"${f.word}" — ${f.misses}/${f.occurrences} misses (${Math.round(f.missRate * 100)}%)`);
    for (const ex of f.examples) {
      console.log(`    ${ex.surah}:${ex.ayah} (${ex.reciter}) sim=${ex.similarity} -> heard "${ex.recognizedAs}"`);
    }
  }

  const totalDistinctWords = stats.size;
  const totalWordOccurrences = [...stats.values()].reduce((s, v) => s + v.occurrences, 0);
  console.log(`\nCorpus: ${totalDistinctWords} distinct normalized words, ${totalWordOccurrences} total word occurrences.`);

  fs.writeFileSync(
    OUT_FILE,
    JSON.stringify({ totalDistinctWords, totalWordOccurrences, flagged }, null, 1)
  );
  console.log(`Wrote ${OUT_FILE}`);
}

main();
