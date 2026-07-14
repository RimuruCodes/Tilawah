import { describe, it, expect } from "vitest";
import { todayKey, dateSeed, pickDailyAyahNumber, pickDailyHadith } from "@/lib/dailyContent";

describe("daily content selection", () => {
  it("is deterministic for the same date and different across dates", () => {
    expect(pickDailyAyahNumber("2026-07-13")).toBe(pickDailyAyahNumber("2026-07-13"));
    expect(dateSeed("2026-07-13")).not.toBe(dateSeed("2026-07-14"));
  });

  it("always lands on a valid global ayah number (1..6236)", () => {
    for (let d = 1; d <= 31; d++) {
      const n = pickDailyAyahNumber(`2026-07-${String(d).padStart(2, "0")}`);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(6236);
    }
  });

  it("only ever picks from the two Sahih collections, within range", () => {
    for (let d = 1; d <= 31; d++) {
      const { collection, number } = pickDailyHadith(`2026-08-${String(d).padStart(2, "0")}`);
      expect(["Sahih al-Bukhari", "Sahih Muslim"]).toContain(collection.name);
      expect(number).toBeGreaterThanOrEqual(1);
      expect(number).toBeLessThanOrEqual(collection.maxNumber);
    }
  });

  it("todayKey formats as YYYY-MM-DD", () => {
    expect(todayKey(new Date("2026-07-13T15:30:00Z"))).toBe("2026-07-13");
  });
});
