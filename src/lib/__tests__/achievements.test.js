import { describe, expect, it } from "vitest";
import { isNewPersonalBest, reachedStreakMilestone, MILESTONE_STREAKS } from "@/lib/achievements";

describe("isNewPersonalBest", () => {
  it("celebrates only when a prior best is strictly beaten", () => {
    expect(isNewPersonalBest(80, 85)).toBe(true);
    expect(isNewPersonalBest(80, 80)).toBe(false); // tie is not a new best
    expect(isNewPersonalBest(80, 75)).toBe(false);
  });

  it("does not celebrate the first-ever attempt (no prior best to beat)", () => {
    expect(isNewPersonalBest(null, 95)).toBe(false);
    expect(isNewPersonalBest(undefined, 95)).toBe(false);
  });

  it("ignores non-numeric scores", () => {
    expect(isNewPersonalBest(50, NaN)).toBe(false);
    expect(isNewPersonalBest(50, undefined)).toBe(false);
  });
});

describe("reachedStreakMilestone", () => {
  it("fires exactly when a milestone day is crossed", () => {
    expect(reachedStreakMilestone(6, 7)).toBe(7);
    expect(reachedStreakMilestone(2, 3)).toBe(3);
    expect(reachedStreakMilestone(29, 30)).toBe(30);
  });

  it("returns null on non-milestone growth and on a flat/decreasing streak", () => {
    expect(reachedStreakMilestone(7, 8)).toBeNull(); // 8 isn't a milestone
    expect(reachedStreakMilestone(7, 7)).toBeNull(); // same day, no growth
    expect(reachedStreakMilestone(10, 4)).toBeNull(); // streak reset
  });

  it("returns the highest milestone crossed if the streak jumps several", () => {
    // Not expected in practice, but must be well-defined.
    expect(reachedStreakMilestone(1, 30)).toBe(30);
  });

  it("every milestone is individually detectable", () => {
    for (const m of MILESTONE_STREAKS) {
      expect(reachedStreakMilestone(m - 1, m)).toBe(m);
    }
  });
});
