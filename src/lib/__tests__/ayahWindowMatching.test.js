import { describe, it, expect } from "vitest";
import { pickBestAyahCount, pickAyahCountFromTranscript } from "@/lib/ayahWindowMatching";

describe("pickBestAyahCount", () => {
  const gapSec = 0.25;

  it("keeps the tagged count when it already matches the recording duration well", () => {
    const ayahDurationsSec = [3, 4, 3.5, 5, 2, 4, 3, 3];
    // Duration for first 4 ayahs + gaps:
    const expectedDuration = 3 + 4 + 3.5 + 5 + 4 * gapSec;
    const result = pickBestAyahCount({
      ayahDurationsSec,
      gapSec,
      userDurationSec: expectedDuration,
      taggedCount: 4,
    });
    expect(result.resolvedCount).toBe(4);
    expect(result.corrected).toBe(false);
  });

  it("corrects upward when the recording is much longer than the tagged count implies (under-tapped)", () => {
    const ayahDurationsSec = [3, 4, 3.5, 5, 2, 4, 3, 3];
    // Actual duration matches 7 ayahs, but only 4 taps were registered.
    const actualDurationFor7 = ayahDurationsSec.slice(0, 7).reduce((a, b) => a + b + gapSec, 0);
    const result = pickBestAyahCount({
      ayahDurationsSec,
      gapSec,
      userDurationSec: actualDurationFor7,
      taggedCount: 4,
    });
    expect(result.resolvedCount).toBe(7);
    expect(result.corrected).toBe(true);
  });

  it("corrects downward when the recording is much shorter than the tagged count implies (over-tapped)", () => {
    const ayahDurationsSec = [3, 4, 3.5, 5, 2, 4, 3, 3];
    const actualDurationFor2 = ayahDurationsSec.slice(0, 2).reduce((a, b) => a + b + gapSec, 0);
    const result = pickBestAyahCount({
      ayahDurationsSec,
      gapSec,
      userDurationSec: actualDurationFor2,
      taggedCount: 5,
    });
    expect(result.resolvedCount).toBe(2);
    expect(result.corrected).toBe(true);
  });

  it("never resolves beyond the number of ayahs with known durations", () => {
    const ayahDurationsSec = [3, 4, 3.5];
    const result = pickBestAyahCount({
      ayahDurationsSec,
      gapSec,
      userDurationSec: 1000, // absurdly long
      taggedCount: 2,
      searchMargin: 10,
    });
    expect(result.resolvedCount).toBeLessThanOrEqual(3);
  });

  it("never resolves below 1", () => {
    const ayahDurationsSec = [3, 4, 3.5];
    const result = pickBestAyahCount({
      ayahDurationsSec,
      gapSec,
      userDurationSec: 0.01,
      taggedCount: 1,
      searchMargin: 10,
    });
    expect(result.resolvedCount).toBeGreaterThanOrEqual(1);
  });

  it("falls back to the tagged count when no duration data is available", () => {
    const result = pickBestAyahCount({
      ayahDurationsSec: [],
      gapSec,
      userDurationSec: 10,
      taggedCount: 3,
    });
    expect(result.resolvedCount).toBe(3);
    expect(result.corrected).toBe(false);
  });
});

describe("pickAyahCountFromTranscript", () => {
  // Al-Fatiha 1-4 (unvocalized is fine — matching normalizes both sides).
  const ayahTexts = [
    "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ",
    "الْحَمْدُ لِلَّهِ رَبِّ الْعَالَمِينَ",
    "الرَّحْمَٰنِ الرَّحِيمِ",
    "مَالِكِ يَوْمِ الدِّينِ",
  ];

  it("resolves the count the transcript actually covers, even when the taps disagree", () => {
    // Transcript covers exactly ayahs 1-2, but the person tapped through 4.
    const transcriptText = "بسم الله الرحمن الرحيم الحمد لله رب العالمين";
    const result = pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount: 4 });
    expect(result.reliable).toBe(true);
    expect(result.resolvedCount).toBe(2);
    expect(result.corrected).toBe(true);
  });

  it("confirms the tagged count when the transcript matches it", () => {
    const transcriptText = "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم";
    const result = pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount: 3 });
    expect(result.reliable).toBe(true);
    expect(result.resolvedCount).toBe(3);
    expect(result.corrected).toBe(false);
  });

  it("tolerates a missed word without changing the resolved count", () => {
    // Ayah 2 with "رب" missing — still clearly two ayahs, not one or three.
    const transcriptText = "بسم الله الرحمن الرحيم الحمد لله العالمين";
    const result = pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount: 2 });
    expect(result.reliable).toBe(true);
    expect(result.resolvedCount).toBe(2);
  });

  it("declares itself unreliable on a garbage transcript instead of guessing", () => {
    // The kind of output Whisper produces for non-speech audio.
    const transcriptText = "وكتاكي بأنه يجب أن تتحقون من المنظمة";
    const result = pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount: 2 });
    expect(result.reliable).toBe(false);
  });

  it("declares itself unreliable on an empty transcript", () => {
    expect(pickAyahCountFromTranscript({ transcriptText: "", ayahTexts, taggedCount: 2 }).reliable).toBe(false);
    expect(pickAyahCountFromTranscript({ transcriptText: null, ayahTexts, taggedCount: 2 }).reliable).toBe(false);
  });

  it("stays within the search window around the tapped count", () => {
    // Transcript covers ayahs 1-4 but the window only allows up to tagged+1.
    const transcriptText =
      "بسم الله الرحمن الرحيم الحمد لله رب العالمين الرحمن الرحيم مالك يوم الدين";
    const result = pickAyahCountFromTranscript({ transcriptText, ayahTexts, taggedCount: 2, searchMargin: 1 });
    if (result.reliable) {
      expect(result.resolvedCount).toBeLessThanOrEqual(3);
      expect(result.resolvedCount).toBeGreaterThanOrEqual(1);
    }
  });
});
