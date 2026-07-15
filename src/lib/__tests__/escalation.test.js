import { describe, it, expect, beforeEach } from "vitest";
import {
  ESCALATION_BUDGETS,
  getEscalationBudgetId,
  setEscalationBudgetId,
  getEscalationBudgetMs,
  budgetAllows,
  referenceFetchEligible,
  asrUpgradeEligible,
  ayahCountRefineEligible,
  planEscalations,
  describeEscalationOutcome,
  ESCALATION_COST_ESTIMATES,
  WORD_CONFIDENCE_UPGRADE_THRESHOLD,
} from "@/lib/escalation";

describe("escalation budget preference", () => {
  beforeEach(() => localStorage.clear());

  it("defaults to 'short' (30s — cheap escalations only) and round-trips a valid choice", () => {
    expect(getEscalationBudgetId()).toBe("short");
    expect(getEscalationBudgetMs()).toBe(ESCALATION_BUDGETS.short.ms);
    setEscalationBudgetId("medium");
    expect(getEscalationBudgetId()).toBe("medium");
    expect(getEscalationBudgetMs()).toBe(ESCALATION_BUDGETS.medium.ms);
    setEscalationBudgetId("none");
    expect(getEscalationBudgetMs()).toBe(0);
  });

  it("ignores an unknown stored value and falls back to the default", () => {
    localStorage.setItem("qc_escalation_budget", "forever");
    expect(getEscalationBudgetId()).toBe("short");
    setEscalationBudgetId("forever"); // rejected
    expect(getEscalationBudgetId()).toBe("short");
  });
});

describe("budgetAllows", () => {
  it("permits starting only when the remaining budget covers the estimate", () => {
    expect(budgetAllows(30_000, 8_000)).toBe(true);
    expect(budgetAllows(8_000, 8_000)).toBe(true); // exactly enough
    expect(budgetAllows(5_000, 8_000)).toBe(false);
    expect(budgetAllows(0, 1)).toBe(false);
    expect(budgetAllows(NaN, 1)).toBe(false);
  });
});

// 1. Reference-fetch retry — only a genuine failure with retries left.
describe("referenceFetchEligible", () => {
  it("is eligible when the reference failed and retries remain", () => {
    expect(referenceFetchEligible({ referenceAvailable: false, attemptsMade: 1 })).toBe(true);
  });
  it("is NOT eligible when the reference is already available", () => {
    expect(referenceFetchEligible({ referenceAvailable: true, attemptsMade: 1 })).toBe(false);
  });
  it("is NOT eligible once retries are exhausted", () => {
    expect(referenceFetchEligible({ referenceAvailable: false, attemptsMade: 2, maxAttempts: 2 })).toBe(false);
  });
});

// 2. ASR upgrade — low word confidence AND currently on the fast model.
describe("asrUpgradeEligible", () => {
  it("is eligible when the fast model produced a low-confidence transcript", () => {
    expect(asrUpgradeEligible({ overallWordConfidence: 0.4, currentModelPref: "fast" })).toBe(true);
  });
  it("is NOT eligible when confidence is already high", () => {
    expect(asrUpgradeEligible({ overallWordConfidence: 0.85, currentModelPref: "fast" })).toBe(false);
    // Boundary: exactly at the threshold is treated as good enough.
    expect(asrUpgradeEligible({ overallWordConfidence: WORD_CONFIDENCE_UPGRADE_THRESHOLD, currentModelPref: "fast" })).toBe(false);
  });
  it("is NOT eligible when already on the accurate model — nowhere to upgrade", () => {
    // This is the guard against re-running the same model hunting a better
    // transcript on identical audio.
    expect(asrUpgradeEligible({ overallWordConfidence: 0.2, currentModelPref: "accurate" })).toBe(false);
  });
  it("is NOT eligible when heavy model loads are disallowed (iOS gate), even with low confidence", () => {
    expect(asrUpgradeEligible({ overallWordConfidence: 0.2, currentModelPref: "fast", allowHeavyModelLoad: false })).toBe(false);
  });
  it("is NOT eligible when there is no word-confidence signal (ASR didn't run)", () => {
    expect(asrUpgradeEligible({ overallWordConfidence: null, currentModelPref: "fast" })).toBe(false);
    expect(asrUpgradeEligible({ currentModelPref: "fast" })).toBe(false);
  });
});

