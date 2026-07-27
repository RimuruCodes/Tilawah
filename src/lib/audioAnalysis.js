// Real audio analysis for recitation scoring.
//
// This module actually decodes and listens to the user's recording. When a
// reference reciter's audio for the same ayah is available, it decodes that
// too and compares the two waveforms acoustically:
//   - energy (loudness/rhythm) envelope
//   - pitch (intonation) contour, via autocorrelation
//   - overall duration / pacing
//   - alignment quality via Dynamic Time Warping (DTW)
//
// It is honest about its limits: this is signal-level acoustic similarity,
// not phoneme-level Tajweed grading (that would require a trained Arabic
// speech-recognition/forced-alignment model, which isn't something that can
// run client-side here). When no reference audio can be fetched, it falls
// back to analyzing the recording's own quality (silence, pauses, clipping)
// and says so explicitly rather than inventing a comparison score.

export const TARGET_SAMPLE_RATE = 16000;
const FRAME_MS = 32;
const HOP_MS = 12;
const MIN_PITCH_HZ = 70;
const MAX_PITCH_HZ = 400;

let sharedAudioContext = null;
function getAudioContext() {
  if (!sharedAudioContext) {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    sharedAudioContext = new Ctx();
  }
  return sharedAudioContext;
}

export async function blobToArrayBuffer(blob) {
  return await blob.arrayBuffer();
}

export async function fetchArrayBuffer(url, timeoutMs = 12000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal, mode: "cors" });
    if (!res.ok) throw new Error(`Failed to fetch reference audio (${res.status})`);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}

// Decodes arbitrary audio bytes and resamples to a fixed mono sample rate so
// the two recordings being compared are on equal footing.
export async function decodeToMonoSamples(arrayBuffer, targetSampleRate = TARGET_SAMPLE_RATE) {
  const ctx = getAudioContext();
  const decoded = await ctx.decodeAudioData(arrayBuffer.slice(0));

  const offline = new OfflineAudioContext(
    1,
    Math.ceil(decoded.duration * targetSampleRate),
    targetSampleRate
  );
  const source = offline.createBufferSource();
  source.buffer = decoded;
  source.connect(offline.destination);
  source.start();
  const rendered = await offline.startRendering();
  return rendered.getChannelData(0).slice(); // mono Float32Array
}

export function frameSignal(samples, sampleRate, frameMs = FRAME_MS, hopMs = HOP_MS) {
  const frameSize = Math.round((frameMs / 1000) * sampleRate);
  const hopSize = Math.round((hopMs / 1000) * sampleRate);
  const frames = [];
  for (let start = 0; start + frameSize <= samples.length; start += hopSize) {
    frames.push(samples.subarray(start, start + frameSize));
  }
  if (frames.length === 0 && samples.length > 0) frames.push(samples);
  return { frames, hopSize };
}

export function rms(frame) {
  let sum = 0;
  for (let i = 0; i < frame.length; i++) sum += frame[i] * frame[i];
  return Math.sqrt(sum / frame.length);
}

function toDb(value) {
  return 20 * Math.log10(Math.max(value, 1e-8));
}

// Autocorrelation-based pitch detection (classic approach, e.g. Chris
// Wilson's pitch detector). Returns 0 when no plausible pitch is found.
// Voicing gating (deciding whether the frame is loud enough to attempt
// pitch on at all) lives in buildFeatures, relative to the recording's
// own peak level — an absolute threshold here misclassified half of a
// quieter recording's frames as unvoiced.
function detectPitch(frame, sampleRate) {
  const size = frame.length;

  let r1 = 0;
  let r2 = size - 1;
  const threshold = 0.2;
  for (let i = 0; i < size / 2; i++) {
    if (Math.abs(frame[i]) < threshold) { r1 = i; break; }
  }
  for (let i = 1; i < size / 2; i++) {
    if (Math.abs(frame[size - i]) < threshold) { r2 = size - i; break; }
  }
  const trimmed = frame.slice(r1, r2);
  const n = trimmed.length;
  if (n < 8) return 0;

  const c = new Float32Array(n);
  for (let lag = 0; lag < n; lag++) {
    let sum = 0;
    for (let i = 0; i < n - lag; i++) sum += trimmed[i] * trimmed[i + lag];
    c[lag] = sum;
  }

  let d = 0;
  while (d + 1 < n && c[d] > c[d + 1]) d++;

  let maxVal = -1;
  let maxPos = -1;
  for (let i = d; i < n; i++) {
    if (c[i] > maxVal) { maxVal = c[i]; maxPos = i; }
  }
  if (maxPos <= 0) return 0;

  const x1 = c[maxPos - 1] || 0;
  const x2 = c[maxPos];
  const x3 = c[maxPos + 1] || 0;
  const a = (x1 + x3 - 2 * x2) / 2;
  const b = (x3 - x1) / 2;
  let refinedPos = maxPos;
  if (a !== 0) refinedPos = maxPos - b / (2 * a);

  const freq = sampleRate / refinedPos;
  if (freq < MIN_PITCH_HZ || freq > MAX_PITCH_HZ) return 0;
  return freq;
}

// Builds per-frame energy (dB) and pitch (Hz) sequences for a mono signal.
// Pitch is only attempted on frames that pass a voicing gate relative to
// the recording's own peak level (same pattern as detectActivity), with an
// absolute floor so a near-silent recording doesn't count as fully voiced.
export function buildFeatures(samples, sampleRate) {
  const { frames, hopSize } = frameSignal(samples, sampleRate);
  const energyDb = new Array(frames.length);
  const pitchHz = new Array(frames.length);
  for (let i = 0; i < frames.length; i++) {
    energyDb[i] = toDb(rms(frames[i]));
  }
  const maxDb = Math.max(...energyDb, -100);
  const voicedGateDb = Math.max(maxDb - 30, -60);
  for (let i = 0; i < frames.length; i++) {
    pitchHz[i] = energyDb[i] > voicedGateDb ? detectPitch(frames[i], sampleRate) : 0;
  }
  return { energyDb, pitchHz, hopSize, frameCount: frames.length };
}

