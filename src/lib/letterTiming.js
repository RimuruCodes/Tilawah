// Letter-level highlighting timing — for EVERY reciter, QUA-covered or not.
//
// QUA also publishes a letter-timing tier, but it's segmented phonetically
// (sun-letter assimilation, hamzatul-wasl silence, shaddah gemination all
// collapse into single acoustic tokens), not per Uthmani codepoint. It does
// not line up positionally with this app's own charIndex convention (an
// index into the raw, fully-diacritic Uthmani word — see tajweedRules.js),
// and reconciling the two would mean reimplementing Arabic assimilation
// rules — a substantially harder problem than the one word-level ground
// truth solved, not a smaller version of it. See quaReferenceData.js's own
// header for the full investigation.
//
// So letter timing is built the same way for every reciter: take a word's
// own timing window — QUA ground truth (confidence 1) or ASR-estimated
// (confidence = word-alignment similarity) — and divide it evenly across
// that word's base letters. The word's own confidence carries through
// unchanged: it's the most honest signal available for "how much to trust
// this window," and a made-up discount for the extra subdivision would
// itself be a fabricated precision claim. What's genuinely true, always, is
// that the LETTER's position within the word is an estimate — never
// verified ground truth, even when the word boundary is. Callers (see
// AyahDisplay.jsx) render letter highlighting accordingly.
import { splitAyahIntoWords, baseLetterCharIndexes } from "@/lib/tajweedRules";

// `wordTimings`: array of { wordIndex, startSec, endSec, confidence } — from
// either getQuaWordWindowsForAyah (quaReferenceData.js, ground truth) or
// buildWordTimings (tajweedAnalysis.js, ASR-estimated from the user's own
// recording). Same shape either way, so this needs no source-specific branch.
// `ayahArabicText`: the ayah's own text (already Basmalah-stripped by
// fetchSurahText — see quranData.js), used only to know how many base
// letters each word has.
// Returns null (never an empty array) when there's nothing to divide, so
// callers can fall back to word-level highlighting cleanly.
export function buildLetterTimings(wordTimings, ayahArabicText) {
  if (!wordTimings?.length || !ayahArabicText) return null;
  const words = splitAyahIntoWords(ayahArabicText);
  const letters = [];

  for (const w of wordTimings) {
    const word = words[w.wordIndex];
    if (!word) continue;
    const duration = w.endSec - w.startSec;
    if (!(duration > 0)) continue;
    const charIndexes = baseLetterCharIndexes(word);
    if (!charIndexes.length) continue;

    const sliceSec = duration / charIndexes.length;
    charIndexes.forEach((charIndex, i) => {
      const startSec = w.startSec + sliceSec * i;
      const endSec = i === charIndexes.length - 1 ? w.endSec : startSec + sliceSec;
      letters.push({ wordIndex: w.wordIndex, charIndex, startSec, endSec, confidence: w.confidence });
    });
  }

  return letters.length ? letters : null;
}
