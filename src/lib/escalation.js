// Bounded "confidence-seeking" escalation planning.
//
// The analysis pipeline produces a result plus a set of confidence signals
// (see assessRecitationConfidence in recitationService.js). SOME low-confidence
// signals can be legitimately improved by retrying the METHOD — refetching
// reference audio, transcribing again with a better ASR model, or determining
// the ayah count more thoroughly. Others (pitch, loudness, rhythm, pause
// count) reflect the actual recording and cannot honestly change on a second
// attempt at the same audio — those are final, never escalated.
//
// This module is the PURE decision layer: given confidence signals and a
// remaining time budget, it decides whether and what to escalate. It performs
// no I/O, starts no timers, loads no models — the pipeline executes the plan
// and re-checks the budget between steps (real durations vary). Keeping it
// pure is what lets the memory-sensitive escalation (a second ASR model load)
// be reasoned about and tested in isolation.
//
// IMPORTANT: escalation NEVER searches for a different score on the same
// audio. Each escalation upgrades the METHOD behind a signal that a better
// method could legitimately change. The headline acoustic score is not a
// target of any retry.

const ESCALATION_BUDGET_KEY = "qc_escalation_budget"; // preset id

// User-selectable ceilings on TOTAL extra time spent across all escalation
// attempts for one recording (layered on top of — not replacing — the
// per-attempt stall watchdog in recitationService.js). "none" disables
// escalation entirely.
export const ESCALATION_BUDGETS = {
  none: { id: "none", label: "No extra time", ms: 0 },
  short: { id: "short", label: "Up to 30s more", ms: 30_000 },
  medium: { id: "medium", label: "Up to 1 min more", ms: 60_000 },
  long: { id: "long", label: "Up to 2 min more", ms: 120_000 },
};

// Default: a gentle 30s. Because the ASR reload's cost estimate (90s) exceeds
// 30s, this budget can ONLY ever fire the two cheap, memory-safe escalations
// (reference retry, ayah refine) — never the second model load. So the feature
// adds value out of the box without any added memory risk; the memory-heavier
// ASR upgrade stays gated behind an explicit 2-min choice (and is refused
// outright on iOS — see allowAsrUpgrade below).
const DEFAULT_BUDGET_ID = "short";

export function getEscalationBudgetId() {
  const stored = typeof localStorage !== "undefined" ? localStorage.getItem(ESCALATION_BUDGET_KEY) : null;
  return ESCALATION_BUDGETS[stored] ? stored : DEFAULT_BUDGET_ID;
}

export function setEscalationBudgetId(id) {
  if (!ESCALATION_BUDGETS[id]) return;
  localStorage.setItem(ESCALATION_BUDGET_KEY, id);
}

export function getEscalationBudgetMs() {
  return ESCALATION_BUDGETS[getEscalationBudgetId()].ms;
}

// Word-confidence at or below which re-transcribing with the better model is
// worth trying. Above it, the fast model's transcript is trusted as-is.
export const WORD_CONFIDENCE_UPGRADE_THRESHOLD = 0.6;

// How far the auto-detected ayah count must diverge from what the person
// tapped before a more thorough (transcript-based) re-determination is worth
// attempting.
export const AYAH_COUNT_REFINE_MIN_DELTA = 2;

// Conservative (over-estimated) cost of STARTING each escalation, in ms —
// used only to avoid beginning something the remaining budget can't plausibly
// finish (which would just waste time and delay the fallback). The pipeline
// may pass runtime-adjusted costs (e.g. a lower asrUpgrade estimate when the
// accurate model is already cached/warm); these are the safe defaults.
export const ESCALATION_COST_ESTIMATES = {
  // One more reference fetch + decode over the network.
  referenceRetry: 8_000,
  // Transcript-based ayah-count re-match: no ASR, just more search — cheap.
  ayahRefine: 5_000,
  // Reset the worker, then (maybe download +) load + run the base model.
  // Deliberately large so it only fires under a genuinely roomy budget.
  asrUpgrade: 90_000,
};

// Is there enough remaining budget to START an escalation of this estimated
// cost? We never begin one we can't plausibly finish.
export function budgetAllows(remainingBudgetMs, estimatedCostMs) {
  return Number.isFinite(remainingBudgetMs) && remainingBudgetMs >= estimatedCostMs;
}

