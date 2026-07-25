import { describe, it, expect } from "vitest";
import { QUA_SUPPORTED_RECITER_FOLDERS, isQuaGroundTruthAvailable, getQuaWordWindowSec } from "@/lib/quaReferenceData";

describe("QUA_SUPPORTED_RECITER_FOLDERS", () => {
  it("is scoped to exactly Husary and Minshawi — Abdul Basit and Alafasy are deliberately excluded pending re-validation", () => {
    expect(QUA_SUPPORTED_RECITER_FOLDERS).toEqual(new Set(["Husary_128kbps", "Minshawy_Murattal_128kbps"]));
  });
});

describe("isQuaGroundTruthAvailable", () => {
  it("is true for a validated (reciter, ayah) pair", () => {
    expect(isQuaGroundTruthAvailable("Husary_128kbps", 1, 1)).toBe(true);
    expect(isQuaGroundTruthAvailable("Minshawy_Murattal_128kbps", 112, 1)).toBe(true);
  });

  it("is false for an ayah that was never part of the validated sample, even for a supported reciter", () => {
    expect(isQuaGroundTruthAvailable("Husary_128kbps", 2, 1)).toBe(false); // only 2:255 was sampled, not 2:1
  });

  it("is false for Abdul Basit and Alafasy on every ayah, including ones Husary/Minshawi have ground truth for", () => {
    expect(isQuaGroundTruthAvailable("Abdul_Basit_Murattal_192kbps", 1, 1)).toBe(false);
    expect(isQuaGroundTruthAvailable("Alafasy_128kbps", 1, 1)).toBe(false);
  });
});

describe("getQuaWordWindowSec", () => {
  it("computes the validated window for Husary 1:1 word 1 (بِسْمِ) from the real QUA data", () => {
    // Raw QUA word entry: [1, 6464, 6934] ms, absolute within the surah file.
    // This ayah's own QUA start: 6114ms. Validated per-ayah offset: +292.7ms.
    // startMs = 6464 - 6114 - 292.7 = 57.3; endMs = 6934 - 6114 - 292.7 = 527.3
    const win = getQuaWordWindowSec("Husary_128kbps", 1, 1, 0); // wordIndex is 0-based
    expect(win).not.toBeNull();
    expect(win.startSec).toBeCloseTo(0.0573, 3);
    expect(win.endSec).toBeCloseTo(0.5273, 3);
  });

  it("computes a different, independently-validated per-ayah offset for a different ayah (proves it's per-ayah, not one constant)", () => {
    // 78:1 word 1: [1, 8690, 10230] ms; verseStartMs 8300; offsetMs -97.6.
    // startMs = 8690 - 8300 - (-97.6) = 487.6; endMs = 10230 - 8300 - (-97.6) = 2027.6
    const win = getQuaWordWindowSec("Husary_128kbps", 78, 1, 0);
    expect(win.startSec).toBeCloseTo(0.4876, 3);
    expect(win.endSec).toBeCloseTo(2.0276, 3);
  });

  it("returns null for a word index beyond the ayah's word count", () => {
    expect(getQuaWordWindowSec("Husary_128kbps", 1, 1, 10)).toBeNull();
  });

  it("returns null for an unvalidated reciter regardless of ayah/word", () => {
    expect(getQuaWordWindowSec("Abdul_Basit_Murattal_192kbps", 1, 1, 0)).toBeNull();
    expect(getQuaWordWindowSec("Alafasy_128kbps", 1, 1, 0)).toBeNull();
  });

  it("returns null for an ayah that wasn't part of the validated sample", () => {
    expect(getQuaWordWindowSec("Husary_128kbps", 3, 5, 0)).toBeNull();
  });
});
