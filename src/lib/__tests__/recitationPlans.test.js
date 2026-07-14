import { describe, it, expect } from "vitest";
import { JUZ_AMMA_PLAN, getPlanProgress } from "@/lib/recitationPlans";
import { DUAS, DUA_CATEGORIES } from "@/lib/duasData";
import { ARABIC_COMFORT_LEVELS, defaultShowTranslation } from "@/lib/arabicComfort";

describe("Juz Amma plan structure", () => {
  it("is exactly 30 days covering surahs 78-114 once each", () => {
    expect(JUZ_AMMA_PLAN.days).toHaveLength(30);
    const covered = JUZ_AMMA_PLAN.days.flatMap((d) => d.surahs);
    expect([...covered].sort((a, b) => a - b)).toEqual(
      Array.from({ length: 37 }, (_, i) => 78 + i)
    );
    expect(new Set(covered).size).toBe(37);
  });

  it("numbers days sequentially", () => {
    expect(JUZ_AMMA_PLAN.days.map((d) => d.day)).toEqual(Array.from({ length: 30 }, (_, i) => i + 1));
  });
});

describe("plan progress from recitation logs", () => {
  const started = "2026-07-01T00:00:00Z";
  const log = (surah, date = "2026-07-02T10:00:00Z") => ({ surah_number: surah, created_date: date });

  it("counts a day complete only when every target surah is practiced after the start", () => {
    // Day 1 = surah 78; day 24 = surahs 101+102.
    const progress = getPlanProgress(JUZ_AMMA_PLAN, started, [log(78), log(101)]);
    expect(progress.completedDays).toBe(1); // only day 1 (101 alone doesn't finish day 24)
    expect(progress.currentDay.day).toBe(2);
  });

  it("ignores practice from before the plan started", () => {
    const progress = getPlanProgress(JUZ_AMMA_PLAN, started, [log(78, "2026-06-20T10:00:00Z")]);
    expect(progress.completedDays).toBe(0);
    expect(progress.currentDay.day).toBe(1);
  });

  it("reports finished when every day's surahs are practiced", () => {
    const logs = JUZ_AMMA_PLAN.days.flatMap((d) => d.surahs.map((s) => log(s)));
    const progress = getPlanProgress(JUZ_AMMA_PLAN, started, logs);
    expect(progress.finished).toBe(true);
    expect(progress.completedDays).toBe(30);
  });
});

describe("duas content policy", () => {
  it("every dua has all fields and a Quran/Sahih-only source", () => {
    expect(DUAS.length).toBeGreaterThanOrEqual(10);
    for (const dua of DUAS) {
      expect(dua.arabic?.length).toBeGreaterThan(3);
      expect(dua.transliteration?.length).toBeGreaterThan(3);
      expect(dua.translation?.length).toBeGreaterThan(3);
      expect(dua.source).toMatch(/^(Quran|Sahih al-Bukhari|Sahih Muslim)/);
      expect(DUA_CATEGORIES.some((c) => c.id === dua.category)).toBe(true);
    }
  });
});

describe("arabic comfort defaults", () => {
  it("hides translation by default only for fluent readers", () => {
    expect(defaultShowTranslation("fluent")).toBe(false);
    expect(defaultShowTranslation("comfortable")).toBe(true);
    expect(defaultShowTranslation("beginner")).toBe(true);
    expect(ARABIC_COMFORT_LEVELS.map((l) => l.id)).toEqual(["beginner", "comfortable", "fluent"]);
  });
});
