import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import {
  withTimeout,
  runTajweedAnalysis,
  getLastAsrFailure,
  describeAsrFailureForUser,
  describeAsrFailureForLog,
  analyzeSingleAyahRecitation,
  compareAgainstSecondReciter,
  persistRecitationResult,
  attachTajweedToLogs,
} from "@/lib/recitationService";
import * as audioAnalysis from "@/lib/audioAnalysis";
import * as lifecycleDebug from "@/lib/lifecycleDebug";
import * as memoryLedger from "@/lib/memoryLedger";
import { RecitationLog } from "@/lib/localDb";

// The analysis pipeline bounds every await with withTimeout because audio
// decode and the ASR worker can hang forever without throwing (observed on
// mobile and reproduced in e2e) — these pin the helper's contract.
describe("withTimeout", () => {
  it("resolves with the promise's value when it settles in time", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000, "test")).resolves.toBe(42);
  });

  it("propagates the promise's own rejection", async () => {
    await expect(withTimeout(Promise.reject(new Error("boom")), 1000, "test")).rejects.toThrow("boom");
  });

  it("rejects with a labeled error when the promise never settles", async () => {
    const never = new Promise(() => {});
    await expect(withTimeout(never, 20, "Decoding your recording")).rejects.toThrow(
      /Decoding your recording timed out/
    );
  });
});

// When Tajweed degrades to null, the WHY must survive: the log line and the
// result panel both read it via getLastAsrFailure. "Unavailable" with no
// reason wasted every real-device debugging round that hit it.
describe("ASR failure reasons", () => {
  const second = new Float32Array(16000); // 1s of silence @16kHz

  it("a transcript with no words degrades to null with code empty-transcript", async () => {
    const tajweed = await runTajweedAnalysis({
      userSamples: second,
      ayahArabicText: "قُلْ",
      asrResult: { text: "", chunks: [] },
    });
    expect(tajweed).toBeNull();
    expect(getLastAsrFailure()?.code).toBe("empty-transcript");
  });

  it("a transcript with recognized words does NOT trip the empty-transcript guard", async () => {
    const tajweed = await runTajweedAnalysis({
      userSamples: second,
      ayahArabicText: "بِسْمِ",
      asrResult: { text: "بسم", chunks: [{ text: "بسم", timestamp: [0, 0.8] }] },
    });
    expect(tajweed).not.toBeNull();
  });

  it("maps every failure code to an honest user-facing message", () => {
    expect(describeAsrFailureForUser({ code: "backgrounded-during-inference" })).toMatch(/foreground/);
    expect(describeAsrFailureForUser({ code: "timed-out" })).toMatch(/too long/);
    expect(describeAsrFailureForUser({ code: "empty-transcript" })).toMatch(/couldn't make out any words/);
    expect(describeAsrFailureForUser({ code: "inference-error" })).toMatch(/score isn't affected/);
    // Unknown/no failure: the panel keeps its generic line rather than
    // inventing a specific claim.
    expect(describeAsrFailureForUser(null)).toBeNull();
    expect(describeAsrFailureForUser({ code: "something-new" })).toBeNull();
  });

  it("formats the log form as code[: detail]", () => {
    expect(describeAsrFailureForLog({ code: "timed-out", detail: "no completion within 180s" })).toBe(
      "timed-out: no completion within 180s"
    );
    expect(describeAsrFailureForLog({ code: "empty-transcript", detail: "" })).toBe("empty-transcript");
    expect(describeAsrFailureForLog(null)).toBe("no reason recorded");
  });
});

// A real report (2026-07: Abdul Basit / Surah 75 / Ayah 1) that turned out
// to be unreproducible — the URL, CORS, and file were all confirmed fine
// directly — exposed that a reference-fetch failure was previously logged
// nowhere at all (a bare `catch { return null }`), so there was no way to
// tell a genuinely-missing file apart from a timeout, a CORS failure, or a
// one-off network blip after the fact. This pins that the real error now
// survives into the lifecycle log, without changing the fallback behavior.
describe("reference-fetch failure logging (analyzeSingleAyahRecitation)", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("logs the real error via recordLifecycleEvent and still falls back to recording-quality-only", async () => {
    vi.spyOn(audioAnalysis, "fetchArrayBuffer").mockRejectedValue(new Error("Failed to fetch reference audio (404)"));
    const recordSpy = vi.spyOn(lifecycleDebug, "recordLifecycleEvent");

    const userSamples = new Float32Array(16000); // 1s of silence @16kHz — content doesn't matter here
    const result = await analyzeSingleAyahRecitation({
      userSamples,
      reciterFolder: "Abdul_Basit_Murattal_192kbps",
      surahNumber: 75,
      ayahNumber: 1,
    });

    // Fallback behavior is unchanged: still degrades to a recording-quality-only result.
    expect(result.referenceAvailable).toBe(false);

    const call = recordSpy.mock.calls.find(([type]) => type === "reference-fetch-error");
    expect(call).toBeDefined();
    expect(call[1]).toContain("Abdul_Basit_Murattal_192kbps");
    expect(call[1]).toContain("75:1");
    expect(call[1]).toContain("404");
  });
});

function makeSineTone(sec, freq = 220, sampleRate = 16000) {
  const samples = new Float32Array(Math.round(sec * sampleRate));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = 0.4 * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  }
  return samples;
}

