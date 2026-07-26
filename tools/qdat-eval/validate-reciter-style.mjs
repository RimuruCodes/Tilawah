// Phase 3 validation for the reciter style profiler (build-reciter-profile.mjs
// + compile-reciter-profile.mjs): does scaling the generic threshold-mode
// Madd/nasal-hold expectations toward a specific reciter's typical pacing
// (see reciterStyleProfiles.js) actually produce MORE accurate pass/warn
// verdicts against real expert labels, or just different ones?
//
// Reuses the cached features.json from extract-features.mjs (threshold-mode
// QDAT extraction) — no ASR re-run needed. That cache already has the
// GENERIC measured values (expectedRatio, avgWordDur, expectedCounts); this
// script re-derives what the verdict WOULD have been with a style
// multiplier applied, using the exact same formulas checkTajweedRules uses
// (see the styleTargetRatio/styleTargetMinSec math in tajweedAnalysis.js),
// and compares holdout accuracy against both the unadjusted verdict and
// QDAT's expert label.
//
// Important interpretation caveat (report this alongside any numbers): QDAT
// speakers were reciting 5:109 as themselves, not attempting to imitate any
// specific reciter's style. This measures "does blindly scaling toward
// Alafasy's typical pacing help or hurt verdict accuracy on a general
// population," not "does it help specifically when a user picked Alafasy as
// their model." It's the closest real validation available without a
// reciter-specific labeled dataset (which doesn't exist).
//
// Usage:
//   npx vite-node tools/qdat-eval/validate-reciter-style.mjs -- --reciter Alafasy_128kbps [--features <file>]
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { TAJWEED_THRESHOLDS } from "@/lib/tajweedAnalysis";
import { RECITER_STYLE_PROFILES } from "@/lib/reciterStyleProfiles";

function parseArgs() {
  const args = process.argv.slice(2).filter((a) => a !== "--");
  const get = (flag) => {
    const i = args.indexOf(flag);
    return i === -1 ? null : args[i + 1];
  };
  return {
    reciterFolder: get("--reciter") || "Alafasy_128kbps",
    featuresFile: get("--features") || path.join("tools", "qdat-eval", "features.json"),
  };
}

const { reciterFolder, featuresFile } = parseArgs();
const profile = RECITER_STYLE_PROFILES[reciterFolder];
if (!profile) {
  console.error(`No style profile found for ${reciterFolder} in reciterStyleProfiles.js`);
  process.exit(1);
}

const { records } = JSON.parse(fs.readFileSync(featuresFile, "utf8"));
const usable = records.filter((r) => !r.error);

const hashOf = (s) => [...s].reduce((h, c) => ((h * 31 + c.charCodeAt(0)) >>> 0), 0);
const tuneSet = usable.filter((r) => hashOf(r.file) % 2 === 0);
const holdoutSet = usable.filter((r) => hashOf(r.file) % 2 === 1);

// Mirrors tajweedAnalysis.js's checkTajweedRules threshold-mode formulas
// exactly (styleTargetRatio / styleTargetMinSec), applied here to a cached
// generic `measured` instead of a live signal.
function maddPassGeneric(measured) {
  return measured.actualRatio >= measured.expectedRatio * TAJWEED_THRESHOLDS.maddMinRatioFactor;
}
function maddPassStyled(measured) {
  const styleTargetRatio = measured.expectedRatio * (profile.maddElongationMultiplier ?? 1);
  return measured.actualRatio >= styleTargetRatio * TAJWEED_THRESHOLDS.maddMinRatioFactor;
}
function nasalPassGeneric(measured) {
  const expectedMinSec = (measured.expectedCounts / 2) * (measured.avgWordDur * TAJWEED_THRESHOLDS.nasalHoldCountWordFraction);
  return measured.segmentDurationSec >= expectedMinSec && measured.energySpreadDb < TAJWEED_THRESHOLDS.nasalSpikeMaxDb;
}
function nasalPassStyled(measured) {
  const expectedMinSec = (measured.expectedCounts / 2) * (measured.avgWordDur * TAJWEED_THRESHOLDS.nasalHoldCountWordFraction);
  const styleTargetMinSec = expectedMinSec * (profile.nasalHoldMultiplier ?? 1);
  return measured.segmentDurationSec >= styleTargetMinSec && measured.energySpreadDb < TAJWEED_THRESHOLDS.nasalSpikeMaxDb;
}

const RULES = {
  madd: { generic: maddPassGeneric, styled: maddPassStyled, hasMultiplier: profile.maddElongationMultiplier != null },
  ghunnah: { generic: nasalPassGeneric, styled: nasalPassStyled, hasMultiplier: profile.nasalHoldMultiplier != null },
  ikhfa: { generic: nasalPassGeneric, styled: nasalPassStyled, hasMultiplier: profile.nasalHoldMultiplier != null },
};

function evaluate(set, rule, fn) {
  let correct = 0;
  let total = 0;
  let alwaysPassCorrect = 0;
  for (const r of set) {
    const label = r.labels?.[rule];
    if (label !== 0 && label !== 1) continue;
    const check = r.checks?.[rule];
    // "unchecked" verdicts (unmeasurable occurrences) have no `measured` at
    // all. Older cached extractions also predate the `mode` field entirely
    // (added later for DTW reference-anchoring) but never had any other
    // mode to begin with — extract-features.mjs never supplies a
    // referenceAlignment — so an absent mode on an existing measured object
    // still means "threshold".
    if (!check?.measured || (check.measured.mode && check.measured.mode !== "threshold")) continue;
    total++;
    if (label === 1) alwaysPassCorrect++;
    if ((fn(check.measured) ? 1 : 0) === label) correct++;
  }
  return { accuracy: total ? correct / total : null, total, alwaysPassRate: total ? alwaysPassCorrect / total : null };
}

const pct = (v) => (v == null ? "n/a" : `${(v * 100).toFixed(1)}%`);

console.log(`Reciter style profile under test: ${reciterFolder}`);
console.log(`  maddElongationMultiplier=${profile.maddElongationMultiplier}  nasalHoldMultiplier=${profile.nasalHoldMultiplier}`);
console.log(`(caveat: QDAT speakers recite as themselves, not imitating ${reciterFolder} — see this script's header comment)\n`);

for (const [rule, { generic, styled, hasMultiplier }] of Object.entries(RULES)) {
  if (!hasMultiplier) {
    console.log(`${rule}: profile has no multiplier for this rule family — skipped.`);
    continue;
  }
  const tGeneric = evaluate(tuneSet, rule, generic);
  const hGeneric = evaluate(holdoutSet, rule, generic);
  const tStyled = evaluate(tuneSet, rule, styled);
  const hStyled = evaluate(holdoutSet, rule, styled);
  console.log(
    `${rule.padEnd(8)} generic: tune ${pct(tGeneric.accuracy)} (n=${tGeneric.total}) | holdout ${pct(hGeneric.accuracy)}  ` +
      `||  styled: tune ${pct(tStyled.accuracy)} | holdout ${pct(hStyled.accuracy)}  ` +
      `||  always-pass baseline ${pct(hGeneric.alwaysPassRate)}`
  );
}
