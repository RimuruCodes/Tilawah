import { describe, it, expect } from "vitest";
import { buildLetterTimings } from "@/lib/letterTiming";

describe("buildLetterTimings", () => {
  it("evenly divides a word's timing window across its base letters", () => {
    // "بِسْمِ": 3 base letters (ب س م) at raw positions 0, 2, 4.
    const wordTimings = [{ wordIndex: 0, startSec: 1, endSec: 4, confidence: 1 }];
    const letters = buildLetterTimings(wordTimings, "بِسْمِ");
    expect(letters).toEqual([
      { wordIndex: 0, charIndex: 0, startSec: 1, endSec: 2, confidence: 1 },
      { wordIndex: 0, charIndex: 2, startSec: 2, endSec: 3, confidence: 1 },
      { wordIndex: 0, charIndex: 4, startSec: 3, endSec: 4, confidence: 1 },
    ]);
  });

  it("carries the parent word's confidence through unchanged, not a discounted value", () => {
    const wordTimings = [{ wordIndex: 0, startSec: 0, endSec: 1, confidence: 0.42 }];
    const letters = buildLetterTimings(wordTimings, "قل");
    expect(letters.every((l) => l.confidence === 0.42)).toBe(true);
  });

  it("handles multiple words, keeping each word's letters within its own window", () => {
    const wordTimings = [
      { wordIndex: 0, startSec: 0, endSec: 1, confidence: 1 },
      { wordIndex: 1, startSec: 2, endSec: 4, confidence: 1 },
    ];
    const letters = buildLetterTimings(wordTimings, "قل هو");
    expect(letters.filter((l) => l.wordIndex === 0).map((l) => l.startSec)).toEqual([0, 0.5]);
    expect(letters.filter((l) => l.wordIndex === 1).map((l) => l.startSec)).toEqual([2, 3]);
  });

  it("returns null when there are no word timings at all", () => {
    expect(buildLetterTimings([], "قل")).toBeNull();
    expect(buildLetterTimings(null, "قل")).toBeNull();
  });

  it("returns null when the ayah text is missing", () => {
    const wordTimings = [{ wordIndex: 0, startSec: 0, endSec: 1, confidence: 1 }];
    expect(buildLetterTimings(wordTimings, "")).toBeNull();
    expect(buildLetterTimings(wordTimings, null)).toBeNull();
  });

  it("skips a word entry whose wordIndex is out of range for the given text", () => {
    const wordTimings = [{ wordIndex: 5, startSec: 0, endSec: 1, confidence: 1 }];
    expect(buildLetterTimings(wordTimings, "قل")).toBeNull();
  });

  it("skips a non-positive-width word window rather than dividing by zero", () => {
    const wordTimings = [{ wordIndex: 0, startSec: 1, endSec: 1, confidence: 1 }];
    expect(buildLetterTimings(wordTimings, "قل")).toBeNull();
  });

  it("the last letter's endSec exactly matches the word's own endSec (no rounding drift)", () => {
    const wordTimings = [{ wordIndex: 0, startSec: 0, endSec: 0.1, confidence: 1 }];
    const letters = buildLetterTimings(wordTimings, "قلی"); // 3 base letters over a tiny window
    expect(letters[letters.length - 1].endSec).toBe(0.1);
  });
});
