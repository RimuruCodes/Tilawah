import { describe, it, expect } from "vitest";
import {
  JUZ_AMMA_PLAN,
  getPlanProgress,
  validateCustomPlanInput,
  buildCustomPlanDays,
  createCustomPlan,
  targetLabel,
  targetSurahNumber,
} from "@/lib/recitationPlans";
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

// Phase 4: custom plans reuse the exact same {day, surahs} shape and
// getPlanProgress logic above -- these pin that the reuse actually holds,
// not just that a plan object gets produced.
describe("custom plan input validation", () => {
  it("accepts a real, sane range", () => {
    expect(validateCustomPlanInput({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 3 })).toBeNull();
  });

  it("rejects an ending point before the starting point", () => {
    expect(
      validateCustomPlanInput({ startSurah: 2, startAyah: 1, endSurah: 1, endAyah: 7, targetDays: 5 })
    ).toMatch(/after the starting point/);
    expect(
      validateCustomPlanInput({ startSurah: 1, startAyah: 5, endSurah: 1, endAyah: 3, targetDays: 1 })
    ).toMatch(/after the starting point/);
  });

  it("rejects an ayah outside the chosen surah's real range", () => {
    // Al-Fatihah (surah 1) has 7 ayahs.
    expect(validateCustomPlanInput({ startSurah: 1, startAyah: 8, endSurah: 1, endAyah: 8, targetDays: 1 })).toMatch(/7 ayahs/);
  });

  it("rejects more target days than there are ayahs in the range", () => {
    // An-Nas (surah 114) has 6 ayahs -- 10 days is impossible.
    expect(
      validateCustomPlanInput({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 10 })
    ).toMatch(/6 ayahs/);
  });

  it("rejects a non-positive or non-integer day count", () => {
    expect(validateCustomPlanInput({ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, targetDays: 0 })).toMatch(/at least 1/);
    expect(validateCustomPlanInput({ startSurah: 1, startAyah: 1, endSurah: 1, endAyah: 7, targetDays: 2.5 })).toMatch(/at least 1/);
  });
});

describe("buildCustomPlanDays", () => {
  it("collapses a day that covers a surah's FULL ayah range to a plain number, matching JUZ_AMMA_PLAN's own shape", () => {
    // An-Nas (114) has 6 ayahs; 1 target day means the whole surah in one day.
    const days = buildCustomPlanDays({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 1 });
    expect(days).toEqual([{ day: 1, surahs: [114] }]);
  });

  it("splits a single surah across multiple days as {number, fromAyah, toAyah} partial targets", () => {
    const days = buildCustomPlanDays({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 3 });
    expect(days).toHaveLength(3);
    expect(days).toEqual([
      { day: 1, surahs: [{ number: 114, fromAyah: 1, toAyah: 2 }] },
      { day: 2, surahs: [{ number: 114, fromAyah: 3, toAyah: 4 }] },
      { day: 3, surahs: [{ number: 114, fromAyah: 5, toAyah: 6 }] },
    ]);
    // Every ayah in the range is covered exactly once across all days.
    const covered = days.flatMap((d) => d.surahs.flatMap((t) => {
      const out = [];
      for (let a = t.fromAyah; a <= t.toAyah; a++) out.push(a);
      return out;
    }));
    expect(covered).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("spans a multi-surah range and covers every ayah exactly once", () => {
    // Al-Falaq (113, 5 ayahs) + An-Nas (114, 6 ayahs) = 11 ayahs total.
    const days = buildCustomPlanDays({ startSurah: 113, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 11 });
    expect(days).toHaveLength(11);
    const allTargets = days.flatMap((d) => d.surahs);
    // 1-ayah-per-day means every target here is a partial (never the whole
    // surah in one day, since both surahs have more than 1 ayah).
    expect(allTargets.every((t) => typeof t === "object")).toBe(true);
    const surah113Ayahs = allTargets.filter((t) => t.number === 113).map((t) => t.fromAyah).sort((a, b) => a - b);
    const surah114Ayahs = allTargets.filter((t) => t.number === 114).map((t) => t.fromAyah).sort((a, b) => a - b);
    expect(surah113Ayahs).toEqual([1, 2, 3, 4, 5]);
    expect(surah114Ayahs).toEqual([1, 2, 3, 4, 5, 6]);
  });

  it("may resolve to fewer days than targetDays when the range doesn't divide evenly, never more", () => {
    // 6 ayahs over 4 target days: perDay = ceil(6/4) = 2 -> 3 actual days.
    const days = buildCustomPlanDays({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 4 });
    expect(days.length).toBeLessThanOrEqual(4);
    expect(days.length).toBe(3);
  });
});

describe("createCustomPlan", () => {
  it("produces a plan shaped exactly like JUZ_AMMA_PLAN (id/name/description/days), flagged isCustom", () => {
    const plan = createCustomPlan({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 3 });
    expect(plan.isCustom).toBe(true);
    expect(typeof plan.id).toBe("string");
    expect(plan.id).not.toBe(JUZ_AMMA_PLAN.id);
    expect(plan.name.length).toBeGreaterThan(0);
    expect(plan.description.length).toBeGreaterThan(0);
    expect(plan.days).toHaveLength(3);
  });

  it("two plans created back to back get distinct ids (no accidental state collision)", () => {
    const a = createCustomPlan({ startSurah: 114, startAyah: 1, endSurah: 114, endAyah: 6, targetDays: 1 });
    const b = createCustomPlan({ startSurah: 113, startAyah: 1, endSurah: 113, endAyah: 5, targetDays: 1 });
    expect(a.id).not.toBe(b.id);
  });
});

describe("getPlanProgress with partial-surah (custom-plan) targets", () => {
  const started = "2026-07-01T00:00:00Z";
  const logWithAyah = (surah, ayah, date = "2026-07-02T10:00:00Z") => ({
    surah_number: surah,
    ayah_number: ayah,
    created_date: date,
  });

  it("a partial target is NOT done until every ayah in its range is logged", () => {
    const plan = { id: "t", name: "t", days: [{ day: 1, surahs: [{ number: 114, fromAyah: 1, toAyah: 3 }] }] };
    const partial = getPlanProgress(plan, started, [logWithAyah(114, 1), logWithAyah(114, 2)]); // missing ayah 3
    expect(partial.completedDays).toBe(0);

    const complete = getPlanProgress(plan, started, [logWithAyah(114, 1), logWithAyah(114, 2), logWithAyah(114, 3)]);
    expect(complete.completedDays).toBe(1);
    expect(complete.finished).toBe(true);
  });

  it("a whole-surah numeric target still only needs ANY ayah logged (unchanged, regression pin)", () => {
    const plan = { id: "t", name: "t", days: [{ day: 1, surahs: [114] }] };
    const progress = getPlanProgress(plan, started, [logWithAyah(114, 1)]); // just one ayah of six
    expect(progress.completedDays).toBe(1); // whole-surah semantics unchanged
  });
});

describe("targetLabel / targetSurahNumber", () => {
  it("handles both a plain surah number and a partial {number, fromAyah, toAyah} target", () => {
    expect(targetSurahNumber(114)).toBe(114);
    expect(targetSurahNumber({ number: 114, fromAyah: 1, toAyah: 3 })).toBe(114);
    expect(targetLabel(114)).toBe("An-Nas");
    expect(targetLabel({ number: 114, fromAyah: 1, toAyah: 3 })).toBe("An-Nas 1-3");
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
