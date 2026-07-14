import { describe, it, expect } from "vitest";
import { buildFlagOptions, buildFeedbackReport } from "@/lib/feedbackReports";

const ruleChecks = [
  { ruleType: "ghunnah", label: "Ghunnah (nasal hold)", word: "إِنَّكَ", verdict: "pass" },
  { ruleType: "ikhfa", label: "Ikhfa (hidden noon)", word: "أَنتَ", verdict: "warn" },
  { ruleType: "madd_extended", label: "Madd Muttasil/Munfasil (4-5 counts)", word: "لَنَآ", verdict: "unchecked" },
];

describe("buildFlagOptions", () => {
  it("always offers the overall score first, then one option per rule check", () => {
    const options = buildFlagOptions({ score: 82, ruleChecks });
    expect(options).toHaveLength(4);
    expect(options[0]).toMatchObject({ id: "overall", kind: "overall" });
    expect(options[0].label).toContain("82");
    expect(options[1]).toMatchObject({ kind: "rule", ruleType: "ghunnah", verdict: "pass" });
  });

  it("describes each verdict in plain language, including unchecked", () => {
    const options = buildFlagOptions({ score: 50, ruleChecks });
    expect(options[1].label).toContain("marked good");
    expect(options[2].label).toContain("flagged for improvement");
    expect(options[3].label).toContain("couldn't be checked");
  });

  it("works with no rule checks at all (acoustic-only results)", () => {
    const options = buildFlagOptions({ score: 70, ruleChecks: [] });
    expect(options).toHaveLength(1);
    expect(options[0].kind).toBe("overall");
  });
});

describe("buildFeedbackReport", () => {
  const base = { surahNumber: 108, surahName: "Al-Kawthar", ayahNumbers: [1], score: 82, mode: "single" };

  it("records rule details for a rule flag", () => {
    const option = buildFlagOptions({ score: 82, ruleChecks })[2];
    const report = buildFeedbackReport({ ...base, option, note: "  the hold was fine  " });
    expect(report).toMatchObject({
      flagged_kind: "rule",
      rule_type: "ikhfa",
      rule_word: "أَنتَ",
      rule_verdict: "warn",
      note: "the hold was fine",
      surah_number: 108,
      score: 82,
      mode: "single",
    });
  });

  it("leaves rule fields null for an overall flag and truncates long notes", () => {
    const option = buildFlagOptions({ score: 82, ruleChecks })[0];
    const report = buildFeedbackReport({ ...base, option, note: "x".repeat(600) });
    expect(report.flagged_kind).toBe("overall");
    expect(report.rule_type).toBeNull();
    expect(report.rule_word).toBeNull();
    expect(report.note).toHaveLength(500);
  });

  it("never includes audio or transcript fields", () => {
    const option = buildFlagOptions({ score: 82, ruleChecks })[1];
    const report = buildFeedbackReport({ ...base, option, note: "" });
    const keys = Object.keys(report).join(" ");
    expect(keys).not.toMatch(/audio|blob|samples|transcript/i);
  });
});