// Lightweight, model-free noise reduction: a soft noise gate driven by the
// device's calibrated noise floor. Frames whose short-time energy sits at or
// near the measured floor — the gaps around speech, where fan/AC/traffic hum
// lives — are attenuated; frames clearly above it (actual voice) pass through
// at UNITY gain, so the speaker's peak and energy are preserved untouched.
//
// Deliberately NOT spectral subtraction: calibration gives a single broadband
// floor (one dB number), not a per-frequency noise spectrum, so there's
// nothing to subtract spectrally without inventing a profile — and a full FFT
// denoiser risks musical-noise artifacts on real speech. This is time-domain
// amplitude gating: no FFT, no model, no second WASM/ONNX runtime (which is
// exactly the memory hazard we spent this project fixing).
//
// Degrades safely, matching the rest of this codebase: returns the samples
// UNCHANGED when there's no usable `noiseFloorDb` (uncalibrated device), or
// when the recording's own loudest frame isn't clearly above the floor
// (all-noise clip, or an unreliable/too-hot floor estimate) — the worst it
// can do to real voice is nothing.
export function reduceNoise(samples, sampleRate, { noiseFloorDb } = {}) {
  if (!Number.isFinite(noiseFloorDb) || samples.length === 0) return samples;

  const { frames, hopSize } = frameSignal(samples, sampleRate);
  if (frames.length === 0) return samples;

  const frameDb = frames.map((f) => toDb(rms(f)));
  const maxDb = Math.max(...frameDb);
  // If the loudest frame isn't clearly above the floor, gating risks eating
  // real content (or there's simply nothing but noise) — do nothing.
  const MIN_HEADROOM_DB = 10;
  if (maxDb - noiseFloorDb < MIN_HEADROOM_DB) return samples;

  // Soft-knee gate, in dB relative to the measured floor:
  //   - at/below floor+CLOSE_DB  -> attenuate to FLOOR_GAIN (noise)
  //   - at/above floor+OPEN_DB   -> unity gain (voice, untouched)
  //   - between                  -> linear ramp
  // FLOOR_GAIN is not zero: leaving a residual avoids unnatural dead silence
  // and gate "pumping", and keeps any faint real content that dips near the
  // floor from vanishing.
  const CLOSE_DB = 3;
  const OPEN_DB = 12;
  const FLOOR_GAIN = 0.12; // ~ -18 dB
  const closeThresh = noiseFloorDb + CLOSE_DB;
  const openThresh = noiseFloorDb + OPEN_DB;

  const targetGain = frameDb.map((db) => {
    if (db >= openThresh) return 1;
    if (db <= closeThresh) return FLOOR_GAIN;
    const t = (db - closeThresh) / (openThresh - closeThresh);
    return FLOOR_GAIN + t * (1 - FLOOR_GAIN);
  });

  // Temporal smoothing: open fast (don't clip a word's onset), close slow
  // (don't chop a word's tail or click). One-pole toward the target.
  const ATTACK = 0.6;
  const RELEASE = 0.15;
  const smoothGain = new Array(targetGain.length);
  let g = targetGain[0];
  for (let i = 0; i < targetGain.length; i++) {
    const coeff = targetGain[i] > g ? ATTACK : RELEASE;
    g += coeff * (targetGain[i] - g);
    smoothGain[i] = g;
  }

  // Apply, interpolating each sample's gain linearly between frame centers so
  // there are no per-frame gain steps (which would themselves be audible).
  const out = new Float32Array(samples.length);
  const lastIdx = smoothGain.length - 1;
  for (let i = 0; i < samples.length; i++) {
    const fpos = i / hopSize;
    const i0 = Math.min(Math.floor(fpos), lastIdx);
    const i1 = Math.min(i0 + 1, lastIdx);
    const frac = fpos - Math.floor(fpos);
    const gain = smoothGain[i0] + frac * (smoothGain[i1] - smoothGain[i0]);
    out[i] = samples[i] * gain;
  }
  return out;
}

// Relative voice-activity detection: anything within `dropDb` of the loudest
// frame counts as "active speech". This works regardless of absolute mic
// gain differences between the user's mic and the reference recording.
//
// If a calibrated noise floor is supplied (see micCalibration.js), the
// threshold also can't drop below noiseFloorDb + a small margin — this
// prevents a noisy/quiet mic's background hiss from being misread as
// speech, which the purely-relative threshold alone can't always catch.
function detectActivity(energyDb, dropDb = 32, noiseFloorDb = null) {
  const maxDb = Math.max(...energyDb, -100);
  let threshold = maxDb - dropDb;
  if (noiseFloorDb != null) {
    threshold = Math.max(threshold, noiseFloorDb + 6);
  }
  return energyDb.map((db) => db > threshold);
}

function trimToActive(active) {
  let start = active.findIndex(Boolean);
  let end = active.length - 1 - [...active].reverse().findIndex(Boolean);
  if (start === -1) return { start: 0, end: -1 }; // fully silent
  return { start, end };
}

// Same detection loop as before, but also keeps each qualifying pause's own
// length — countPauses only ever needed the count, but the reciter style
// profiler (tools/qdat-eval/build-reciter-profile.mjs) needs typical pause
// LENGTH too, not just how often they happen.
function measurePauses(active, start, end, hopMs, minPauseMs = 280) {
  const minPauseFrames = Math.max(1, Math.round(minPauseMs / hopMs));
  let count = 0;
  let silentRun = 0;
  const durationsSec = [];
  for (let i = start; i <= end; i++) {
    if (!active[i]) {
      silentRun++;
    } else {
      if (silentRun >= minPauseFrames) {
        count++;
        durationsSec.push((silentRun * hopMs) / 1000);
      }
      silentRun = 0;
    }
  }
  // No trailing-silence check needed: `end` is always the last ACTIVE frame
  // (by construction of trimToActive), so the loop's else-branch already
  // closes out any pending silentRun by the time i reaches end.
  return { count, durationsSec };
}

