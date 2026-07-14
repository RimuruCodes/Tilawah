import { describe, it, expect } from "vitest";
import {
  compareSamples,
  analyzeRecordingQualityOnly,
  frameSignal,
  rms,
  energyProfileForWindow,
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

describe("energyProfileForWindow", () => {
  it("returns higher average energy for a window over the tone than over silence", () => {
    const signal = makeToneBurst({ silenceSec: 0.5, toneSec: 0.5, amplitude: 0.7 });
    const silenceWindow = energyProfileForWindow(signal, TARGET_SAMPLE_RATE, 0, 0.3);
    const toneWindow = energyProfileForWindow(signal, TARGET_SAMPLE_RATE, 0.6, 0.9);
    const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
    expect(avg(toneWindow.energyDb)).toBeGreaterThan(avg(silenceWindow.energyDb));
  });
});