// 1. Reference-fetch retry eligibility. Only when the reference genuinely
//    failed to load and retries aren't exhausted. (referenceAvailable === true
//    means we already have it — nothing to retry.)
export function referenceFetchEligible({ referenceAvailable, attemptsMade = 1, maxAttempts = 2 } = {}) {
  return referenceAvailable === false && attemptsMade < maxAttempts;
}

// 2. ASR model-upgrade eligibility. Only when a transcript exists but its word
//    confidence is low AND we're on the fast model (there's a better model to
//    upgrade TO). Never fires when already on "accurate" — there's nowhere to
//    upgrade, and re-running the same model is exactly the "search for a
//    better score on the same audio" this must not do.
//
//    `allowHeavyModelLoad` (default true) is the hard iOS gate: this
//    escalation is the ONLY one that loads a second, larger model, which is
//    the exact pattern behind the earlier OOM. The pipeline passes
//    `!isIosWebKit()` so a second heavy model load never happens on
//    iPhone/iPad, regardless of budget — even if the user manually enabled
//    ASR there.
export function asrUpgradeEligible({ overallWordConfidence, currentModelPref, allowHeavyModelLoad = true } = {}) {
  return (
    allowHeavyModelLoad === true &&
    currentModelPref === "fast" &&
    typeof overallWordConfidence === "number" &&
    overallWordConfidence < WORD_CONFIDENCE_UPGRADE_THRESHOLD
  );
}

// 3. Ayah-count refinement eligibility (continuous mode only). Only when the
//    auto-correction was large AND the initial count came from the weaker
//    duration-only method (a transcript-based count is already the thorough
//    one — no point redoing it). Single-ayah mode passes no ayahCount signal,
//    so this is false there.
export function ayahCountRefineEligible({ taggedCount, resolvedCount, countMethod, minDelta = AYAH_COUNT_REFINE_MIN_DELTA } = {}) {
  if (!Number.isFinite(taggedCount) || !Number.isFinite(resolvedCount)) return false;
  return Math.abs(resolvedCount - taggedCount) >= minDelta && countMethod === "duration";
}

// Produces an ordered escalation plan: the eligible escalations that also fit
// the remaining budget, cheapest-first so quick, high-certainty wins happen
// before the expensive ASR reload (which only runs under a roomy budget).
// Pure: the pipeline executes each step, subtracts the ACTUAL elapsed time
// from the budget, and re-checks budgetAllows before the next — so cumulative
// overruns are handled by re-planning/re-checking, not predicted here.
//
// Signals it deliberately does NOT accept: pitchScore, energyScore,
// alignmentScore, pauseCount. Those reflect the recording itself and can't be
// improved by retrying, so there is structurally no way for them to trigger an
// escalation here.
export function planEscalations({ reference, asr, ayahCount, remainingBudgetMs, costs = ESCALATION_COST_ESTIMATES } = {}) {
  const plan = [];
  if (remainingBudgetMs <= 0) return plan; // "none" budget, or already spent

  if (reference && referenceFetchEligible(reference) && budgetAllows(remainingBudgetMs, costs.referenceRetry)) {
    plan.push({ type: "referenceRetry", estimatedCostMs: costs.referenceRetry });
  }
  if (ayahCount && ayahCountRefineEligible(ayahCount) && budgetAllows(remainingBudgetMs, costs.ayahRefine)) {
    plan.push({ type: "ayahRefine", estimatedCostMs: costs.ayahRefine });
  }
  if (asr && asrUpgradeEligible(asr) && budgetAllows(remainingBudgetMs, costs.asrUpgrade)) {
    plan.push({ type: "asrUpgrade", estimatedCostMs: costs.asrUpgrade });
  }
  return plan;
}

// Honest one-liner for the UI after an escalation actually improved the
// result — never implies the score was searched for or bumped, only that a
// slower, more reliable method was used. Returns null when nothing improved,
// so the UI shows nothing.
export function describeEscalationOutcome(improved) {
  return improved ? "Took a bit longer for a more reliable reading." : null;
}