// Phase 3 (multi-reciter comparison, capped at 2): the entire feature is
// only actually memory-safe on mobile if the peak number of reference
// buffers held at once stays at 1 regardless of whether 1 or 2 reciters are
// compared -- sequential fetch/decode/compare/release per reciter, never
// two references resident together. This asserts that property directly
// via the real trackBuffer/releaseBuffer calls recitationService.js makes,
// not just that the feature produces a result -- the same standard the ASR
// model-eviction race got (a test proving the property, not just the
// feature working). See compareAgainstSecondReciter's header comment in
// recitationService.js for why this is true by construction, and this test
// for proof it actually holds at runtime.
describe("multi-reciter comparison: peak reference-buffer memory", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("never holds more than one reference buffer at once across a 2-reciter comparison", async () => {
    vi.spyOn(audioAnalysis, "fetchArrayBuffer").mockResolvedValue(new ArrayBuffer(8));
    // Content doesn't matter for this test (it asserts buffer bookkeeping,
    // not scoring accuracy) -- a real decodable-shaped signal just needs to
    // let compareSamples run to completion without throwing.
    vi.spyOn(audioAnalysis, "decodeToMonoSamples").mockResolvedValue(makeSineTone(1));

    let held = 0;
    let peakHeld = 0;
    const trackSpy = vi.spyOn(memoryLedger, "trackBuffer").mockImplementation((name) => {
      if (name === "reference-samples") {
        held++;
        peakHeld = Math.max(peakHeld, held);
      }
    });
    const releaseSpy = vi.spyOn(memoryLedger, "releaseBuffer").mockImplementation((name) => {
      if (name === "reference-samples") held--;
    });

    const userSamples = makeSineTone(1, 225); // close but not identical to the "reference" tone

    // Reciter 1 -- the primary comparison, same call every existing
    // single-reciter recording already makes.
    await analyzeSingleAyahRecitation({
      userSamples,
      reciterFolder: "Husary_128kbps",
      surahNumber: 1,
      ayahNumber: 1,
    });

    // Reciter 2 (Phase 3) -- called the same way RecordingModal.jsx calls
    // it: strictly AFTER reciter 1's own comparison has fully resolved.
    await compareAgainstSecondReciter({
      userSamples,
      reciterFolder: "Alafasy_128kbps",
      surahNumber: 1,
      ayahNumber: 1,
    });

    // The actual property this feature's memory safety depends on: proven
    // via the ledger's own calls, not read off the source and trusted.
    expect(peakHeld).toBe(1);
    expect(held).toBe(0); // both released by the end -- nothing leaked

    // And each reciter really was tracked+released once each (not silently
    // skipped) -- peakHeld===1 would be trivially true if nothing ran.
    expect(trackSpy.mock.calls.filter(([name]) => name === "reference-samples")).toHaveLength(2);
    expect(releaseSpy.mock.calls.filter(([name]) => name === "reference-samples")).toHaveLength(2);
  });

  it("control: a single-reciter comparison has the identical peak (1) -- adding a second reciter doesn't change the base case", async () => {
    vi.spyOn(audioAnalysis, "fetchArrayBuffer").mockResolvedValue(new ArrayBuffer(8));
    vi.spyOn(audioAnalysis, "decodeToMonoSamples").mockResolvedValue(makeSineTone(1));

    let held = 0;
    let peakHeld = 0;
    vi.spyOn(memoryLedger, "trackBuffer").mockImplementation((name) => {
      if (name === "reference-samples") { held++; peakHeld = Math.max(peakHeld, held); }
    });
    vi.spyOn(memoryLedger, "releaseBuffer").mockImplementation((name) => {
      if (name === "reference-samples") held--;
    });

    await analyzeSingleAyahRecitation({
      userSamples: makeSineTone(1, 225),
      reciterFolder: "Husary_128kbps",
      surahNumber: 1,
      ayahNumber: 1,
    });

    expect(peakHeld).toBe(1);
    expect(held).toBe(0);
  });
});

