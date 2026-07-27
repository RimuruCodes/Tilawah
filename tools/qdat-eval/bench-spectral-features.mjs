// Performance sanity check for the Ghunnah/Ikhfa spectral-shape research
// addition (2026-07, Phase 1 — see tools/qdat-eval/README.md): how much CPU
// does the new FFT-based low/high-ratio + centroid computation cost, on top
// of the existing duration/energy-only check, over a Continuous
// Recitation-length recording with many rule occurrences?
//
//   npx vite-node tools/qdat-eval/bench-spectral-features.mjs
import {
  buildEnergyFrameCache,
  energyProfileForCachedWindow,
  spectralProfileForCachedWindow,
  recordingSpectralBaseline,
  TARGET_SAMPLE_RATE,
} from "@/lib/audioAnalysis";

// A 5-minute synthetic recording — representative of a real Continuous
// Recitation session (several minutes, many ayahs) — voice-like tone bursts
// separated by brief pauses, so it isn't just uniform silence.
function buildLongRecording(durationSec, sampleRate) {
  const n = Math.round(durationSec * sampleRate);
  const out = new Float32Array(n);
  const wordSec = 0.4;
  const gapSec = 0.15;
  const period = wordSec + gapSec;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const posInPeriod = t % period;
    if (posInPeriod < wordSec) {
      const freq = 140 + 40 * Math.sin(2 * Math.PI * 0.5 * t); // voice-like pitch wobble
      out[i] = 0.4 * Math.sin(2 * Math.PI * freq * t);
    }
  }
  return out;
}

const DURATION_SEC = 300; // 5 minutes
const N_OCCURRENCES = 80; // realistic count of nasal-hold rule hits across a long continuous recitation
const WINDOW_SEC = 0.45; // typical rule window width (word + padding)

console.log(`Building a ${DURATION_SEC}s synthetic recording at ${TARGET_SAMPLE_RATE}Hz...`);
const signal = buildLongRecording(DURATION_SEC, TARGET_SAMPLE_RATE);

console.log("Framing (buildEnergyFrameCache, shared by both approaches)...");
const t0 = performance.now();
const cache = buildEnergyFrameCache(signal, TARGET_SAMPLE_RATE);
const framingMs = performance.now() - t0;
console.log(`  framing: ${framingMs.toFixed(1)}ms (${cache.frames.length} frames)`);

// Spread N_OCCURRENCES windows evenly across the recording.
const windows = [];
for (let i = 0; i < N_OCCURRENCES; i++) {
  const startSec = (i / N_OCCURRENCES) * (DURATION_SEC - WINDOW_SEC);
  windows.push([startSec, startSec + WINDOW_SEC]);
}

console.log(`\n--- EXISTING approach (duration/energy only) ---`);
const tExistingStart = performance.now();
for (const [startSec, endSec] of windows) {
  energyProfileForCachedWindow(cache, startSec, endSec);
}
const existingMs = performance.now() - tExistingStart;
console.log(`  ${N_OCCURRENCES} occurrences: ${existingMs.toFixed(1)}ms total (${(existingMs / N_OCCURRENCES).toFixed(2)}ms/occurrence)`);

console.log(`\n--- NEW spectral addition ---`);
const tBaselineStart = performance.now();
const baseline = recordingSpectralBaseline(cache, TARGET_SAMPLE_RATE);
const baselineMs = performance.now() - tBaselineStart;
console.log(`  recordingSpectralBaseline (whole-recording, once): ${baselineMs.toFixed(1)}ms`);
console.log(`    (baseline lowHighRatioDb=${baseline.lowHighRatioDb?.toFixed(2)}, centroidHz=${baseline.centroidHz?.toFixed(0)})`);

const tWindowsStart = performance.now();
for (const [startSec, endSec] of windows) {
  spectralProfileForCachedWindow(cache, TARGET_SAMPLE_RATE, startSec, endSec);
}
const spectralWindowsMs = performance.now() - tWindowsStart;
console.log(`  ${N_OCCURRENCES} occurrence windows: ${spectralWindowsMs.toFixed(1)}ms total (${(spectralWindowsMs / N_OCCURRENCES).toFixed(2)}ms/occurrence)`);

const totalNewMs = baselineMs + spectralWindowsMs;
console.log(`\n--- SUMMARY ---`);
console.log(`Existing (duration/energy) total:     ${existingMs.toFixed(1)}ms`);
console.log(`New spectral addition total:          ${totalNewMs.toFixed(1)}ms  (baseline ${baselineMs.toFixed(1)}ms + ${N_OCCURRENCES} windows ${spectralWindowsMs.toFixed(1)}ms)`);
console.log(`Added cost as multiple of existing:    ${(totalNewMs / existingMs).toFixed(1)}x`);
console.log(`Added cost as % of a ${DURATION_SEC}s recording's real-time budget: ${((totalNewMs / (DURATION_SEC * 1000)) * 100).toFixed(3)}%`);
