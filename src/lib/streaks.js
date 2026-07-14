// Extracted from Progress.jsx so "how many consecutive days in a row has
// this person practiced" is computed in exactly one place (also used by
// Home), instead of copies of the same date-walking loop drifting apart.
//
// `today` is injectable (defaults to the real current time) purely so this
// is deterministic to unit test; callers in the app never pass it.
export function computeCurrentStreak(streaks, today = new Date()) {
  let streak = 0;
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    if (streaks.find((s) => s.date === dateStr && s.total_recordings > 0)) {
      streak++;
    } else if (i > 0) {
      break;
    }
  }
  return streak;
}
