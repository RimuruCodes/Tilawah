import { describe, it, expect, beforeEach } from "vitest";
import { calibrateFromSamples, getStoredCalibration, hasCalibration, clearCalibration } from "@/lib/micCalibration";
import { TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";

function makeNoise(sec, amplitude, sampleRate = TARGET_SAMPLE_RATE) {
  const n = Math.round(sec * sampleRate);
  const out = new Float32Array(n);
  // Deterministic pseudo-noise (not Math.random) so tests are reproducible.
  for (let i = 0; i < n; i++) {
    out[i] = amplitude * Math.sin(i * 12.9898) * 0.5;
  }
  return out;
}

describe("micCalibration", () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it("has no calibration by default", () => {
    expect(hasCalibration()).toBe(false);
    expect(getStoredCalibration()).toBeNull();
  });

  it("stores a noise floor after calibrating", () => {
    const samples = makeNoise(2, 0.01);
    const result = calibrateFromSamples(samples, TARGET_SAMPLE_RATE);
    expect(typeof result.noiseFloorDb).toBe("number");
    expect(hasCalibration()).toBe(true);
    expect(getStoredCalibration().noiseFloorDb).toBe(result.noiseFloorDb);
  });

  it("reports a higher noise floor for louder ambient noise", () => {
    const quiet = calibrateFromSamples(makeNoise(2, 0.005), TARGET_SAMPLE_RATE);
    const loud = calibrateFromSamples(makeNoise(2, 0.05), TARGET_SAMPLE_RATE);
    expect(loud.noiseFloorDb).toBeGreaterThan(quiet.noiseFloorDb);
  });

  it("clears calibration", () => {
    calibrateFromSamples(makeNoise(2, 0.01), TARGET_SAMPLE_RATE);
    expect(hasCalibration()).toBe(true);
    clearCalibration();
    expect(hasCalibration()).toBe(false);
  });
});
