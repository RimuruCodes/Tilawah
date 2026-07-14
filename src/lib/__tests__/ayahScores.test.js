import { describe, it, expect } from "vitest";
import { summarizeLastScores } from "@/lib/ayahScores";

const log = (ayah, score, when) => ({
  ayah_number: ayah,
  accuracy_score: score,
  created_date: when,
});

describe("summarizeLastScores", () => {
  it("returns the most recent score per ayah, not the highest", () => {
    const lastByAyah = summarizeLastScores([
      log(1, 92, "2026-07-01T10:00:00Z"),
      log(1, 75, "2026-07-02T10:00:00Z"), // newer but lower — still wins
      log(2, 60, "2026-07-01T10:00:00Z"),
    ]);
    expect(lastByAyah).toEqual({ 1: 75, 2: 60 });
  });

  it("is order-independent (logs may arrive newest-first)", () => {
    const lastByAyah = summarizeLastScores([
      log(1, 75, "2026-07-02T10:00:00Z"),
      log(1, 92, "2026-07-01T10:00:00Z"),
    ]);
    expect(lastByAyah).toEqual({ 1: 75 });
  });

  it("skips rows missing an ayah number or score", () => {
    const lastByAyah = summarizeLastScores([
      log(null, 80, "2026-07-01T10:00:00Z"),
      log(3, null, "2026-07-01T10:00:00Z"),
      log(3, 88, "2026-07-01T11:00:00Z"),
    ]);
    expect(lastByAyah).toEqual({ 3: 88 });
  });

  it("returns an empty object for no logs", () => {
    expect(summarizeLastScores([])).toEqual({});
  });
});
