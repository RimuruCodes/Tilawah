// Default reciter playback speed for the Surah Reader's AudioPlayer.
// Follows the same persisted-preference pattern as arabicTextSize.js/
// arabicFont.js. Deliberately scoped to reciter LISTENING playback only
// (AudioPlayer.jsx) — not ComparePlayback.jsx's synced user-vs-reference
// pace comparison (changing rate there would defeat the point of a pace
// comparison) and not RecordingModal.jsx's playback of the user's OWN
// recording (nothing to do with reciter listening speed).
const KEY = "qc_playback_speed";

export const PLAYBACK_SPEEDS = [
  { id: "0.75", label: "0.75×", rate: 0.75 },
  { id: "1", label: "1×", rate: 1 },
  { id: "1.25", label: "1.25×", rate: 1.25 },
  { id: "1.5", label: "1.5×", rate: 1.5 },
];

const DEFAULT_SPEED = "1";

export function getPlaybackSpeedId() {
  const stored = localStorage.getItem(KEY);
  return PLAYBACK_SPEEDS.some((s) => s.id === stored) ? stored : DEFAULT_SPEED;
}

export function setPlaybackSpeedId(id) {
  if (PLAYBACK_SPEEDS.some((s) => s.id === id)) {
    localStorage.setItem(KEY, id);
  }
}

export function getPlaybackRate(id = getPlaybackSpeedId()) {
  return (PLAYBACK_SPEEDS.find((s) => s.id === id) || PLAYBACK_SPEEDS[1]).rate;
}