function countPauses(active, start, end, hopMs, minPauseMs = 280) {
  return measurePauses(active, start, end, hopMs, minPauseMs).count;
}

function zScore(arr) {
  const valid = arr.filter((v) => Number.isFinite(v));
  if (valid.length === 0) return arr.map(() => 0);
  const mean = valid.reduce((a, b) => a + b, 0) / valid.length;
  const variance = valid.reduce((a, b) => a + (b - mean) ** 2, 0) / valid.length;
  const std = Math.sqrt(variance) || 1;
  return arr.map((v) => (Number.isFinite(v) ? (v - mean) / std : 0));
}

function hzToSemitone(hz) {
  return hz > 0 ? 12 * Math.log2(hz / 110) : null; // relative to A2, arbitrary anchor
}

// Bounded Dynamic Time Warping: aligns two feature sequences (arrays of
// numbers) and returns the warping path plus normalized alignment cost.
// Sequences are pre-downsampled by the caller to keep this O(n*m) bounded.
function dtwAlign(seqA, seqB) {
  const n = seqA.length;
  const m = seqB.length;
  if (n === 0 || m === 0) return { path: [], normalizedCost: 3 };

  const INF = Infinity;
  const cost = Array.from({ length: n + 1 }, () => new Float64Array(m + 1).fill(INF));
  cost[0][0] = 0;

  for (let i = 1; i <= n; i++) {
    for (let j = 1; j <= m; j++) {
      const d = Math.abs(seqA[i - 1] - seqB[j - 1]);
      const best = Math.min(cost[i - 1][j], cost[i][j - 1], cost[i - 1][j - 1]);
      cost[i][j] = d + best;
    }
  }

  const path = [];
  let i = n;
  let j = m;
  while (i > 0 && j > 0) {
    path.push([i - 1, j - 1]);
    const diag = cost[i - 1][j - 1];
    const up = cost[i - 1][j];
    const left = cost[i][j - 1];
    if (diag <= up && diag <= left) { i--; j--; }
    else if (up < left) { i--; }
    else { j--; }
  }
  path.reverse();

  const normalizedCost = cost[n][m] / path.length;
  return { path, normalizedCost };
}

function downsample(arr, targetLen) {
  if (arr.length <= targetLen) return arr;
  const out = new Array(targetLen);
  const bucket = arr.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    let sum = 0;
    let count = 0;
    for (let k = start; k < end && k < arr.length; k++) {
      sum += arr[k];
      count++;
    }
    out[i] = count ? sum / count : 0;
  }
  return out;
}

// Short median filter over voiced frames only. Removes isolated octave
// errors (the autocorrelation detector occasionally locks onto a harmonic,
// e.g. 266 Hz in the middle of a stable 133 Hz run) without smearing real
// contour movement. Unvoiced frames (0) are left untouched.
function medianFilterPitch(pitchHz, radius = 2) {
  const out = pitchHz.slice();
  for (let i = 0; i < pitchHz.length; i++) {
    if (pitchHz[i] <= 0) continue;
    const window = [];
    for (let k = Math.max(0, i - radius); k <= Math.min(pitchHz.length - 1, i + radius); k++) {
      if (pitchHz[k] > 0) window.push(pitchHz[k]);
    }
    window.sort((a, b) => a - b);
    out[i] = window[Math.floor(window.length / 2)];
  }
  return out;
}

// Voiced-aware downsampling for pitch tracks. The generic downsample()
// arithmetic-averages every value in a bucket — but pitch tracks use 0 Hz
// to mean "unvoiced", so averaging [148, 0] manufactured impossible values
// like 74 Hz that then poisoned the pitch correlation (this was the cause
// of near-zero pitch scores on real voice). Instead: median of the voiced
// frames per bucket, or null when under half the bucket is voiced.
function downsamplePitchVoiced(pitchHz, targetLen) {
  if (pitchHz.length <= targetLen) return pitchHz.map((v) => (v > 0 ? v : null));
  const out = new Array(targetLen);
  const bucket = pitchHz.length / targetLen;
  for (let i = 0; i < targetLen; i++) {
    const start = Math.floor(i * bucket);
    const end = Math.max(start + 1, Math.floor((i + 1) * bucket));
    const voiced = [];
    let total = 0;
    for (let k = start; k < end && k < pitchHz.length; k++) {
      total++;
      if (pitchHz[k] > 0) voiced.push(pitchHz[k]);
    }
    if (voiced.length === 0 || voiced.length < total / 2) {
      out[i] = null;
      continue;
    }
    voiced.sort((a, b) => a - b);
    out[i] = voiced[Math.floor(voiced.length / 2)];
  }
  return out;
}

function pearson(a, b) {
  const n = Math.min(a.length, b.length);
  if (n < 3) return 0;
  let meanA = 0, meanB = 0;
  for (let i = 0; i < n; i++) { meanA += a[i]; meanB += b[i]; }
  meanA /= n; meanB /= n;
  let num = 0, denA = 0, denB = 0;
  for (let i = 0; i < n; i++) {
    const da = a[i] - meanA;
    const db = b[i] - meanB;
    num += da * db;
    denA += da * da;
    denB += db * db;
  }
  const den = Math.sqrt(denA * denB);
  return den === 0 ? 0 : num / den;
}

const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));

