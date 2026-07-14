import { describe, it, expect } from "vitest";
import { computeCurrentStreak } from "@/lib/streaks";

const TODAY = new Date("2026-06-15T12:00:00Z");

function daysAgo(n) {
  const d = new Date(TODAY);
  d.setDate(TODAY.getDate() - n);
  return d.toISOString().split("T")[0];
}

describe("computeCurrentStreak", () => {
  it("is 0 with no streak records", () => {
    expect(computeCurrentStreak([], TODAY)).toBe(0);
  });

  it("still counts a streak through yesterday even if today has no recording yet", () => {
    // Not having practiced *yet* today shouldn't zero out an existing
    // streak — only a genuine gap on an earlier day should.
    const streaks = [{ date: daysAgo(1), total_recordings: 3 }];
    expect(computeCurrentStreak(streaks, TODAY)).toBe(1);
  });

  it("is 0 when there's a gap before today and nothing recorded today", () => {
    const streaks = [{ date: daysAgo(2), total_recordings: 3 }];
    expect(computeCurrentStreak(streaks, TODAY)).toBe(0);
  });

  it("counts consecutive days ending today", () => {
    const streaks = [
      { date: daysAgo(0), total_recordings: 2 },
      { date: daysAgo(1), total_recordings: 1 },
      { date: daysAgo(2), total_recordings: 4 },
    ];
    expect(computeCurrentStreak(streaks, TODAY)).toBe(3);
  });

  it("stops counting at the first gap", () => {
    const streaks = [
      { date: daysAgo(0), total_recordings: 2 },
      { date: daysAgo(1), total_recordings: 1 },
      // gap at daysAgo(2)
      { date: daysAgo(3), total_recordings: 5 },
    ];
    expect(computeCurrentStreak(streaks, TODAY)).toBe(2);
  });

  it("ignores a day with a record but zero recordings", () => {
    const streaks = [{ date: daysAgo(0), total_recordings: 0 }];
    expect(computeCurrentStreak(streaks, TODAY)).toBe(0);
  });
});
