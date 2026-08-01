import { describe, it, expect, afterEach, vi } from "vitest";
import {
  withTimeout,
  runTajweedAnalysis,
  getLastAsrFailure,
  describeAsrFailureForUser,
  describeAsrFailureForLog,
  analyzeSingleAyahRecitation,
} from "@/lib/recitationService";
import * as audioAnalysis from "@/lib/audioAnalysis";
import * as lifecycleDebug from "@/lib/lifecycleDebug";

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
