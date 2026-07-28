import { describe, it, expect } from "vitest";
import { getCountdown, APP_STORE_RELEASE_DATE } from "@/lib/countdown";

describe("getCountdown", () => {
  const TARGET = new Date("2026-08-25T00:00:00Z");

  it("computes exact days/hours/minutes/seconds remaining", () => {
    // Exactly 2 days, 3 hours, 4 minutes, 5 seconds before the target.
    const now = new Date(TARGET.getTime() - (2 * 86400 + 3 * 3600 + 4 * 60 + 5) * 1000);
    const result = getCountdown(TARGET, now);
    expect(result).toEqual({ isPast: false, days: 2, hours: 3, minutes: 4, seconds: 5 });
  });

  it("rolls over correctly at unit boundaries (59s -> next minute, 23h -> next day)", () => {
    // 1 second before the target: 0 days, 0 hours, 0 minutes, 1 second (not
    // 0/0/0/-1 or any negative/overflowed value).
    const oneSecondBefore = new Date(TARGET.getTime() - 1000);
    expect(getCountdown(TARGET, oneSecondBefore)).toEqual({ isPast: false, days: 0, hours: 0, minutes: 0, seconds: 1 });

    // Just under a full day before: 23 hours, 59 minutes, 59 seconds, 0 days.
    const justUnderADay = new Date(TARGET.getTime() - (86400 * 1000 - 1000));
    expect(getCountdown(TARGET, justUnderADay)).toEqual({ isPast: false, days: 0, hours: 23, minutes: 59, seconds: 59 });
  });

  it("never returns negative numbers once the target has passed", () => {
    const afterTarget = new Date(TARGET.getTime() + 5000);
    const result = getCountdown(TARGET, afterTarget);
    expect(result.isPast).toBe(true);
    expect(result.days).toBeGreaterThanOrEqual(0);
    expect(result.hours).toBeGreaterThanOrEqual(0);
    expect(result.minutes).toBeGreaterThanOrEqual(0);
    expect(result.seconds).toBeGreaterThanOrEqual(0);
  });

  it("treats the exact target instant itself as already past (not a 0/0/0/0 countdown)", () => {
    const result = getCountdown(TARGET, new Date(TARGET.getTime()));
    expect(result.isPast).toBe(true);
  });

  it("stays past for a long time after the target (release day has come and gone)", () => {
    const wellAfter = new Date(TARGET.getTime() + 30 * 86400 * 1000); // 30 days later
    expect(getCountdown(TARGET, wellAfter).isPast).toBe(true);
  });

  it("APP_STORE_RELEASE_DATE is midnight UTC on 2026-08-25", () => {
    expect(APP_STORE_RELEASE_DATE.toISOString()).toBe("2026-08-25T00:00:00.000Z");
  });
});