function buildFeedback({ overall, durationRatio, alignmentScore, energyScore, pitchScore, pauseCount, referenceAvailable }) {
  const notes = [];

  if (!referenceAvailable) {
    notes.push(
      "The reference reciter's audio couldn't be loaded for direct comparison, so this score reflects your recording's own clarity, pacing, and pauses only."
    );
  }

  if (durationRatio != null) {
    if (durationRatio > 1.18) {
      notes.push(`You recited about ${Math.round((durationRatio - 1) * 100)}% slower than the reference — check you're not over-elongating or hesitating.`);
    } else if (durationRatio < 0.82) {
      notes.push(`You recited about ${Math.round((1 - durationRatio) * 100)}% faster than the reference — slow down so elongations (madd) get their full length.`);
    } else {
      notes.push("Your overall pacing was close to the reference reciter's.");
    }
  }

  if (pauseCount > 3) {
    notes.push(`Detected ${pauseCount} noticeable pauses — try reciting the verse more continuously.`);
  }

  if (alignmentScore != null) {
    if (alignmentScore < 45) notes.push("The rhythm/structure of your recitation diverged significantly from the reference — try listening once more, then recording.");
    else if (alignmentScore >= 80) notes.push("Your rhythm closely tracked the reference recitation.");
  }

  if (pitchScore != null) {
    if (pitchScore < 45) notes.push("Your intonation (pitch rise/fall) didn't closely match the reference — pay attention to how the reciter's voice moves up and down.");
    else if (pitchScore >= 80) notes.push("Your intonation contour matched the reference well.");
  }

  if (energyScore != null) {
    if (energyScore < 45) notes.push("Where you emphasized/stressed syllables differed from the reference reciter.");
  }

  if (overall >= 90) notes.unshift("Excellent — a very close acoustic match to the reference recitation.");
  else if (overall >= 75) notes.unshift("Good recitation — solid match with some room to refine timing and pitch.");
  else if (overall >= 50) notes.unshift("Recognizable, but there's a clear gap versus the reference — more practice will help.");
  else notes.unshift("This attempt diverged substantially from the reference recitation.");

  return notes;
}

