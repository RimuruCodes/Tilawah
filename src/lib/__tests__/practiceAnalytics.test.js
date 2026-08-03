import { describe, it, expect } from "vitest";
import { aggregateLogsBy, cumulativeAverageTrend } from "@/lib/practiceAnalytics";

function log({ surah = 1, surahName = "Al-Fatihah", reciter = "Alafasy", score = 80, tajweed = null } = {}) {
  return {
    surah_number: surah,
    surah_name: surahName,
    reciter_used: reciter,
    accuracy_score: score,
    tajweed_summary: tajweed,
  };
}

describe("aggregateLogsBy", () => {
  it("groups by the given key, averaging score and summing pass/total per rule category", () => {
    const logs = [
      log({ surah: 1, surahName: "Al-Fatihah", score: 80, tajweed: { qalqalah: { pass: 1, total: 2 } } }),
      log({ surah: 1, surahName: "Al-Fatihah", score: 100, tajweed: { qalqalah: { pass: 2, total: 2 } } }),
      log({ surah: 2, surahName: "Al-Baqarah", score: 60 }),
    ];
    const result = aggregateLogsBy(logs, (l) => String(l.surah_number), (l) => l.surah_name);

    const fatihah = result.find((r) => r.label === "Al-Fatihah");
    expect(fatihah.count).toBe(2);
    expect(fatihah.avgScore).toBe(90); // (80+100)/2
    expect(fatihah.passRateByCategory.qalqalah).toBe(75); // (1+2)/(2+2) = 75%

    const baqarah = result.find((r) => r.label === "Al-Baqarah");
    expect(baqarah.count).toBe(1);
    expect(baqarah.avgScore).toBe(60);
    // No tajweed_summary at all for this group -- every category stays null,
    // not zero (zero would falsely claim a 0% pass rate was measured).
    expect(baqarah.passRateByCategory.qalqalah).toBeNull();
  });

  it("sorts by count descending (most-practiced first)", () => {
    const logs = [
      log({ surah: 1, surahName: "One" }),
      log({ surah: 2, surahName: "Two" }),
      log({ surah: 2, surahName: "Two" }),
      log({ surah: 2, surahName: "Two" }),
    ];
    const result = aggregateLogsBy(logs, (l) => String(l.surah_number), (l) => l.surah_name);
    expect(result.map((r) => r.label)).toEqual(["Two", "One"]);
  });

  it("skips entries whose key resolves to null/undefined rather than creating a bogus group", () => {
    const logs = [log({ reciter: null }), log({ reciter: "Alafasy" })];
    const result = aggregateLogsBy(logs, (l) => l.reciter_used, (l) => l.reciter_used);
    expect(result).toHaveLength(1);
    expect(result[0].label).toBe("Alafasy");
  });

  it("returns an empty array for no logs", () => {
    expect(aggregateLogsBy([], (l) => l.reciter_used, (l) => l.reciter_used)).toEqual([]);
  });
});

describe("cumulativeAverageTrend", () => {
  it("computes a running average in chronological order from newest-first input", () => {
    // Newest-first input (matches RecitationLog.list's natural order):
    // chronologically these are 60, 80, 100 (oldest to newest).
    const logsNewestFirst = [{ style_match_score: 100 }, { style_match_score: 80 }, { style_match_score: 60 }];
    const trend = cumulativeAverageTrend(logsNewestFirst, "style_match_score");
    expect(trend).toEqual([
      { attempt: 1, value: 60 },
      { attempt: 2, value: 70 }, // (60+80)/2
      { attempt: 3, value: 80 }, // (60+80+100)/3
    ]);
  });

  it("skips entries where the field is null, without breaking the running average", () => {
    const logsNewestFirst = [{ style_match_score: null }, { style_match_score: 100 }, { style_match_score: 50 }];
    const trend = cumulativeAverageTrend(logsNewestFirst, "style_match_score");
    expect(trend).toEqual([
      { attempt: 1, value: 50 },
      { attempt: 2, value: 75 },
    ]);
  });

  it("returns an empty array when no entries have the field at all", () => {
    expect(cumulativeAverageTrend([{ style_match_score: null }], "style_match_score")).toEqual([]);
  });
});
