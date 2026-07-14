// Threshold tuning against QDAT labels, using the cached measurements from
// extract-features.mjs (no ASR re-run needed).
//
//   npx vite-node tools/qdat-eval/tune-thresholds.mjs -- [--features <file>]
//
// Method:
//  - Split records into a tune half and a holdout half (stable hash of the
//    file name) so tuned thresholds are validated on unseen recordings.
//  - Re-derive each rule's pass/warn verdict from its cached `measured`
//    values under candidate thresholds, mirroring checkTajweedRules exactly.
//  - Report accuracy vs QDAT's correct/incorrect labels for the current
//    app thresholds and the best tuned ones — alongside the always-pass /
//    always-warn baselines, since a skewed label distribution can make a
//    do-nothing "classifier" look deceptively strong.
//
// Records where the pipeline couldn't produce a verdict at all ("unchecked":
// ASR failed to align the word) are excluded from accuracy but counted as
// coverage — that exclusion is reported, not hidden.
import fs from "node:fs";
import path from "node:path";
import { TAJWEED_THRESHOLDS } from "@/lib/tajweedAnalysis";

const featuresFile = (() => {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--features");
  return i === -1 ? path.join("tools", "qdat-eval", "features.json") : args[i + 1];
})();

const { records } = JSON.parse(fs.readFileSync(featuresFile, "utf8"));
const usable = records.filter((r) => !r.error);

// Stable 50/50 split on file name (not Math.random, so reruns agree).
const hashOf = (s) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
const tuneSet = usable.filter((r) => hashOf(r.file) % 2 === 0);
const holdoutSet = usable.filter((r) => hashOf(r.file) % 2 === 1);

// Verdict logic mirrored from checkTajweedRules (src/lib/tajweedAnalysis.js).
function nasalPass(measured, { nasalHoldCountWordFraction, nasalSpikeMaxDb }) {
  const expectedMinSec = (measured.expectedCounts / 2) * (measured.avgWordDur * nasalHoldCountWordFraction);
  return measured.segmentDurationSec >= expectedMinSec && measured.energySpreadDb < nasalSpikeMaxDb;
}
function maddPass(measured, { maddMinRatioFactor }) {
  return measured.actualRatio >= measured.expectedRatio * maddMinRatioFactor;
}

const PASS_FN = { madd: maddPass, ghunnah: nasalPass, ikhfa: nasalPass };

function evaluateRule(set, rule, thresholds) {
  let correct = 0;
  let total = 0;
  let unchecked = 0;
  let alwaysPassCorrect = 0;
  for (const r of set) {
    const label = r.labels?.[rule];
    if (label !== 0 && label !== 1) continue;
    const check = r.checks?.[rule];
    if (!check || check.verdict === "unchecked" || !check.measured) {
      unchecked++;
      continue;
    }
    total++;
    if (label === 1) alwaysPassCorrect++;
    const predictedCorrect = PASS_FN[rule](check.measured, thresholds) ? 1 : 0;
    if (predictedCorrect === label) correct++;
  }
  return {
    accuracy: total ? correct / total : null,
    total,
    unchecked,
    alwaysPassRate: total ? alwaysPassCorrect / total : null,
  };
}

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function report(title, thresholds) {
  console.log(`\n${title}`);
  console.log(`  thresholds: ${JSON.stringify(thresholds)}`);
  for (const rule of ["madd", "ghunnah", "ikhfa"]) {
    const t = evaluateRule(tuneSet, rule, thresholds);
    const h = evaluateRule(holdoutSet, rule, thresholds);
    console.log(
      `  ${rule.padEnd(8)} tune ${pct(t.accuracy)} (n=${t.total}, unchecked=${t.unchecked})  |  holdout ${pct(h.accuracy)} (n=${h.total}, unchecked=${h.unchecked})  |  always-pass baseline ${pct(h.alwaysPassRate)}`
    );
  }
}

report("CURRENT app thresholds", TAJWEED_THRESHOLDS);

// ---- Grid search on the tune half only ----

// Madd: one free parameter.
let bestMadd = { factor: TAJWEED_THRESHOLDS.maddMinRatioFactor, acc: -1 };
for (let f = 0.3; f <= 1.5001; f += 0.025) {
  const acc = evaluateRule(tuneSet, "madd", { maddMinRatioFactor: f }).accuracy;
  if (acc != null && acc > bestMadd.acc) bestMadd = { factor: Math.round(f * 1000) / 1000, acc };
}

