// Validates the Phase 1 spectral-shape research addition (2026-07 — see
// README.md) against QDAT: does either candidate (low/high band-energy
// ratio, or spectral centroid) beat the EXISTING duration/energy check for
// Ghunnah/Ikhfa, using the same rigorous method as tune-thresholds.mjs
// (stable tune/holdout split, always-pass baseline, grid search on the tune
// half only, judged on the holdout half).
//
// Requires features-spectral.json (extract-features.mjs re-run so its
// cached `measured` objects carry the new lowHighRatioDb/centroidHz fields
// alongside the existing duration/energy ones):
//   npx vite-node tools/qdat-eval/extract-features.mjs -- --data <dir> --out tools/qdat-eval/features-spectral.json
//   npx vite-node tools/qdat-eval/tune-thresholds-spectral.mjs
import fs from "node:fs";
import path from "node:path";
import { TAJWEED_THRESHOLDS } from "@/lib/tajweedAnalysis";

const featuresFile = (() => {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const i = args.indexOf("--features");
  return i === -1 ? path.join("tools", "qdat-eval", "features-spectral.json") : args[i + 1];
})();

const { records } = JSON.parse(fs.readFileSync(featuresFile, "utf8"));
const usable = records.filter((r) => !r.error);

const hashOf = (s) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
const tuneSet = usable.filter((r) => hashOf(r.file) % 2 === 0);
const holdoutSet = usable.filter((r) => hashOf(r.file) % 2 === 1);

// --- Existing approach (duration/energy) — mirrored from tune-thresholds.mjs,
// unchanged, reported here purely as the side-by-side baseline to beat. ---
function durationEnergyPass(measured, { nasalHoldCountWordFraction, nasalSpikeMaxDb }) {
  const expectedMinSec = (measured.expectedCounts / 2) * (measured.avgWordDur * nasalHoldCountWordFraction);
  return measured.segmentDurationSec >= expectedMinSec && measured.energySpreadDb < nasalSpikeMaxDb;
}

// --- New candidate 1: low/high-band energy ratio delta (dB) above this
// recording's own baseline. Both values are already in dB (log-scale), so
// an additive delta is the natural comparison (matching how energySpreadDb
// etc. are already plain dB differences elsewhere in this codebase). ---
function bandRatioPass(measured, { bandRatioDeltaDb }) {
  if (measured.lowHighRatioDb == null || measured.baselineLowHighRatioDb == null) return null; // no spectral data for this occurrence
  return measured.lowHighRatioDb - measured.baselineLowHighRatioDb >= bandRatioDeltaDb;
}

// --- New candidate 2: spectral centroid dip below this recording's own
// baseline, as a ratio (frequency comparisons are naturally multiplicative —
// same reasoning this codebase already uses semitones/log-ratios for pitch). ---
function centroidPass(measured, { centroidRatioFactor }) {
  if (measured.centroidHz == null || measured.baselineCentroidHz == null) return null;
  return measured.centroidHz <= measured.baselineCentroidHz * centroidRatioFactor;
}

function evaluateRule(set, rule, passFn, params) {
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
    const predicted = passFn(check.measured, params);
    if (predicted == null) {
      unchecked++; // this specific approach had no data for this occurrence (e.g. spectral fields absent)
      continue;
    }
    total++;
    if (label === 1) alwaysPassCorrect++;
    if ((predicted ? 1 : 0) === label) correct++;
  }
  return {
    accuracy: total ? correct / total : null,
    total,
    unchecked,
    alwaysPassRate: total ? alwaysPassCorrect / total : null,
  };
}

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

function gridSearch(rule, passFn, grid) {
  let best = { params: null, acc: -1 };
  for (const params of grid) {
    const acc = evaluateRule(tuneSet, rule, passFn, params).accuracy;
    if (acc != null && acc > best.acc) best = { params, acc };
  }
  return best;
}

function reportCandidate(label, rule, passFn, currentParams, best) {
  const cur = evaluateRule(holdoutSet, rule, passFn, currentParams);
  const tuned = evaluateRule(holdoutSet, rule, passFn, best.params);
  console.log(
    `  ${label.padEnd(24)} holdout: current ${pct(cur.accuracy)} (n=${cur.total})  ->  tuned ${pct(tuned.accuracy)} ` +
      `${JSON.stringify(best.params)} (n=${tuned.total})  |  always-pass baseline ${pct(tuned.alwaysPassRate)}`
  );
  return tuned;
}

console.log(`Loaded ${usable.length} usable records (tune=${tuneSet.length}, holdout=${holdoutSet.length})\n`);

const bandRatioGrid = [];
for (let d = 0; d <= 20.001; d += 0.5) bandRatioGrid.push({ bandRatioDeltaDb: d });

const centroidGrid = [];
for (let f = 0.5; f <= 1.0001; f += 0.02) centroidGrid.push({ centroidRatioFactor: Math.round(f * 100) / 100 });

for (const rule of ["ghunnah", "ikhfa"]) {
  console.log(`=== ${rule.toUpperCase()} ===`);

  const existing = evaluateRule(holdoutSet, rule, durationEnergyPass, TAJWEED_THRESHOLDS);
  console.log(
    `  ${"existing (duration/energy)".padEnd(24)} holdout: ${pct(existing.accuracy)} (n=${existing.total}, unchecked=${existing.unchecked})  |  always-pass baseline ${pct(existing.alwaysPassRate)}`
  );

  const bestBandRatio = gridSearch(rule, bandRatioPass, bandRatioGrid);
  reportCandidate("band-ratio (new)", rule, bandRatioPass, { bandRatioDeltaDb: 0 }, bestBandRatio);

  const bestCentroid = gridSearch(rule, centroidPass, centroidGrid);
  reportCandidate("centroid (new)", rule, centroidPass, { centroidRatioFactor: 1.0 }, bestCentroid);

  console.log("");
}

console.log(
  "Note: 'unchecked' above includes both the pipeline's usual ASR-alignment misses AND (for the two new\n" +
  "candidates only) occurrences where the spectral window was too short/silent to yield a centroid or band\n" +
  "ratio at all — reported as coverage, not hidden, same convention as the rest of this harness."
);