// Standard deviation of the voiced pitch contour, in semitones, over
// [start, end]. Shift-invariant by construction (std ignores a constant
// offset), so this measures how much the contour MOVES — volatility/shape —
// never where it sits (register) or what it's made of (timbre); this
// codebase has no spectral/formant analysis anywhere, so timbre isn't
// something these numbers could reflect even incidentally. Shared by
// analyzeRecordingQualityOnly's pitchStabilityScore and the reciter style
// profiler (tools/qdat-eval/build-reciter-profile.mjs), so both reuse one
// definition of "pitch volatility" rather than keeping two.
export function pitchStdSemitones(pitchHz, start, end) {
  const values = pitchHz.slice(start, end + 1).filter((p) => p > 0).map(hzToSemitone);
  if (values.length < 6) return null;
  const mean = values.reduce((s, v) => s + v, 0) / values.length;
  const variance = values.reduce((s, v) => s + (v - mean) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

export function analyzeSingle(samples, sampleRate, noiseFloorDb = null) {
  const { energyDb, pitchHz, hopSize } = buildFeatures(samples, sampleRate);
  const hopMs = (hopSize / sampleRate) * 1000;
  const active = detectActivity(energyDb, 32, noiseFloorDb);
  const { start, end } = trimToActive(active);
  const isSilent = start > end;
  const pauses = isSilent ? { count: 0, durationsSec: [] } : measurePauses(active, start, end, hopMs);
  const durationSec = samples.length / sampleRate;
  const activeDurationSec = isSilent ? 0 : ((end - start + 1) * hopSize) / sampleRate;
  return {
    energyDb,
    pitchHz,
    hopMs,
    active,
    start,
    end,
    isSilent,
    pauseCount: pauses.count,
    pauseDurationsSec: pauses.durationsSec,
    durationSec,
    activeDurationSec,
  };
}

// Compares two already-decoded mono sample arrays (same sample rate).
// This is the core comparison engine, used both for single-ayah recording
// and for continuous (multi-ayah) recitation, where the reference samples
// are several ayahs concatenated together.
export function compareSamples(userSamples, refSamples, sampleRate = TARGET_SAMPLE_RATE, { userNoiseFloorDb = null } = {}) {
  const user = analyzeSingle(userSamples, sampleRate, userNoiseFloorDb);
  const ref = analyzeSingle(refSamples, sampleRate);

  if (user.isSilent || user.durationSec < 0.35) {
    return {
      score: 0,
      referenceAvailable: true,
      userDuration: user.durationSec,
      referenceDuration: ref.durationSec,
      pauseCount: 0,
      feedback: ["No speech was detected in your recording — make sure your microphone is working and try again."],
      referenceAlignment: null,
    };
  }

  // Trim both to their active (voiced) region before comparing shape.
  const userEnergy = user.energyDb.slice(user.start, user.end + 1);
  const userPitch = user.pitchHz.slice(user.start, user.end + 1);
  const refEnergy = ref.energyDb.slice(ref.start, ref.end + 1);
  const refPitch = ref.pitchHz.slice(ref.start, ref.end + 1);

  const targetLen = clamp(Math.min(userEnergy.length, refEnergy.length), 20, 220);
  const userEnergyDs = downsample(zScore(userEnergy), targetLen);
  const refEnergyDs = downsample(zScore(refEnergy), targetLen);

  const { path, normalizedCost } = dtwAlign(userEnergyDs, refEnergyDs);
  const alignmentScore = clamp(100 * Math.exp(-normalizedCost / 1.4), 0, 100);

  // Small, additive structure for Tajweed rule checks to reuse this SAME
  // DTW alignment later — after the raw refSamples buffer has already
  // been released (see recitationService.js). Only a per-frame dB array
  // (a few hundred floats) and a time-mapping closure survive, never the
  // raw audio.
  const mapUserSecToRefSec = buildUserToRefSecMapper({
    path,
    userStart: user.start,
    userTrimmedLen: userEnergy.length,
    refStart: ref.start,
    refTrimmedLen: refEnergy.length,
    hopSec: ref.hopMs / 1000,
  });
  const referenceAlignment = mapUserSecToRefSec
    ? { refEnergyDb: ref.energyDb, hopSec: ref.hopMs / 1000, mapUserSecToRefSec }
    : null;

  // Use the DTW path to align pitch contours (in semitones) before
  // correlating them, so tempo differences don't wreck the comparison.
  // Pitch goes through its own voiced-aware downsampling (median of voiced
  // frames, null for mostly-unvoiced buckets) — the generic averaging
  // downsample() blends unvoiced 0s into the contour and wrecks it.
  const userSemitone = downsamplePitchVoiced(medianFilterPitch(userPitch), targetLen).map((v) =>
    v == null ? null : hzToSemitone(v)
  );
  const refSemitone = downsamplePitchVoiced(medianFilterPitch(refPitch), targetLen).map((v) =>
    v == null ? null : hzToSemitone(v)
  );
  const pairedUserPitch = [];
  const pairedRefPitch = [];
  for (const [i, j] of path) {
    const u = userSemitone[i];
    const r = refSemitone[j];
    if (u != null && r != null) {
      pairedUserPitch.push(u);
      pairedRefPitch.push(r);
    }
  }
  // A pitch-contour correlation is only meaningful with enough actual
  // voiced audio on both sides — counting DTW pairs alone is not enough,
  // because the path repeats indices when one series is much shorter
  // (e.g. a recording that is mostly silence), letting a fraction of a
  // second of voice masquerade as a measured score. Require ~0.5s of
  // voiced frames (12ms hop) each; otherwise report pitch as unavailable.
  const MIN_VOICED_FRAMES = 40;
  const userVoicedFrames = userPitch.filter((v) => v > 0).length;
  const refVoicedFrames = refPitch.filter((v) => v > 0).length;
  const pitchCorr =
    userVoicedFrames >= MIN_VOICED_FRAMES && refVoicedFrames >= MIN_VOICED_FRAMES && pairedUserPitch.length >= 6
      ? pearson(pairedUserPitch, pairedRefPitch)
      : null;
  const pitchScore = pitchCorr == null ? null : clamp(Math.max(pitchCorr, 0) * 100, 0, 100);

  const pairedUserEnergy = path.map(([i]) => userEnergyDs[i]);
  const pairedRefEnergy = path.map(([, j]) => refEnergyDs[j]);
  const energyCorr = pearson(pairedUserEnergy, pairedRefEnergy);
  const energyScore = clamp(Math.max(energyCorr, 0) * 100, 0, 100);

  const durationRatio = user.activeDurationSec / Math.max(ref.activeDurationSec, 0.05);
  const durationScore = clamp(100 * (1 - Math.abs(durationRatio - 1) / 0.6), 0, 100);

  const components = [
    { score: durationScore, weight: 0.2 },
    { score: alignmentScore, weight: 0.3 },
    { score: energyScore, weight: 0.25 },
    { score: pitchScore, weight: pitchScore == null ? 0 : 0.25 },
  ];
  const totalWeight = components.reduce((s, c) => s + (c.score == null ? 0 : c.weight), 0) || 1;
  const overall = Math.round(
    components.reduce((s, c) => s + (c.score == null ? 0 : c.score * c.weight), 0) / totalWeight
  );

  const feedback = buildFeedback({
    overall,
    durationRatio,
    alignmentScore,
    energyScore,
    pitchScore,
    pauseCount: user.pauseCount,
    referenceAvailable: true,
  });

  return {
    score: clamp(overall, 0, 100),
    referenceAvailable: true,
    userDuration: Math.round(user.durationSec * 10) / 10,
    referenceDuration: Math.round(ref.durationSec * 10) / 10,
    durationRatio: Math.round(durationRatio * 100) / 100,
    alignmentScore: Math.round(alignmentScore),
    energyScore: Math.round(energyScore),
    pitchScore: pitchScore == null ? null : Math.round(pitchScore),
    pauseCount: user.pauseCount,
    feedback,
    referenceAlignment,
  };
}

// Convenience wrapper: decodes two raw audio byte buffers, then compares
// them. Used when comparing a single recorded ayah against its single
// reference-reciter audio file.
export async function compareRecitation(userArrayBuffer, referenceArrayBuffer) {
  const [userSamples, refSamples] = await Promise.all([
    decodeToMonoSamples(userArrayBuffer),
    decodeToMonoSamples(referenceArrayBuffer),
  ]);
  return compareSamples(userSamples, refSamples, TARGET_SAMPLE_RATE);
}

// Extracts a per-frame energy (dB) slice for an arbitrary [startSec, endSec]
// time window, used by the Tajweed heuristics to look at a specific word's
// audio rather than the whole recording.
// Shared by energyProfileForCachedWindow (user-signal path, cached or
// one-shot via energyProfileForWindow) and energyProfileForRefWindow
// (precomputed reference-array path, used once the raw reference audio has
// already been released — see recitationService.js).
function frameWindowBounds(hopSec, startSec, endSec, frameCount) {
  const startFrame = Math.max(0, Math.floor(startSec / hopSec));
  const endFrame = Math.min(frameCount - 1, Math.ceil(endSec / hopSec));
  return { startFrame, endFrame };
}

// Precomputes the full-signal framing ONCE, for callers that need many
// window lookups against the SAME signal — e.g. checkTajweedRules, which
// does one lookup per rule occurrence. Re-running frameSignal from scratch
// per lookup (the previous behavior of energyProfileForWindow) means a
// continuous multi-ayah recitation with N rule occurrences re-frames the
// entire recording N times just to read a few frames each time; this lets
// that framing happen once and be sliced per rule instead.
export function buildEnergyFrameCache(samples, sampleRate) {
  const { frames, hopSize } = frameSignal(samples, sampleRate);
  return { frames, hopSec: hopSize / sampleRate };
}

// Same lookup as energyProfileForWindow, reading from an already-built
// cache (see buildEnergyFrameCache) instead of re-framing the signal.
export function energyProfileForCachedWindow(cache, startSec, endSec) {
  const { frames, hopSec } = cache;
  const { startFrame, endFrame } = frameWindowBounds(hopSec, startSec, endSec, frames.length);
  const energyDb = [];
  for (let i = startFrame; i <= endFrame; i++) {
    if (frames[i]) energyDb.push(toDb(rms(frames[i])));
  }
  return { energyDb, hopSec };
}

// Extracts a per-frame energy (dB) slice for a single arbitrary
// [startSec, endSec] window. For callers that need only one or a few
// lookups against a signal, this one-shot form is simplest; callers doing
// many lookups against the same signal (see checkTajweedRules) should use
// buildEnergyFrameCache + energyProfileForCachedWindow instead, so the
// signal is only framed once.
export function energyProfileForWindow(samples, sampleRate, startSec, endSec) {
  return energyProfileForCachedWindow(buildEnergyFrameCache(samples, sampleRate), startSec, endSec);
}

// --- Spectral shape features (Ghunnah/Ikhfa research, 2026-07) ---
//
// Duration and RMS energy (above) can't distinguish "a genuine nasal hum
// happened here" from "any sound was just held a bit long" — both look
// identical on those two measurements. A real nasal murmur has a distinct
// SPECTRAL shape instead: energy concentrated in a low-frequency nasal
// formant (~250-450 Hz) with the nasal cavity's anti-resonance damping
// energy in the 1-3 kHz range where oral vowels/consonants carry their
// F2/F3 or frication energy. These two features capture that shape,
// deterministically (a hand-rolled FFT, no trained model) — see
// tools/qdat-eval/README.md for the QDAT validation of whether either one
// actually helps Ghunnah/Ikhfa verdicts beyond the existing duration/energy
// check, which they are added ALONGSIDE, not in place of.

// In-place iterative radix-2 Cooley-Tukey FFT. `re`/`im` length must be a
// power of two (callers zero-pad; every frame in this codebase already is
// one — 32ms at 16kHz is exactly 512 samples — so padding is a no-op in
// practice, just a safety net if framing parameters ever change).
function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wRe = Math.cos(ang);
    const wIm = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let curRe = 1;
      let curIm = 0;
      const half = len / 2;
      for (let k = 0; k < half; k++) {
        const uRe = re[i + k];
        const uIm = im[i + k];
        const vRe = re[i + k + half] * curRe - im[i + k + half] * curIm;
        const vIm = re[i + k + half] * curIm + im[i + k + half] * curRe;
        re[i + k] = uRe + vRe;
        im[i + k] = uIm + vIm;
        re[i + k + half] = uRe - vRe;
        im[i + k + half] = uIm - vIm;
        const nextRe = curRe * wRe - curIm * wIm;
        const nextIm = curRe * wIm + curIm * wRe;
        curRe = nextRe;
        curIm = nextIm;
      }
    }
  }
}

