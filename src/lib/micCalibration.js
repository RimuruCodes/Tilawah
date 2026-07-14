// Mic calibration: records a couple of seconds of ambient silence so the
// app knows this device/room's actual background noise level. Most of the
// scoring logic already uses *relative* thresholds (differences within a
// single recording), which are naturally robust to mic gain — but voice
// activity detection (deciding what counts as "speech" vs "silence") can
// still be fooled by a very noisy room or a very hot mic gain. Calibrating
// gives that detection a real, per-device anchor instead of only guessing
// from relative loudness.
import { buildFeatures } from "@/lib/audioAnalysis";

const CALIBRATION_KEY = "qc_mic_calibration";

export function getStoredCalibration() {
  try {
    const raw = localStorage.getItem(CALIBRATION_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function hasCalibration() {
  return !!getStoredCalibration();
}

export function clearCalibration() {
  localStorage.removeItem(CALIBRATION_KEY);
}

// Computes a robust (median-based) noise floor in dB from a short ambient
// recording and saves it. `samples` should be mono audio at `sampleRate`
// captured while the person stayed quiet.
export function calibrateFromSamples(samples, sampleRate) {
  const { energyDb } = buildFeatures(samples, sampleRate);
  const finiteDb = energyDb.filter((v) => Number.isFinite(v));
  if (finiteDb.length === 0) throw new Error("Couldn't read any audio to calibrate with.");

  const sorted = [...finiteDb].sort((a, b) => a - b);
  const median = sorted[Math.floor(sorted.length / 2)];

  const calibration = { noiseFloorDb: median, calibratedAt: new Date().toISOString() };
  localStorage.setItem(CALIBRATION_KEY, JSON.stringify(calibration));
  return calibration;
}
