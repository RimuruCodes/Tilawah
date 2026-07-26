// Reference-anchored threshold tuning against QDAT labels — the counterpart
// to tune-thresholds.mjs, using the cache extract-features-ref.mjs produces
// (features-ref.json), which ran checkTajweedRules WITH a real DTW
// referenceAlignment supplied so its reference-anchored branch (see
// TAJWEED_THRESHOLDS in src/lib/tajweedAnalysis.js) actually ran instead of
// falling through to the plain-threshold branch.
//
//   npx vite-node tools/qdat-eval/tune-thresholds-ref.mjs -- [--features <file>]
//
// Same method as tune-thresholds.mjs: stable-hash tune/holdout split,
// verdicts re-derived from cached `measured` values (no ASR re-run),
// always-pass baseline reported alongside accuracy. Only records whose
// cached check actually reached `measured.mode === "reference"` are
// evaluated here — a record that fell back to the threshold branch (DTW
// couldn't locate a trustworthy mapping for that occurrence) has no
// reference-anchored measurement to score.
//
// Coverage: QDAT labels only madd/ghunnah/ikhfa, so this can only validate
// maddRefMinRatioFactor, nasalHoldRefRatioFactor, and
// nasalSpikeRefToleranceFactor — not the Qalqalah or Idgham-without-Ghunnah
// reference-anchored constants (QDAT has no labels for either rule).
import fs from "node:fs";
import path from "node:path";
import { TAJWEED_THRESHOLDS } from "@/lib/tajweedAnalysis";

const featuresFile = (() => {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--features");
  return i === -1 ? path.join("tools", "qdat-eval", "features-ref.json") : args[i + 1];
})();

const { records, reciterFolder } = JSON.parse(fs.readFileSync(featuresFile, "utf8"));
const usable = records.filter((r) => !r.error);
console.log(`Reference reciter used for this run: ${reciterFolder}`);

const hashOf = (s) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
const tuneSet = usable.filter((r) => hashOf(r.file) % 2 === 0);
const holdoutSet = usable.filter((r) => hashOf(r.file) % 2 === 1);

// Verdict logic mirrored from checkTajweedRules's reference-anchored branch.
function maddPassRef(measured, { maddRefMinRatioFactor }) {
  return measured.elongationRatio >= maddRefMinRatioFactor;
}
function nasalPassRef(measured, { nasalHoldRefRatioFactor, nasalSpikeRefToleranceFactor }) {
  const ceiling = Math.max(TAJWEED_THRESHOLDS.nasalSpikeMaxDb, measured.refSpreadDb * nasalSpikeRefToleranceFactor);
  return measured.durationRatio >= nasalHoldRefRatioFactor && measured.energySpreadDb < ceiling;
}

const PASS_FN = { madd: maddPassRef, ghunnah: nasalPassRef, ikhfa: nasalPassRef };

function evaluateRule(set, rule, thresholds) {
  let correct = 0;
  let total = 0;
  let notReferenceMode = 0;
  let alwaysPassCorrect = 0;
  for (const r of set) {
    const label = r.labels?.[rule];
    if (label !== 0 && label !== 1) continue;
    const check = r.checks?.[rule];
    if (!check || check.measured?.mode !== "reference") {
      notReferenceMode++;
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
    notReferenceMode,
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
      `  ${rule.padEnd(8)} tune ${pct(t.accuracy)} (n=${t.total}, not-ref-mode=${t.notReferenceMode})  |  ` +
        `holdout ${pct(h.accuracy)} (n=${h.total}, not-ref-mode=${h.notReferenceMode})  |  always-pass baseline ${pct(h.alwaysPassRate)}`
    );
  }
}

report("CURRENT app reference-anchored thresholds", {
  maddRefMinRatioFactor: TAJWEED_THRESHOLDS.maddRefMinRatioFactor,
  nasalHoldRefRatioFactor: TAJWEED_THRESHOLDS.nasalHoldRefRatioFactor,
  nasalSpikeRefToleranceFactor: TAJWEED_THRESHOLDS.nasalSpikeRefToleranceFactor,
});

