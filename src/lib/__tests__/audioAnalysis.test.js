import { describe, it, expect } from "vitest";
import {
  compareSamples,
  analyzeRecordingQualityOnly,
  frameSignal,
  rms,
  energyProfileForWindow,
  energyProfileForCachedWindow,
  buildEnergyFrameCache,
  energyProfileForRefWindow,
  reduceNoise,
  buildFeatures,
  analyzeSingle,
  pitchStdSemitones,
  TARGET_SAMPLE_RATE,
} from "@/lib/audioAnalysis";

// Generates a synthetic "voice-like" signal: a tone burst (simulating
// speech) surrounded by silence, so VAD/energy logic has something
// meaningful to detect without needing real recorded audio.
function makeToneBurst({ sampleRate = TARGET_SAMPLE_RATE, silenceSec = 0.3, toneSec = 1.0, freq = 150, amplitude = 0.5 }) {
  const silenceSamples = Math.round(silenceSec * sampleRate);
  const toneSamples = Math.round(toneSec * sampleRate);
  const total = silenceSamples * 2 + toneSamples;
  const out = new Float32Array(total);
  for (let i = 0; i < toneSamples; i++) {
    out[silenceSamples + i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return out;
}

function makeSilence(sec, sampleRate = TARGET_SAMPLE_RATE) {
  return new Float32Array(Math.round(sec * sampleRate));
}

// Generates a "real-voice-shaped" signal, unlike the pure sine above: a
// fundamental following a slow rise-fall pitch contour with decaying
// harmonics stacked on top (like vocal formants), optionally interrupted
// by short unvoiced gaps (like consonants/breaths). Pure sine fixtures
// never caught the pitch-pipeline bug this exists to pin: real voice has
// unvoiced frames interleaved with voiced ones, and averaging those 0 Hz
// frames into the contour destroyed the pitch correlation.
function makeVoiceLike({
  sampleRate = TARGET_SAMPLE_RATE,
  durationSec = 6,
  baseHz = 130,
  swingHz = 40,
  amplitude = 0.4,
  gapEverySec = 0,
  gapSec = 0.12,
  gapOffsetSec = 0,
  padSec = 0.3,
} = {}) {
  const n = Math.round(durationSec * sampleRate);
  const pad = Math.round(padSec * sampleRate);
  const out = new Float32Array(pad * 2 + n);
  let phase = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sampleRate;
    const f = baseHz + swingHz * Math.sin(2 * Math.PI * 0.35 * t);
    phase += (2 * Math.PI * f) / sampleRate;
    if (gapEverySec > 0 && (t + gapOffsetSec) % gapEverySec < gapSec) continue;
    let s = 0;
    for (let k = 1; k <= 6; k++) s += Math.sin(phase * k) / k;
    out[pad + i] = amplitude * s * 0.5;
  }
  return out;
}

describe("frameSignal / rms", () => {
  it("produces frames whose rms reflects signal amplitude", () => {
    const loud = makeToneBurst({ amplitude: 0.8, toneSec: 0.5 });
    const quiet = makeToneBurst({ amplitude: 0.05, toneSec: 0.5 });
    const { frames: loudFrames } = frameSignal(loud, TARGET_SAMPLE_RATE);
    const { frames: quietFrames } = frameSignal(quiet, TARGET_SAMPLE_RATE);
    const midLoud = loudFrames[Math.floor(loudFrames.length / 2)];
    const midQuiet = quietFrames[Math.floor(quietFrames.length / 2)];
    expect(rms(midLoud)).toBeGreaterThan(rms(midQuiet));
  });
});

describe("analyzeRecordingQualityOnly", () => {
  it("returns score 0 for silence", () => {
    const result = analyzeRecordingQualityOnly(makeSilence(1), TARGET_SAMPLE_RATE);
    expect(result.score).toBe(0);
    expect(result.referenceAvailable).toBe(false);
  });

  it("returns score 0 for a recording shorter than the minimum duration", () => {
    const result = analyzeRecordingQualityOnly(makeToneBurst({ toneSec: 0.1, silenceSec: 0.05 }), TARGET_SAMPLE_RATE);
    expect(result.score).toBe(0);
  });

  it("gives a non-zero score for a clear, sustained tone", () => {
    const result = analyzeRecordingQualityOnly(makeToneBurst({ toneSec: 1.5, amplitude: 0.6 }), TARGET_SAMPLE_RATE);
    expect(result.score).toBeGreaterThan(0);
    expect(result.referenceAvailable).toBe(false);
    expect(Array.isArray(result.feedback)).toBe(true);
  });
});

describe("compareSamples", () => {
  it("scores an identical signal against itself very highly", () => {
    const signal = makeToneBurst({ toneSec: 1.2, amplitude: 0.5 });
    const result = compareSamples(signal, signal, TARGET_SAMPLE_RATE);
    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(result.referenceAvailable).toBe(true);
  });

  it("scores a silent recording as 0 even with a valid reference", () => {
    const reference = makeToneBurst({ toneSec: 1.0 });
    const result = compareSamples(makeSilence(1.5), reference, TARGET_SAMPLE_RATE);
    expect(result.score).toBe(0);
    expect(result.feedback[0]).toMatch(/no speech/i);
    expect(result.referenceAlignment).toBeNull();
  });

  it("penalizes a much shorter recording than the reference (pacing mismatch)", () => {
    const reference = makeToneBurst({ toneSec: 2.0, amplitude: 0.5 });
    const rushed = makeToneBurst({ toneSec: 0.4, amplitude: 0.5 });
    const goodPace = makeToneBurst({ toneSec: 1.9, amplitude: 0.5 });
    const rushedResult = compareSamples(rushed, reference, TARGET_SAMPLE_RATE);
    const goodResult = compareSamples(goodPace, reference, TARGET_SAMPLE_RATE);
    expect(rushedResult.score).toBeLessThan(goodResult.score);
  });
});

// Duplicates every sample `factor` times (nearest-neighbor time-stretch) —
// preserves the energy envelope's shape exactly while spreading it over a
// longer duration, giving a clean ground truth for "landmark at user-time t
// should map to approximately t*factor in the stretched reference".
function stretchInTime(samples, factor) {
  const n = Math.round(samples.length * factor);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = samples[Math.min(samples.length - 1, Math.floor(i / factor))];
  return out;
}

describe("compareSamples referenceAlignment", () => {
  it("is present, with a mapping function and a reference energy array, for a normal comparison", () => {
    const signal = makeToneBurst({ toneSec: 1.2, amplitude: 0.5 });
    const result = compareSamples(signal, signal, TARGET_SAMPLE_RATE);
    expect(result.referenceAlignment).not.toBeNull();
    expect(typeof result.referenceAlignment.mapUserSecToRefSec).toBe("function");
    expect(Array.isArray(result.referenceAlignment.refEnergyDb) || ArrayBuffer.isView(result.referenceAlignment.refEnergyDb)).toBe(true);
    expect(result.referenceAlignment.refEnergyDb.length).toBeGreaterThan(0);
  });

  it("is null when the reference is silent/near-empty, even though the user recording is fine", () => {
    const user = makeToneBurst({ toneSec: 1.0, amplitude: 0.5 });
    const silentRef = makeSilence(1.0);
    const result = compareSamples(user, silentRef, TARGET_SAMPLE_RATE);
    expect(result.referenceAlignment).toBeNull();
  });

  it("maps a user timestamp to approximately itself when the reference is identical", () => {
    const voice = makeVoiceLike({ durationSec: 2, gapEverySec: 0.4, gapSec: 0.15 });
    const result = compareSamples(voice, voice, TARGET_SAMPLE_RATE);
    const durationSec = voice.length / TARGET_SAMPLE_RATE;
    for (const frac of [0.3, 0.5, 0.7]) {
      const t = durationSec * frac;
      const mapped = result.referenceAlignment.mapUserSecToRefSec(t);
      expect(mapped).not.toBeNull();
      expect(Math.abs(mapped - t)).toBeLessThan(0.1); // within ~one frame hop's slack
    }
  });

  it("maps a user timestamp to approximately the proportionally scaled timestamp in a time-stretched reference", () => {
    const user = makeVoiceLike({ durationSec: 2, gapEverySec: 0.4, gapSec: 0.15 });
    const factor = 1.4;
    const reference = stretchInTime(user, factor);
    const result = compareSamples(user, reference, TARGET_SAMPLE_RATE);
    expect(result.referenceAlignment).not.toBeNull();
    const userDurationSec = user.length / TARGET_SAMPLE_RATE;
    for (const frac of [0.4, 0.6]) {
      const t = userDurationSec * frac;
      const mapped = result.referenceAlignment.mapUserSecToRefSec(t);
      expect(mapped).not.toBeNull();
      // Loose tolerance — DTW bucket quantization is inherently coarse;
      // this asserts order-of-magnitude correctness, not exact equality.
      const expected = t * factor;
      expect(Math.abs(mapped - expected)).toBeLessThan(expected * 0.3 + 0.15);
    }
  });
});

// Pins the pitch-scoring fix for real voice. The old pipeline scored two
// professional reciters of the same ayah at pitch 15/100 (rhythm 79,
// energy 89) because of the defects each test below locks down.
describe("pitch scoring on voice-like signals", () => {
  // Shared fixtures (built once — the autocorrelation over ~550 frames per
  // signal is the slow part of this file).
  const continuousVoice = makeVoiceLike({});
  // Same syllable rhythm so DTW aligns, but offset gap timing and widths:
  // differing voicing patterns, like a phone mic vs a studio reference.
  const voiceA = makeVoiceLike({ gapEverySec: 0.5, gapSec: 0.18, baseHz: 130 });
  const voiceB = makeVoiceLike({ gapEverySec: 0.5, gapSec: 0.08, gapOffsetSec: 0.25, baseHz: 145 });

  it("scores an identical voice-like signal against itself at pitch 100", () => {
    const result = compareSamples(voiceA, voiceA, TARGET_SAMPLE_RATE);
    expect(result.pitchScore).toBe(100);
  });

  it("zero-averaging regression: differing voicing patterns must not crater the pitch score", () => {
    // Same pitch contour in both voices; only the unvoiced-gap pattern
    // differs. The old pipeline averaged unvoiced 0 Hz frames into the
    // contour (manufacturing impossible values like 74 Hz from [148, 0])
    // and scored this pair 62; with real recordings the same defect
    // produced near-zero pitch scores.
    const result = compareSamples(voiceA, voiceB, TARGET_SAMPLE_RATE);
    expect(result.pitchScore).not.toBeNull();
    expect(result.pitchScore).toBeGreaterThanOrEqual(75);
  });

  it("a quiet recording still gets its pitch analyzed (relative voicing gate)", () => {
    // Old absolute 0.008-rms gate marked every frame of this recording
    // unvoiced (pitch: null). The gate is now relative to the recording's
    // own peak, mirroring detectActivity.
    const quiet = makeVoiceLike({ amplitude: 0.01 });
    const result = compareSamples(quiet, continuousVoice, TARGET_SAMPLE_RATE);
    expect(result.pitchScore).not.toBeNull();
    expect(result.pitchScore).toBeGreaterThanOrEqual(80);
  });

  it("degrades gracefully when there is too little voiced audio to measure pitch", () => {
    // ~70ms of voice in 2s of silence: far too little for a contour
    // correlation. Pitch must be reported unavailable (null) — not NaN,
    // and not a fabricated number from a handful of frames — while the
    // other components still produce a finite overall score.
    const blipVoice = makeVoiceLike({ durationSec: 0.07, padSec: 1.0 });
    const result = compareSamples(blipVoice, continuousVoice, TARGET_SAMPLE_RATE);
    expect(result.pitchScore).toBeNull();
    expect(Number.isFinite(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.feedback.length).toBeGreaterThan(0);
  });
});

describe("analyzeSingle — pause detection", () => {
  it("reports zero pauses for one continuous tone with no internal gap", () => {
    const signal = makeToneBurst({ silenceSec: 0.3, toneSec: 1.0 });
    const result = analyzeSingle(signal, TARGET_SAMPLE_RATE);
    expect(result.pauseCount).toBe(0);
    expect(result.pauseDurationsSec).toEqual([]);
  });

  it("detects one pause of roughly the right length between two tone bursts", () => {
    // tone, ~500ms silent gap (well over the 280ms minimum), tone again —
    // all voiced by the same relative-to-peak activity gate, so the middle
    // gap is the only thing that should register as a pause.
    const toneA = makeToneBurst({ silenceSec: 0, toneSec: 0.6, amplitude: 0.6 });
    const gap = makeSilence(0.5);
    const toneB = makeToneBurst({ silenceSec: 0, toneSec: 0.6, amplitude: 0.6 });
    const signal = new Float32Array(toneA.length + gap.length + toneB.length);
    signal.set(toneA, 0);
    signal.set(gap, toneA.length);
    signal.set(toneB, toneA.length + gap.length);

    const result = analyzeSingle(signal, TARGET_SAMPLE_RATE);
    expect(result.pauseCount).toBe(1);
    expect(result.pauseDurationsSec).toHaveLength(1);
    expect(result.pauseDurationsSec[0]).toBeGreaterThan(0.35);
    expect(result.pauseDurationsSec[0]).toBeLessThan(0.65);
  });
});

describe("pitchStdSemitones", () => {
  it("returns null when there are too few voiced frames to measure", () => {
    // Fewer than 6 voiced (>0) entries — below the minimum this function
    // requires before a standard deviation would mean anything.
    const pitchHz = [0, 0, 120, 0, 118, 0, 0, 0];
    expect(pitchStdSemitones(pitchHz, 0, pitchHz.length - 1)).toBeNull();
  });

  it("is register-invariant: an octave-shifted contour has ~the same volatility", () => {
    // hzToSemitone is 12*log2(hz/anchor) — multiplying every Hz value by a
    // constant factor (an octave shift) adds a CONSTANT to every semitone
    // value, which standard deviation is blind to by construction. This is
    // the concrete property the reciter style profiler leans on to claim
    // "volatility, not register" — pin it directly rather than just assert.
    const low = makeVoiceLike({ baseHz: 130, swingHz: 40 });
    const high = makeVoiceLike({ baseHz: 260, swingHz: 80 }); // same shape, one octave up
    const lowFeat = buildFeatures(low, TARGET_SAMPLE_RATE);
    const highFeat = buildFeatures(high, TARGET_SAMPLE_RATE);
    const lowStd = pitchStdSemitones(lowFeat.pitchHz, 0, lowFeat.pitchHz.length - 1);
    const highStd = pitchStdSemitones(highFeat.pitchHz, 0, highFeat.pitchHz.length - 1);
    expect(lowStd).not.toBeNull();
    expect(highStd).not.toBeNull();
    expect(Math.abs(lowStd - highStd)).toBeLessThan(1.5);
  });

  it("a flat/steady pitch has lower volatility than a wide swinging one", () => {
    const steady = makeVoiceLike({ baseHz: 150, swingHz: 2 });
    const swinging = makeVoiceLike({ baseHz: 150, swingHz: 60 });
    const steadyFeat = buildFeatures(steady, TARGET_SAMPLE_RATE);
    const swingingFeat = buildFeatures(swinging, TARGET_SAMPLE_RATE);
    const steadyStd = pitchStdSemitones(steadyFeat.pitchHz, 0, steadyFeat.pitchHz.length - 1);
    const swingingStd = pitchStdSemitones(swingingFeat.pitchHz, 0, swingingFeat.pitchHz.length - 1);
    expect(steadyStd).toBeLessThan(swingingStd);
  });
});

describe("energyProfileForWindow", () => {
  it("returns higher average energy for a window over the tone than over silence", () => {
    const signal = makeToneBurst({ silenceSec: 0.5, toneSec: 0.5, amplitude: 0.7 });
    const silenceWindow = energyProfileForWindow(signal, TARGET_SAMPLE_RATE, 0, 0.3);
    const toneWindow = energyProfileForWindow(signal, TARGET_SAMPLE_RATE, 0.6, 0.9);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(toneWindow.energyDb)).toBeGreaterThan(avg(silenceWindow.energyDb));
  });
});

describe("buildEnergyFrameCache / energyProfileForCachedWindow", () => {
  it("produces byte-identical results to energyProfileForWindow's one-shot form, for multiple windows against the same signal", () => {
    // This is the exact usage pattern checkTajweedRules moved to: frame
    // once, look up many windows — must be indistinguishable in output
    // from framing fresh on every lookup (the previous behavior).
    const signal = makeToneBurst({ silenceSec: 0.5, toneSec: 0.5, amplitude: 0.7 });
    const cache = buildEnergyFrameCache(signal, TARGET_SAMPLE_RATE);

    const windows = [
      [0, 0.3],
      [0.6, 0.9],
      [0.4, 0.7],
    ];
    for (const [startSec, endSec] of windows) {
      const fresh = energyProfileForWindow(signal, TARGET_SAMPLE_RATE, startSec, endSec);
      const cached = energyProfileForCachedWindow(cache, startSec, endSec);
      expect(cached).toEqual(fresh);
    }
  });

  it("energyProfileForWindow itself is defined in terms of the cache (single source of truth for the windowing math)", () => {
    const signal = makeToneBurst({ silenceSec: 0.2, toneSec: 0.3, amplitude: 0.6 });
    const direct = buildEnergyFrameCache(signal, TARGET_SAMPLE_RATE);
    expect(energyProfileForCachedWindow(direct, 0, 0.2)).toEqual(
      energyProfileForWindow(signal, TARGET_SAMPLE_RATE, 0, 0.2)
    );
  });
});

describe("energyProfileForRefWindow", () => {
  it("returns higher average energy for a window over the tone than over silence, reading from a precomputed array", () => {
    const signal = makeToneBurst({ silenceSec: 0.5, toneSec: 0.5, amplitude: 0.7 });
    const { energyDb, hopSize } = buildFeatures(signal, TARGET_SAMPLE_RATE);
    const referenceAlignment = { refEnergyDb: energyDb, hopSec: hopSize / TARGET_SAMPLE_RATE };
    const silenceWindow = energyProfileForRefWindow(referenceAlignment, 0, 0.3);
    const toneWindow = energyProfileForRefWindow(referenceAlignment, 0.6, 0.9);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(toneWindow.energyDb)).toBeGreaterThan(avg(silenceWindow.energyDb));
  });

  it("returns an empty profile when referenceAlignment has no energy array", () => {
    expect(energyProfileForRefWindow(null, 0, 1).energyDb).toEqual([]);
    expect(energyProfileForRefWindow({ refEnergyDb: [] }, 0, 1).energyDb).toEqual([]);
  });
});

