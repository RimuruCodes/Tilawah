import { useMemo } from "react";

// Finds which word (if any) is being spoken at `currentTimeSec`, from a
// list of words with already-known timing. This is the ONE shared
// implementation for "which word is playing right now" — meant to be used
// everywhere audio playback needs word highlighting: reciter audio
// (AudioPlayer.jsx), the user's own recording playback (RecordingModal.jsx,
// ContinuousRecitation.jsx), and the synced dual playback in
// ComparePlayback.jsx ("Hear the difference") — rather than each screen
// growing its own copy of this lookup.
//
// Deliberately does no computation of its own — `words` must already carry
// real timing (QUA ground truth, or ASR output produced ahead of time and
// cached). That's what makes it safe to call on every playback tick: it's
// a lookup over data that already exists, never new work triggered by
// playback itself. Never fetch, transcribe, or compute timing from inside
// this hook — see quaReferenceData.js / tajweedAnalysis.js for where word
// timing actually gets produced.
//
// Generic over granularity: works identically for a word list ({ wordIndex,
// startSec, endSec, confidence }) or a letter list ({ wordIndex, charIndex,
// startSec, endSec, confidence }) — the lookup only ever needs startSec/
// endSec, so useLetterHighlight below reuses this exact function rather
// than growing a parallel copy of the same half-open-interval scan.
//
// Exported as a plain function (testable without any React rendering) plus
// thin useMemo hook wrappers for use inside components.
export function findActiveWord(items, currentTimeSec) {
  if (!items || !items.length || currentTimeSec == null) return null;
  for (const item of items) {
    if (currentTimeSec >= item.startSec && currentTimeSec < item.endSec) {
      return item;
    }
  }
  return null;
}

// `words`: array of { wordIndex, startSec, endSec, confidence }, all in
// the SAME timeline as `currentTimeSec` (seconds).
// `currentTimeSec`: current playback position, in seconds.
// Returns the matching word object, or null when no word covers this
// exact position (silence, before the first word, after the last, or no
// timing data at all for this audio).
export function useWordHighlight(words, currentTimeSec) {
  return useMemo(() => findActiveWord(words, currentTimeSec), [words, currentTimeSec]);
}

// Same lookup, letter granularity. `letters`: array of { wordIndex,
// charIndex, startSec, endSec, confidence } — see buildLetterTimings in
// letterTiming.js for how these are produced (always an even-division
// estimate within a word's own timing, whether that word timing itself is
// QUA ground truth or ASR-estimated; see that file for why letter position
// is never verified ground truth even for QUA-covered reciters).
export function useLetterHighlight(letters, currentTimeSec) {
  return useMemo(() => findActiveWord(letters, currentTimeSec), [letters, currentTimeSec]);
}
