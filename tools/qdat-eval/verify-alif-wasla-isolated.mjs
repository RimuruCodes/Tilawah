import fs from "node:fs";
import path from "node:path";
import { alignWords } from "@/lib/tajweedAnalysis";
import { splitAyahIntoWords } from "@/lib/tajweedRules";

const IN_FILE = path.join("tools", "qdat-eval", "asr-sample-results.json");
const DIACRITICS_RE = /[ً-ْٰٓ]/g;
const TATWEEL_RE = /ـ/g;
const NON_ARABIC_LETTER_RE = /[^ء-ي]/g;

// Original (pre-fix) normalizeArabic, no alif-wasla handling at all.
function normalizeOriginal(word) {
  return word
    .replace(DIACRITICS_RE, "")
    .replace(TATWEEL_RE, "")
    .replace(NON_ARABIC_LETTER_RE, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}
// Current (shipped) normalizeArabic, alif-wasla -> ا only.
function normalizeShipped(word) {
  return word
    .replace(/ٱ/g, "ا")
    .replace(DIACRITICS_RE, "")
    .replace(TATWEEL_RE, "")
    .replace(NON_ARABIC_LETTER_RE, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

function summarize(records, normalizeFn) {
  let occurrences = 0, misses = 0, shaky = 0, clean = 0;
  for (const r of records) {
    const expectedWordsOriginal = splitAyahIntoWords(r.expectedText);
    const expectedWords = expectedWordsOriginal.map(normalizeFn);
    const recognizedWords = r.recognizedText.trim().split(/\s+/).filter(Boolean).map(normalizeFn);
    const alignments = alignWords(expectedWords, recognizedWords);
    alignments.forEach((a) => {
      occurrences++;
      if (a.similarity < 0.35) misses++;
      else if (a.similarity < 0.7) shaky++;
      else clean++;
    });
  }
  return { occurrences, misses, shaky, clean };
}

const data = JSON.parse(fs.readFileSync(IN_FILE, "utf8"));
const records = data.records.filter((r) => !r.error && r.expectedText && r.recognizedText != null);
const before = summarize(records, normalizeOriginal);
const after = summarize(records, normalizeShipped);
console.log("normalizeArabic WITHOUT alif-wasla fix:", before);
console.log("normalizeArabic WITH alif-wasla fix (shipped):", after);
console.log(`shaky: ${before.shaky} -> ${after.shaky} (${after.shaky - before.shaky}), missed: ${before.misses} -> ${after.misses} (${after.misses - before.misses}), clean: ${before.clean} -> ${after.clean} (+${after.clean - before.clean})`);