// ---- Noise reduction (calibration-driven soft noise gate) --------------

// Deterministic pseudo-noise so the tests don't flake. Uniform in [-a, a].
function makeNoise(nSamples, amplitude, seed = 1) {
  const out = new Float32Array(nSamples);
  let s = seed >>> 0;
  for (let i = 0; i < nSamples; i++) {
    s = (s * 1664525 + 1013904223) >>> 0; // LCG
    out[i] = ((s / 0xffffffff) * 2 - 1) * amplitude;
  }
  return out;
}

// [noise-only gap][loud tone + same noise][noise-only gap] — the gaps sit at
// the noise floor (should be gated down), the tone sits well above it (should
// be preserved). Returns the signal plus the sample ranges of each region.
function makeToneInNoise({ sampleRate = TARGET_SAMPLE_RATE, gapSec = 0.5, toneSec = 0.6, freq = 200, toneAmp = 0.3, noiseAmp = 0.02 }) {
  const gap = Math.round(gapSec * sampleRate);
  const tone = Math.round(toneSec * sampleRate);
  const total = gap * 2 + tone;
  const noise = makeNoise(total, noiseAmp);
  const out = new Float32Array(total);
  for (let i = 0; i < total; i++) out[i] = noise[i];
  for (let i = 0; i < tone; i++) {
    out[gap + i] += toneAmp * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return { signal: out, gap, tone, total };
}

// The noise floor the way micCalibration.js derives it: median per-frame
// energy (dB) of an ambient (noise-only) clip.
function measureFloorDb(noiseClip) {
  const { energyDb } = buildFeatures(noiseClip, TARGET_SAMPLE_RATE);
  const sorted = [...energyDb].filter(Number.isFinite).sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const rmsOf = (arr, from = 0, to = arr.length) => {
  let sum = 0;
  for (let i = from; i < to; i++) sum += arr[i] * arr[i];
  return Math.sqrt(sum / (to - from));
};
const peakOf = (arr, from = 0, to = arr.length) => {
  let p = 0;
  for (let i = from; i < to; i++) p = Math.max(p, Math.abs(arr[i]));
  return p;
};

describe("reduceNoise (calibration-driven soft noise gate)", () => {
  it("drops the noise floor in the gaps while preserving the tone's peak and energy", () => {
    const { signal, gap, tone } = makeToneInNoise({});
    const noiseFloorDb = measureFloorDb(makeNoise(TARGET_SAMPLE_RATE, 0.02, 7));

    const out = reduceNoise(signal, TARGET_SAMPLE_RATE, { noiseFloorDb });

    // Gap (noise-only) energy must drop substantially. Measure the interior
    // of the trailing gap, away from the gate's release ramp at the boundary.
    const gapStart = gap + tone + Math.round(0.15 * TARGET_SAMPLE_RATE);
    const gapEnd = gap + tone + gap;
    const gapBefore = rmsOf(signal, gapStart, gapEnd);
    const gapAfter = rmsOf(out, gapStart, gapEnd);
    expect(gapAfter).toBeLessThan(gapBefore * 0.5); // at least ~6 dB down

    // Tone (voice) must survive essentially intact: peak and energy over the
    // interior of the tone region are preserved (gate is at unity gain there).
    const tStart = gap + Math.round(0.1 * TARGET_SAMPLE_RATE);
    const tEnd = gap + tone - Math.round(0.1 * TARGET_SAMPLE_RATE);
    expect(peakOf(out, tStart, tEnd)).toBeGreaterThan(peakOf(signal, tStart, tEnd) * 0.98);
    const eBefore = rmsOf(signal, tStart, tEnd);
    const eAfter = rmsOf(out, tStart, tEnd);
    expect(eAfter).toBeGreaterThan(eBefore * 0.95);
    expect(eAfter).toBeLessThanOrEqual(eBefore * 1.0001); // never amplifies
  });

  it("is a no-op on an uncalibrated device (no noiseFloorDb) — returns the same array", () => {
    const { signal } = makeToneInNoise({});
    expect(reduceNoise(signal, TARGET_SAMPLE_RATE, {})).toBe(signal);
    expect(reduceNoise(signal, TARGET_SAMPLE_RATE, { noiseFloorDb: null })).toBe(signal);
    expect(reduceNoise(signal, TARGET_SAMPLE_RATE, { noiseFloorDb: NaN })).toBe(signal);
  });

  it("does nothing when the recording is basically all noise (no clear voice above the floor)", () => {
    // A near-uniform noise clip: the loudest frame isn't 10 dB above the
    // floor, so the guard must leave it untouched rather than gate speech.
    const noise = makeNoise(TARGET_SAMPLE_RATE, 0.02, 3);
    const floorDb = measureFloorDb(noise);
    const out = reduceNoise(noise, TARGET_SAMPLE_RATE, { noiseFloorDb: floorDb });
    expect(out).toBe(noise); // same reference — untouched
  });

  it("never boosts the signal: no output sample exceeds its input magnitude", () => {
    const { signal } = makeToneInNoise({});
    const noiseFloorDb = measureFloorDb(makeNoise(TARGET_SAMPLE_RATE, 0.02, 11));
    const out = reduceNoise(signal, TARGET_SAMPLE_RATE, { noiseFloorDb });
    for (let i = 0; i < signal.length; i++) {
      expect(Math.abs(out[i])).toBeLessThanOrEqual(Math.abs(signal[i]) + 1e-9);
    }
  });
});