// 3. Ayah-count refinement — large duration-only correction, continuous mode.
describe("ayahCountRefineEligible", () => {
  it("is eligible on a large correction that used duration-only matching", () => {
    expect(ayahCountRefineEligible({ taggedCount: 7, resolvedCount: 3, countMethod: "duration" })).toBe(true);
  });
  it("is NOT eligible for a small correction", () => {
    expect(ayahCountRefineEligible({ taggedCount: 7, resolvedCount: 6, countMethod: "duration" })).toBe(false);
  });
  it("is NOT eligible when the count already came from the transcript (already thorough)", () => {
    expect(ayahCountRefineEligible({ taggedCount: 7, resolvedCount: 3, countMethod: "transcript" })).toBe(false);
  });
  it("is NOT eligible without both counts (e.g. single-ayah mode)", () => {
    expect(ayahCountRefineEligible({})).toBe(false);
    expect(ayahCountRefineEligible({ taggedCount: 3, countMethod: "duration" })).toBe(false);
  });
});

describe("planEscalations", () => {
  const lowConfAsr = { overallWordConfidence: 0.3, currentModelPref: "fast", allowHeavyModelLoad: true };
  const failedRef = { referenceAvailable: false, attemptsMade: 1 };
  const bigCountCorrection = { taggedCount: 7, resolvedCount: 3, countMethod: "duration" };

  it("returns an empty plan when the budget is zero ('no extra time')", () => {
    const plan = planEscalations({ reference: failedRef, asr: lowConfAsr, ayahCount: bigCountCorrection, remainingBudgetMs: 0 });
    expect(plan).toEqual([]);
  });

  it("orders escalations cheapest-first and includes the ASR reload only under a roomy budget", () => {
    const plan = planEscalations({
      reference: failedRef,
      asr: lowConfAsr,
      ayahCount: bigCountCorrection,
      remainingBudgetMs: ESCALATION_BUDGETS.long.ms, // 120s
    });
    expect(plan.map((p) => p.type)).toEqual(["referenceRetry", "ayahRefine", "asrUpgrade"]);
  });

  it("excludes the expensive ASR reload when only a small budget remains", () => {
    const plan = planEscalations({
      reference: failedRef,
      asr: lowConfAsr,
      ayahCount: bigCountCorrection,
      remainingBudgetMs: ESCALATION_BUDGETS.short.ms, // 30s — covers cheap ones, not the 90s reload
    });
    expect(plan.map((p) => p.type)).toEqual(["referenceRetry", "ayahRefine"]);
    expect(plan.map((p) => p.type)).not.toContain("asrUpgrade");
  });

  // The core safety property: signals that reflect the recording itself must
  // never produce an escalation, no matter the budget.
  it("never escalates on pitch/loudness/rhythm/pause — only method-improvable signals", () => {
    // Reference is fine, ASR confidence is high, ayah count is solid. The only
    // thing "wrong" is (hypothetically) a null pitch score — which this
    // planner is not even given, precisely because it must not react to it.
    const plan = planEscalations({
      reference: { referenceAvailable: true, attemptsMade: 1 },
      asr: { overallWordConfidence: 0.95, currentModelPref: "fast", allowHeavyModelLoad: true },
      ayahCount: { taggedCount: 3, resolvedCount: 3, countMethod: "transcript" },
      remainingBudgetMs: ESCALATION_BUDGETS.long.ms,
    });
    expect(plan).toEqual([]);
  });

  it("plans only the ASR upgrade when that's the sole eligible+affordable signal", () => {
    const plan = planEscalations({
      reference: { referenceAvailable: true, attemptsMade: 1 },
      asr: lowConfAsr,
      ayahCount: null, // single-ayah mode
      remainingBudgetMs: ESCALATION_BUDGETS.long.ms,
    });
    expect(plan.map((p) => p.type)).toEqual(["asrUpgrade"]);
  });

  it("respects runtime-adjusted costs (e.g. a warm accurate model is cheaper)", () => {
    // With a cached/warm accurate model the pipeline can lower the asrUpgrade
    // estimate so it fits a smaller budget.
    const plan = planEscalations({
      reference: { referenceAvailable: true, attemptsMade: 1 },
      asr: lowConfAsr,
      ayahCount: null,
      remainingBudgetMs: 20_000,
      costs: { ...ESCALATION_COST_ESTIMATES, asrUpgrade: 15_000 },
    });
    expect(plan.map((p) => p.type)).toEqual(["asrUpgrade"]);
  });
});

describe("describeEscalationOutcome", () => {
  it("gives an honest note only when something actually improved", () => {
    expect(describeEscalationOutcome(true)).toMatch(/more reliable/i);
    expect(describeEscalationOutcome(false)).toBeNull();
  });
  it("never implies the score itself was improved or searched for", () => {
    const msg = describeEscalationOutcome(true) || "";
    expect(msg).not.toMatch(/score|higher|better score|improved your/i);
  });
});