function nextPow2(n) {
  let p = 1;
  while (p < n) p <<= 1;
  return p;
}

// Cached per padded-length, since every frame in a given recording pads to
// the same size — recomputing a Hann window per frame would be pure waste.
const hannWindowCache = new Map();
function hannWindow(n) {
  let w = hannWindowCache.get(n);
  if (!w) {
    w = new Float32Array(n);
    for (let i = 0; i < n; i++) w[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (n - 1));
    hannWindowCache.set(n, w);
  }
  return w;
}

// Magnitude spectrum (positive frequencies only) of one time-domain frame,
// Hann-windowed (standard practice for spectral analysis — reduces leakage
// from the frame's hard edges) and zero-padded to a power of two.
function magnitudeSpectrum(frame, sampleRate) {
  const n = nextPow2(frame.length);
  const win = hannWindow(frame.length);
  const re = new Float64Array(n);
  const im = new Float64Array(n);
  for (let i = 0; i < frame.length; i++) re[i] = frame[i] * win[i];
  fft(re, im);
  const bins = n / 2;
  const mag = new Float64Array(bins);
  for (let k = 0; k < bins; k++) mag[k] = Math.hypot(re[k], im[k]);
  return { mag, binHz: sampleRate / n };
}

// Low/high-band energy ratio (dB) and spectral centroid (Hz) for one frame.
// Band edges are standard acoustic-phonetics territory for nasal murmur
// (low, ~250-450 Hz formant) vs. oral vowel/consonant energy (higher,
// 1-4 kHz) — see the module-header comment above.
const LOW_BAND_HZ = [150, 1000];
const HIGH_BAND_HZ = [1000, 4000];
const CENTROID_BAND_HZ = [80, 4000];

function frameSpectralFeatures(frame, sampleRate) {
  const { mag, binHz } = magnitudeSpectrum(frame, sampleRate);
  let lowEnergy = 0;
  let highEnergy = 0;
  let centroidNum = 0;
  let centroidDen = 0;
  for (let k = 0; k < mag.length; k++) {
    const hz = k * binHz;
    const m = mag[k];
    if (hz >= LOW_BAND_HZ[0] && hz < LOW_BAND_HZ[1]) lowEnergy += m * m;
    if (hz >= HIGH_BAND_HZ[0] && hz < HIGH_BAND_HZ[1]) highEnergy += m * m;
    if (hz >= CENTROID_BAND_HZ[0] && hz < CENTROID_BAND_HZ[1]) {
      centroidNum += hz * m;
      centroidDen += m;
    }
  }
  const lowHighRatioDb = 10 * Math.log10(Math.max(lowEnergy, 1e-12) / Math.max(highEnergy, 1e-12));
  const centroidHz = centroidDen > 0 ? centroidNum / centroidDen : null;
  return { lowHighRatioDb, centroidHz };
}

