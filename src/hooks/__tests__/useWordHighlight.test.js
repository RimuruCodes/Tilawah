import { describe, it, expect } from "vitest";
import { findActiveWord } from "@/hooks/useWordHighlight";

const words = [
  { wordIndex: 0, startSec: 0.0, endSec: 0.5, confidence: 1 },
  { wordIndex: 1, startSec: 0.5, endSec: 1.2, confidence: 0.9 },
  { wordIndex: 2, startSec: 1.2, endSec: 2.0, confidence: 0.4 },
];

describe("findActiveWord", () => {
  it("returns the word whose window contains the current time", () => {
    expect(findActiveWord(words, 0.1)).toEqual(words[0]);
    expect(findActiveWord(words, 0.7)).toEqual(words[1]);
    expect(findActiveWord(words, 1.9)).toEqual(words[2]);
  });

  it("treats each word's window as half-open [start, end) — the boundary belongs to the NEXT word", () => {
    expect(findActiveWord(words, 0.5)).toEqual(words[1]);
    expect(findActiveWord(words, 1.2)).toEqual(words[2]);
  });

  it("returns null before the first word, at/after the last word's end, and in any gap", () => {
    expect(findActiveWord(words, -0.1)).toBeNull();
    expect(findActiveWord(words, 2.0)).toBeNull();
    expect(findActiveWord(words, 5)).toBeNull();
  });

  it("returns null for missing/empty word lists or a missing current time, never throws", () => {
    expect(findActiveWord(null, 0.5)).toBeNull();
    expect(findActiveWord(undefined, 0.5)).toBeNull();
    expect(findActiveWord([], 0.5)).toBeNull();
    expect(findActiveWord(words, null)).toBeNull();
    expect(findActiveWord(words, undefined)).toBeNull();
  });

  it("current time 0 is a valid, real position — not treated the same as missing", () => {
    expect(findActiveWord(words, 0)).toEqual(words[0]);
  });

  it("works regardless of confidence value — confidence is carried through, not filtered on", () => {
    // The lowest-confidence word (0.4) still gets returned when it's the
    // active one; deciding how to STYLE a low-confidence word is a
    // rendering concern for callers (Step 5), not this lookup's job.
    const active = findActiveWord(words, 1.5);
    expect(active.confidence).toBe(0.4);
  });
});
