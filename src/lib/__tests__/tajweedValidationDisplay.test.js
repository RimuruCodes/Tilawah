import { describe, it, expect } from "vitest";
import { TAJWEED_CATEGORIES, STYLE_MATCH_DISPLAY, validationTagText, LINE_STYLE_BY_STATUS } from "@/lib/tajweedValidationDisplay";
import { TAJWEED_RULE_DEFINITIONS } from "@/lib/tajweedAnalysis";

describe("validationTagText", () => {
  it("shows no tag for validated, a distinct tag for the other two tiers", () => {
    expect(validationTagText("validated")).toBeNull();
    expect(validationTagText(undefined)).toBeNull();
    expect(validationTagText("weak-signal")).toBe("Weak signal");
    expect(validationTagText("unvalidated")).toBe("Not yet verified");
  });
});

describe("TAJWEED_CATEGORIES", () => {
  it("every category's validation tier matches TAJWEED_RULE_DEFINITIONS exactly -- not a stale copy", () => {
    const ruleKeyByCategory = {
      qalqalah: "qalqalah",
      ghunnah: "ghunnah",
      iqlab: "iqlab",
      idgham_ghunnah: "idgham_ghunnah",
      ikhfa: "ikhfa",
      madd: "madd_natural",
    };
    for (const cat of TAJWEED_CATEGORIES) {
      const expectedStatus = TAJWEED_RULE_DEFINITIONS[ruleKeyByCategory[cat.key]].validation.status;
      expect(cat.status).toBe(expectedStatus);
      expect(cat).toMatchObject(LINE_STYLE_BY_STATUS[expectedStatus]);
    }
  });

  it("Madd is validated (solid line); Qalqalah is unvalidated (most dashed/dimmed)", () => {
    expect(TAJWEED_CATEGORIES.find((c) => c.key === "madd").status).toBe("validated");
    expect(TAJWEED_CATEGORIES.find((c) => c.key === "qalqalah").status).toBe("unvalidated");
  });
});

describe("STYLE_MATCH_DISPLAY", () => {
  it("is tagged unvalidated with its own honest note -- not borrowed from the rule-validation tiers", () => {
    expect(STYLE_MATCH_DISPLAY.status).toBe("unvalidated");
    expect(STYLE_MATCH_DISPLAY.tagText).toBe("Not yet verified");
    expect(STYLE_MATCH_DISPLAY.validationNote).toMatch(/not.*validated/i);
    // Visual treatment still matches the "unvalidated" tier for consistency.
    expect(STYLE_MATCH_DISPLAY).toMatchObject(LINE_STYLE_BY_STATUS.unvalidated);
  });
});