// Per-frame spectral features over an arbitrary [startSec, endSec] window,
// reading from the same frame cache energyProfileForCachedWindow uses (see
// buildEnergyFrameCache) — no separate framing pass, no raw-audio retention
// beyond what compareSamples/checkTajweedRules already keep in scope.
export function spectralProfileForCachedWindow(cache, sampleRate, startSec, endSec) {
  const { frames, hopSec } = cache;
  const { startFrame, endFrame } = frameWindowBounds(hopSec, startSec, endSec, frames.length);
  const lowHighRatioDb = [];
  const centroidHz = [];
  for (let i = startFrame; i <= endFrame; i++) {
    if (!frames[i]) continue;
    const f = frameSpectralFeatures(frames[i], sampleRate);
    lowHighRatioDb.push(f.lowHighRatioDb);
    if (f.centroidHz != null) centroidHz.push(f.centroidHz);
  }
  return { lowHighRatioDb, centroidHz };
}

// Spectral flatness (Wiener entropy): geometric mean / arithmetic mean of
// the power spectrum. Near 0 for tonal/periodic signals (a vowel, a pure
// tone), near 1 for broadband/noise-like signals — the defining acoustic-
// phonetics signature of a plosive release burst (Qalqalah's "bounce",
// 2026-07 Phase 3 — see tools/qdat-eval/README.md), distinct from a plain
// loudness increase, which can be perfectly tonal (e.g. just reciting
// louder) and would fool an energy-only check.
function frameSpectralFlatness(frame, sampleRate) {
  const { mag } = magnitudeSpectrum(frame, sampleRate);
  let logSum = 0;
  let sum = 0;
  let n = 0;
  for (let k = 1; k < mag.length; k++) { // skip the DC bin
    const p = mag[k] * mag[k];
    if (p <= 0) continue;
    logSum += Math.log(p);
    sum += p;
    n++;
  }
  if (n === 0 || sum <= 0) return 0;
  const geoMean = Math.exp(logSum / n);
  const arithMean = sum / n;
  return geoMean / arithMean;
}

// Per-frame spectral flatness over an arbitrary [startSec, endSec] window,
// reading from the same frame cache energyProfileForCachedWindow uses —
// same indexing, so a flatness array and an energyDb array built from the
// same window line up frame-for-frame.
export function flatnessProfileForCachedWindow(cache, sampleRate, startSec, endSec) {
  const { frames, hopSec } = cache;
  const { startFrame, endFrame } = frameWindowBounds(hopSec, startSec, endSec, frames.length);
  const flatness = [];
  for (let i = startFrame; i <= endFrame; i++) {
    if (frames[i]) flatness.push(frameSpectralFlatness(frames[i], sampleRate));
  }
  return flatness;
}

// This recording's OWN typical spectral shape, as a self-relative baseline
// (matching this codebase's existing convention of comparing against the
// user's own average word duration, never a fixed absolute threshold —
// phone mic frequency response varies too much device-to-device for an
// absolute Hz/dB cutoff to be safe). Only voiced-ish frames count (same
// "within dropDb of this recording's own peak" convention as
// detectActivity), so silence/pauses don't dilute the baseline toward
// broadband noise. Computed once per recording and cached by the caller
// (see checkTajweedRules) — this walks every frame, so it's the more
// expensive of the two new spectral functions; see the qdat-eval Phase 1
// performance note for real numbers on a full recording.
export function recordingSpectralBaseline(cache, sampleRate, dropDb = 32) {
  const { frames } = cache;
  const frameDb = frames.map((f) => (f ? toDb(rms(f)) : -100));
  const maxDb = Math.max(...frameDb, -100);
  const threshold = maxDb - dropDb;
  const ratios = [];
  const centroids = [];
  for (let i = 0; i < frames.length; i++) {
    if (!frames[i] || frameDb[i] <= threshold) continue;
    const f = frameSpectralFeatures(frames[i], sampleRate);
    ratios.push(f.lowHighRatioDb);
    if (f.centroidHz != null) centroids.push(f.centroidHz);
  }
  const mean = (arr) => (arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : null);
  return { lowHighRatioDb: mean(ratios), centroidHz: mean(centroids) };
}

// Reference-side counterpart to energyProfileForWindow. Reads from the
// small per-frame array retained in a `referenceAlignment` struct (see
// compareSamples) instead of raw samples — by the time Tajweed rule
// checks run, the raw reference audio buffer has already been released.
export function energyProfileForRefWindow(referenceAlignment, startSec, endSec) {
  if (!referenceAlignment?.refEnergyDb?.length) return { energyDb: [] };
  const { refEnergyDb, hopSec } = referenceAlignment;
  const { startFrame, endFrame } = frameWindowBounds(hopSec, startSec, endSec, refEnergyDb.length);
  const energyDb = [];
  for (let i = startFrame; i <= endFrame; i++) {
    if (Number.isFinite(refEnergyDb[i])) energyDb.push(refEnergyDb[i]);
  }
  return { energyDb };
}