// Nasal: two shared parameters, scored on ghunnah + ikhfa jointly since the
// app uses one constant pair for the whole nasal-hold family.
let bestNasal = {
  fraction: TAJWEED_THRESHOLDS.nasalHoldCountWordFraction,
  spike: TAJWEED_THRESHOLDS.nasalSpikeMaxDb,
  acc: -1,
};
for (let frac = 0.1; frac <= 1.0001; frac += 0.025) {
  for (let spike = 4; spike <= 24.001; spike += 0.5) {
    const th = { nasalHoldCountWordFraction: frac, nasalSpikeMaxDb: spike };
    const g = evaluateRule(tuneSet, "ghunnah", th);
    const k = evaluateRule(tuneSet, "ikhfa", th);
    if (g.accuracy == null || k.accuracy == null) continue;
    const combined = (g.accuracy * g.total + k.accuracy * k.total) / (g.total + k.total);
    if (combined > bestNasal.acc) {
      bestNasal = { fraction: Math.round(frac * 1000) / 1000, spike, acc: combined };
    }
  }
}

const tuned = {
  ...TAJWEED_THRESHOLDS,
  maddMinRatioFactor: bestMadd.factor,
  nasalHoldCountWordFraction: bestNasal.fraction,
  nasalSpikeMaxDb: bestNasal.spike,
};

report("TUNED thresholds (fit on tune half, judge by the holdout column)", tuned);

// ---- Iqlab coupling check --------------------------------------------
// The nasal-hold thresholds are ONE shared constant pair used by the whole
// NASAL_HOLD_RULE_TYPES family: ghunnah, iqlab, idgham_ghunnah, ikhfa (see
// src/lib/tajweedAnalysis.js). QDAT labels only ghunnah and ikhfa — it has
// NO iqlab or idgham recordings (verse 5:109 contains neither). So iqlab
// can't be validated directly; ikhfa is the closest labeled analog (both are
// noon-sakinah assimilations carried on a nasal hold — iqlab before ب,
// ikhfa before the 15 ikhfa letters), whereas ghunnah is the shaddah-noon
// full nasalization with a different trigger.
//
// The concern this section answers: because the threshold is shared, tuning
// it "to help ghunnah" silently moves iqlab and ikhfa too. So we find the
// ghunnah-only optimum and show what it does to ikhfa (the iqlab proxy). If
// chasing ghunnah hurts ikhfa, then a ghunnah-driven tune would regress the
// iqlab family — which is exactly why the shared pair must be judged jointly,
// and why leaving it unchanged (below) is the safe call for iqlab.
function bestSingleRuleNasal(rule) {
  let best = { fraction: null, spike: null, acc: -1 };
  for (let frac = 0.1; frac <= 1.0001; frac += 0.025) {
    for (let spike = 4; spike <= 24.001; spike += 0.5) {
      const acc = evaluateRule(tuneSet, rule, { nasalHoldCountWordFraction: frac, nasalSpikeMaxDb: spike }).accuracy;
      if (acc != null && acc > best.acc) best = { fraction: Math.round(frac * 1000) / 1000, spike, acc };
    }
  }
  return best;
}

console.log("\nIQLAB COUPLING CHECK (ghunnah, iqlab, idgham, ikhfa share ONE threshold pair)");
console.log("  QDAT has no iqlab/idgham labels — ikhfa is the closest labeled proxy for iqlab.");
const ghunnahOnly = bestSingleRuleNasal("ghunnah");
const ghunnahOnlyTh = { nasalHoldCountWordFraction: ghunnahOnly.fraction, nasalSpikeMaxDb: ghunnahOnly.spike };
const gAtGhunnahOpt = evaluateRule(holdoutSet, "ghunnah", ghunnahOnlyTh);
const kAtGhunnahOpt = evaluateRule(holdoutSet, "ikhfa", ghunnahOnlyTh);
const gAtCurrent = evaluateRule(holdoutSet, "ghunnah", TAJWEED_THRESHOLDS);
const kAtCurrent = evaluateRule(holdoutSet, "ikhfa", TAJWEED_THRESHOLDS);
console.log(`  if we optimized the shared pair for GHUNNAH ALONE -> ${JSON.stringify(ghunnahOnlyTh)}`);
console.log(`    ghunnah holdout ${pct(gAtCurrent.accuracy)} -> ${pct(gAtGhunnahOpt.accuracy)}  (baseline ${pct(gAtGhunnahOpt.alwaysPassRate)})`);
console.log(`    ikhfa   holdout ${pct(kAtCurrent.accuracy)} -> ${pct(kAtGhunnahOpt.accuracy)}  (baseline ${pct(kAtGhunnahOpt.alwaysPassRate)})   <- iqlab rides this`);
const ikhfaMovesRight =
  (kAtGhunnahOpt.accuracy ?? 0) >= (kAtCurrent.accuracy ?? 0) &&
  (kAtGhunnahOpt.accuracy ?? 0) >= (kAtGhunnahOpt.alwaysPassRate ?? 0);
console.log(
  `  verdict: chasing ghunnah ${ikhfaMovesRight ? "does NOT hurt" : "would HURT/not help"} ikhfa (the iqlab proxy) -> ` +
    `${ikhfaMovesRight ? "a ghunnah tune could be safe for iqlab" : "a ghunnah-only tune is NOT safe for iqlab; keep the shared pair as-is"}.`
);

console.log("\nNote: QDAT does not label Qalqalah, so qalqalahBounceDb cannot be tuned from this dataset.");
