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
// Exported as a plain function (testable without any React rendering) plus
// a thin useMemo hook wrapper for use inside components.
export function findActiveWord(words, currentTimeSec) {
  if (!words || !words.length || currentTimeSec == null) return null;
  for (const word of words) {
    if (currentTimeSec >= word.startSec && currentTimeSec < word.endSec) {
      return word;
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
