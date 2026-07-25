import { describe, it, expect, afterEach } from "vitest";
import {
  withTimeout,
  runTajweedAnalysis,
  getLastAsrFailure,
  describeAsrFailureForUser,
  describeAsrFailureForLog,
  estimateReferenceWordTiming,
} from "@/lib/recitationService";
import { setAsrEnabled, setAsrBusy } from "@/lib/asrEngine";

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

// estimateReferenceWordTiming is opt-in, casual-listening-time ASR work
// (see AudioPlayer.jsx's follow-along toggle) — these pin its gating
// behavior: the two fast-path declines that must never touch the network
// or the ASR model at all. The full "actually transcribe and cache" happy
// path isn't unit-tested here (no ASR worker in jsdom), same as
// transcribeUserRecording itself — covered by live verification instead.
describe("estimateReferenceWordTiming — gating (never touches the network/model when declined)", () => {
  afterEach(() => {
    setAsrBusy(false);
    localStorage.removeItem("qc_asr_enabled");
  });

  it("declines immediately when ASR is disabled for this device", async () => {
    setAsrEnabled(false);
    const result = await estimateReferenceWordTiming({
      reciterFolder: "Alafasy_128kbps",
      surahNumber: 1,
      ayahNumber: 1,
      ayahArabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    });
    expect(result).toEqual({ words: null, reason: "asr-disabled" });
  });

  it("declines immediately when a user-recording transcription is already in flight", async () => {
    setAsrEnabled(true);
    setAsrBusy(true);
    const result = await estimateReferenceWordTiming({
      reciterFolder: "Alafasy_128kbps",
      surahNumber: 1,
      ayahNumber: 1,
      ayahArabicText: "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    });
    expect(result).toEqual({ words: null, reason: "asr-busy" });
  });
});