// Phase 6 (deeper Tajweed analytics): style_match_score previously had zero
// persistence at all -- computed live per-result (RecordingModal.jsx's
// MetricBadge) and thrown away. These pin that it now actually reaches
// RecitationLog, the same real field Progress.jsx's Style Match trend reads.
describe("style_match_score persistence", () => {
  beforeEach(() => localStorage.clear());

  it("persistRecitationResult stores null when Tajweed hasn't run yet (the common single-ayah timing)", async () => {
    const { logIds } = await persistRecitationResult({
      surahNumber: 1,
      surahName: "Al-Fatihah",
      ayahs: [{ number: 1, arabic: "test" }],
      reciterName: "Alafasy",
      result: { score: 80, feedback: ["ok"] },
      durationSeconds: 5,
      tajweedResult: null,
    });
    const [log] = await RecitationLog.filter({ id: logIds[0] });
    expect(log.style_match_score).toBeNull();
  });

  it("persistRecitationResult stores the real score when tajweedResult is already available", async () => {
    const { logIds } = await persistRecitationResult({
      surahNumber: 1,
      surahName: "Al-Fatihah",
      ayahs: [{ number: 1, arabic: "test" }],
      reciterName: "Alafasy",
      result: { score: 80, feedback: ["ok"] },
      durationSeconds: 5,
      tajweedResult: { ruleChecks: [], styleMatchScore: 73 },
    });
    const [log] = await RecitationLog.filter({ id: logIds[0] });
    expect(log.style_match_score).toBe(73);
  });

  it("attachTajweedToLogs backfills the real score once Tajweed completes in the background", async () => {
    const { logIds } = await persistRecitationResult({
      surahNumber: 1,
      surahName: "Al-Fatihah",
      ayahs: [{ number: 1, arabic: "test" }],
      reciterName: "Alafasy",
      result: { score: 80, feedback: ["ok"] },
      durationSeconds: 5,
      tajweedResult: null,
    });

    await attachTajweedToLogs({
      logIds,
      feedback: ["ok"],
      tajweedResult: { ruleChecks: [], styleMatchScore: 91 },
    });

    const [log] = await RecitationLog.filter({ id: logIds[0] });
    expect(log.style_match_score).toBe(91);
  });

  it("attachTajweedToLogs stores null when this reciter has no style profile (styleMatchScore itself is null)", async () => {
    const { logIds } = await persistRecitationResult({
      surahNumber: 1,
      surahName: "Al-Fatihah",
      ayahs: [{ number: 1, arabic: "test" }],
      reciterName: "Husary",
      result: { score: 80, feedback: ["ok"] },
      durationSeconds: 5,
      tajweedResult: null,
    });

    await attachTajweedToLogs({
      logIds,
      feedback: ["ok"],
      tajweedResult: { ruleChecks: [], styleMatchScore: null },
    });

    const [log] = await RecitationLog.filter({ id: logIds[0] });
    expect(log.style_match_score).toBeNull();
  });
});