// ---- Grid search on the tune half only ----

let bestMadd = { factor: TAJWEED_THRESHOLDS.maddRefMinRatioFactor, acc: -1 };
for (let f = 0.3; f <= 1.5001; f += 0.025) {
  const acc = evaluateRule(tuneSet, "madd", { maddRefMinRatioFactor: f }).accuracy;
  if (acc != null && acc > bestMadd.acc) bestMadd = { factor: Math.round(f * 1000) / 1000, acc };
}

let bestNasal = {
  ratio: TAJWEED_THRESHOLDS.nasalHoldRefRatioFactor,
  tolerance: TAJWEED_THRESHOLDS.nasalSpikeRefToleranceFactor,
  acc: -1,
};
for (let ratio = 0.1; ratio <= 1.5001; ratio += 0.025) {
  for (let tol = 0.5; tol <= 4.0001; tol += 0.1) {
    const th = { nasalHoldRefRatioFactor: ratio, nasalSpikeRefToleranceFactor: tol };
    const g = evaluateRule(tuneSet, "ghunnah", th);
    const k = evaluateRule(tuneSet, "ikhfa", th);
    if (g.accuracy == null || k.accuracy == null) continue;
    const combined = (g.accuracy * g.total + k.accuracy * k.total) / (g.total + k.total);
    if (combined > bestNasal.acc) {
      bestNasal = { ratio: Math.round(ratio * 1000) / 1000, tolerance: Math.round(tol * 100) / 100, acc: combined };
    }
  }
}

const tuned = {
  maddRefMinRatioFactor: bestMadd.factor,
  nasalHoldRefRatioFactor: bestNasal.ratio,
  nasalSpikeRefToleranceFactor: bestNasal.tolerance,
};

report("TUNED reference-anchored thresholds (fit on tune half, judge by the holdout column)", tuned);

// Same Iqlab-coupling concern as tune-thresholds.mjs: the ref-anchored nasal
// pair is ALSO shared across the whole NASAL_HOLD_RULE_TYPES family
// (ghunnah, iqlab, idgham_ghunnah, ikhfa) — ikhfa is the closest labeled
// proxy for iqlab here too.
function bestSingleRuleNasal(rule) {
  let best = { ratio: null, tolerance: null, acc: -1 };
  for (let ratio = 0.1; ratio <= 1.5001; ratio += 0.025) {
    for (let tol = 0.5; tol <= 4.0001; tol += 0.1) {
      const acc = evaluateRule(tuneSet, rule, { nasalHoldRefRatioFactor: ratio, nasalSpikeRefToleranceFactor: tol }).accuracy;
      if (acc != null && acc > best.acc) best = { ratio: Math.round(ratio * 1000) / 1000, tolerance: Math.round(tol * 100) / 100, acc };
    }
  }
  return best;
}

console.log("\nIQLAB COUPLING CHECK (reference-anchored nasal pair — same shared-constant caveat as the threshold-mode check)");
const ghunnahOnly = bestSingleRuleNasal("ghunnah");
const ghunnahOnlyTh = { nasalHoldRefRatioFactor: ghunnahOnly.ratio, nasalSpikeRefToleranceFactor: ghunnahOnly.tolerance };
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
    `${ikhfaMovesRight ? "a ghunnah-only tune could be safe for iqlab" : "a ghunnah-only tune is NOT safe for iqlab; keep the shared pair as-is"}.`
);

console.log("\nNote: QDAT does not label Qalqalah or Idgham without Ghunnah, so qalqalahRefRatioFactor/qalqalahRefMinDb and");
console.log("idghamNoGhunnahTransientDb/idghamNoGhunnahRefToleranceFactor cannot be validated from this dataset.");
