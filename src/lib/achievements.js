// Pure detection for the two celebration-worthy moments: beating a personal
// best on an ayah, and crossing a practice-streak milestone. Kept I/O-free
// so the thresholds are unit-tested directly; the persistence layer
// (persistRecitationResult) feeds these the numbers it already has.

// Milestones worth a moment — spaced so they stay meaningful rather than
// firing every day. Ascending.
export const MILESTONE_STREAKS = [3, 7, 14, 30, 60, 100, 180, 365];

// A new personal best requires an EXISTING best to beat — the very first
// attempt at an ayah isn't "beating" anything, so it doesn't celebrate.
export function isNewPersonalBest(priorBest, newScore) {
  if (typeof newScore !== "number" || !Number.isFinite(newScore)) return false;
  if (priorBest == null) return false;
  return newScore > priorBest;
}

// Returns the milestone just crossed (the highest one, if the streak jumped
// more than one), or null. Only fires when the streak actually grew.
export function reachedStreakMilestone(prevStreak, newStreak) {
  if (!(newStreak > prevStreak)) return null;
  const crossed = MILESTONE_STREAKS.filter((m) => m > prevStreak && m <= newStreak);
  return crossed.length ? crossed[crossed.length - 1] : null;
}