// Inverts/interpolates the DTW path compareSamples already computed (over
// z-scored, downsampled energy buckets) into a function mapping a
// timestamp in the user's full audio timeline to the corresponding
// timestamp in the reference's full timeline. Reuses the SAME dtwAlign()
// call compareSamples already made — this never runs a second DTW.
//
// Returns null (not a mapper function) when the path is empty or either
// side's active region is empty/degenerate (e.g. a silent or near-empty
// reference) — callers must then skip reference-anchored comparison
// entirely, falling back to threshold-based checks.
function buildUserToRefSecMapper({ path, userStart, userTrimmedLen, refStart, refTrimmedLen, hopSec }) {
  if (path.length === 0 || userTrimmedLen <= 0 || refTrimmedLen <= 0) return null;

  // path indices are bucket indices into the actual downsampled arrays,
  // whose length can be shorter than targetLen (downsample() returns the
  // array unchanged when arr.length <= targetLen — true for short
  // recordings). Derive real bucket counts from the path's own index
  // range rather than assuming targetLen.
  const nUser = Math.max(...path.map(([i]) => i)) + 1;
  const nRef = Math.max(...path.map(([, j]) => j)) + 1;

  // Average every ref bucket the path aligns to each user bucket (a DTW
  // path can visit several j's for one i, or vice versa).
  const jSumForI = new Array(nUser).fill(0);
  const jCountForI = new Array(nUser).fill(0);
  for (const [i, j] of path) {
    jSumForI[i] += j;
    jCountForI[i] += 1;
  }
  const jForI = jSumForI.map((sum, i) => (jCountForI[i] ? sum / jCountForI[i] : null));
  // DTW paths are monotonic and span every row, so every bucket should be
  // visited — fill any gap defensively via nearest filled neighbor.
  for (let i = 0; i < nUser; i++) {
    if (jForI[i] != null) continue;
    let lo = i - 1;
    while (lo >= 0 && jForI[lo] == null) lo--;
    let hi = i + 1;
    while (hi < nUser && jForI[hi] == null) hi++;
    jForI[i] = lo >= 0 ? jForI[lo] : hi < nUser ? jForI[hi] : 0;
  }

  const userBucketWidth = userTrimmedLen / nUser;
  const refBucketWidth = refTrimmedLen / nRef;

  return function mapUserSecToRefSec(userSec) {
    const userFrame = userSec / hopSec;
    const userTrimmedFrame = userFrame - userStart;
    if (userTrimmedFrame < 0 || userTrimmedFrame > userTrimmedLen) return null; // outside the region DTW actually aligned
    const bucketFloat = clamp(userTrimmedFrame / userBucketWidth, 0, nUser - 1);
    const i0 = Math.floor(bucketFloat);
    const i1 = Math.min(i0 + 1, nUser - 1);
    const frac = bucketFloat - i0;
    const j = jForI[i0] + frac * (jForI[i1] - jForI[i0]);
    const refTrimmedFrame = j * refBucketWidth;
    return (refTrimmedFrame + refStart) * hopSec;
  };
}

// Produces a coarse, normalized (0..1) amplitude envelope over the full
// raw recording, suitable for drawing a simple waveform/timeline in the
// UI. Uses the same frame/hop timing as the rest of the analysis so
// on-screen positions line up with Tajweed rule timestamps.
export function getVisualizationEnvelope(samples, sampleRate = TARGET_SAMPLE_RATE, maxPoints = 150) {
  const { energyDb, hopSize } = buildFeatures(samples, sampleRate);
  const hopSec = hopSize / sampleRate;
  const durationSec = samples.length / sampleRate;

  if (energyDb.length === 0) {
    return { points: [], hopSec, durationSec, pointDurationSec: durationSec };
  }

  const floorDb = Math.min(...energyDb);
  const ceilDb = Math.max(...energyDb);
  const range = Math.max(ceilDb - floorDb, 1e-6);
  const normalized = energyDb.map((db) => clamp((db - floorDb) / range, 0, 1));
  const points = downsample(normalized, Math.min(maxPoints, normalized.length));
  const pointDurationSec = durationSec / points.length;

  return { points, hopSec, durationSec, pointDurationSec };
}

// Fallback when no reference audio could be loaded (offline, CORS, etc).
// Scores recording *quality* honestly — it does not pretend to know how
// accurate the recitation was versus a reference.
export function analyzeRecordingQualityOnly(samples, sampleRate = TARGET_SAMPLE_RATE, noiseFloorDb = null) {
  const a = analyzeSingle(samples, sampleRate, noiseFloorDb);

  if (a.isSilent || a.durationSec < 0.35) {
    return {
      score: 0,
      referenceAvailable: false,
      userDuration: a.durationSec,
      pauseCount: 0,
      feedback: ["No speech was detected in your recording — make sure your microphone is working and try again."],
      referenceAlignment: null,
    };
  }

  const voicedFrames = a.active.slice(a.start, a.end + 1).filter(Boolean).length;
  const totalFrames = a.end - a.start + 1;
  const voicedRatio = voicedFrames / Math.max(totalFrames, 1);

  const pitchStd = pitchStdSemitones(a.pitchHz, a.start, a.end);
  const pitchStabilityScore = pitchStd == null ? 60 : clamp(100 - pitchStd * 12, 20, 100);

  const pauseScore = clamp(100 - a.pauseCount * 12, 20, 100);
  const voicedScore = clamp(voicedRatio * 130, 0, 100);

  const overall = Math.round(0.4 * voicedScore + 0.3 * pauseScore + 0.3 * pitchStabilityScore);

  const feedback = [
    "No matching reference reciter audio was available, so this reflects the clarity and steadiness of your recording rather than a comparison to a reciter.",
  ];
  if (a.pauseCount > 3) feedback.push(`Detected ${a.pauseCount} noticeable pauses in your recitation.`);
  if (voicedRatio < 0.5) feedback.push("A large portion of the recording had little detectable speech — try recording in a quieter environment, closer to the mic.");
  if (pitchStabilityScore < 50) feedback.push("Your pitch varied quite a bit — steady, controlled intonation will help your recitation flow.");

  return {
    score: clamp(overall, 0, 100),
    referenceAvailable: false,
    userDuration: Math.round(a.durationSec * 10) / 10,
    pauseCount: a.pauseCount,
    feedback,
    referenceAlignment: null,
  };
}
