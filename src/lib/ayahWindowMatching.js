// Continuous Recitation lets someone tap "Next Ayah" as they go, but that
// tap timing is fallible — a tap slightly early/late, a missed tap, or a
// double-tap all desync the app's guess of "how many ayahs did you just
// recite" from what you actually said. If that guess is wrong, the
// reference audio built from it covers the wrong amount of content, which
// tanks the score for reasons that have nothing to do with recitation
// quality.
//
// Two corrective signals live here, tried in order of strength:
//  1. pickAyahCountFromTranscript — what the ASR actually heard, matched
//     against the surah's words (strongest, but only as reliable as the
//     transcript; it declares itself unreliable rather than guessing).
//  2. pickBestAyahCount — the recording's duration vs. cumulative
//     reference durations (always available, used as the fallback).
import { normalizeArabic, alignWords } from "@/lib/tajweedAnalysis";

// How well the best candidate must explain the transcript before the
// transcript method is trusted over duration matching. Garbled audio and
// generic-model mistranscription land far below this; genuine recitation
// with a working ASR lands well above it.
const TRANSCRIPT_RELIABLE_MIN_F1 = 0.45;
// A word counts as recognized at this alignment similarity — same bar the
// Tajweed word feedback uses for "recognized, but not cleanly".
const WORD_MATCH_MIN_SIMILARITY = 0.5;

// Picks the recited-ayah count by aligning the ASR transcript against the
// first k ayahs' words for each candidate k, scoring each F1-style:
// missing expected words penalize a too-large k, unexplained recognized
// words penalize a too-small k. Ties prefer the tapped count. Returns
// { reliable: false } instead of a guess when even the best candidate
// explains the transcript poorly — callers then fall back to duration.
export function pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount, searchMargin = 6 }) {
  const total = ayahTexts.length;
  const recognizedWords = (transcriptText || "")
    .split(/\s+/)
    .map(normalizeArabic)
    .filter(Boolean);
  if (total === 0 || recognizedWords.length === 0) {
    return { reliable: false, resolvedCount: taggedCount, taggedCount };
  }

  const ayahWords = ayahTexts.map((text) =>
    (text || "").split(/\s+/).map(normalizeArabic).filter(Boolean)
  );

  const minCount = Math.max(1, taggedCount - searchMargin);
  const maxCount = Math.min(total, taggedCount + searchMargin);

  let best = null;
  for (let count = minCount; count <= maxCount; count++) {
    const expectedWords = ayahWords.slice(0, count).flat();
    if (expectedWords.length === 0) continue;
    const alignment = alignWords(expectedWords, recognizedWords);
    const matched = alignment.filter(
      (a) => a.recognizedIndex != null && a.similarity >= WORD_MATCH_MIN_SIMILARITY
    ).length;
    const recall = matched / expectedWords.length;
    const precision = matched / recognizedWords.length;
    const f1 = precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall);
    const tieBreak = Math.abs(count - taggedCount);
    if (!best || f1 > best.f1 || (f1 === best.f1 && tieBreak < best.tieBreak)) {
      best = { count, f1, tieBreak };
    }
  }

  if (!best || best.f1 < TRANSCRIPT_RELIABLE_MIN_F1) {
    return { reliable: false, resolvedCount: taggedCount, taggedCount };
  }
  return {
    reliable: true,
    resolvedCount: best.count,
    taggedCount,
    corrected: best.count !== Math.min(taggedCount, total),
    matchScore: Math.round(best.f1 * 100) / 100,
  };
}

// Duration-based fallback: search a window of ayah-counts around the
// tapped count, and pick whichever count's expected reference duration is
// closest to how long the person actually recorded for.

// `ayahDurationsSec[i]` is the reference reciter's duration (seconds) for
// ayah i+1. `taggedCount` is how many ayahs the person's taps indicated.
// Returns the best-fit count, plus whether it differs from what was
// tapped (so the UI can be transparent about the correction).
export function pickBestAyahCount({ ayahDurationsSec, gapSec, userDurationSec, taggedCount, searchMargin = 6 }) {
  const total = ayahDurationsSec.length;
  if (total === 0) {
    return { resolvedCount: taggedCount, taggedCount, corrected: false };
  }

  const minCount = Math.max(1, taggedCount - searchMargin);
  const maxCount = Math.min(total, taggedCount + searchMargin);

  const cumDurations = [];
  let cumulative = 0;
  for (let i = 0; i < maxCount; i++) {
    cumulative += (ayahDurationsSec[i] || 0) + gapSec;
    cumDurations.push(cumulative);
  }

  let bestCount = Math.min(taggedCount, total);
  let bestDiff = Infinity;
  for (let count = minCount; count <= maxCount; count++) {
    const diff = Math.abs(cumDurations[count - 1] - userDurationSec);
    if (diff < bestDiff) {
      bestDiff = diff;
      bestCount = count;
    }
  }

  return {
    resolvedCount: bestCount,
    taggedCount,
    corrected: bestCount !== Math.min(taggedCount, total),
  };
}
