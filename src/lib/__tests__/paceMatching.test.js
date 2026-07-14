import { describe, it, expect } from "vitest";
import { folderBitrateKbps, estimateDurationFromBytes, pickClosestPaceReciter } from "@/lib/paceMatching";

describe("folderBitrateKbps", () => {
  it("reads the bitrate out of everyayah folder names", () => {
    expect(folderBitrateKbps("Alafasy_128kbps")).toBe(128);
    expect(folderBitrateKbps("Abdul_Basit_Murattal_192kbps")).toBe(192);
  });

  it("returns null when no bitrate is encoded", () => {
    expect(folderBitrateKbps("SomeReciter")).toBeNull();
    expect(folderBitrateKbps("")).toBeNull();
    expect(folderBitrateKbps(undefined)).toBeNull();
  });
});

describe("estimateDurationFromBytes", () => {
  it("estimates CBR mp3 duration from size and bitrate", () => {
    // 128 kbps = 16000 bytes/sec -> 160000 bytes ≈ 10s
    expect(estimateDurationFromBytes(160000, 128)).toBeCloseTo(10, 5);
  });

  it("returns null for unusable inputs", () => {
    expect(estimateDurationFromBytes(null, 128)).toBeNull();
    expect(estimateDurationFromBytes(0, 128)).toBeNull();
    expect(estimateDurationFromBytes(160000, null)).toBeNull();
    expect(estimateDurationFromBytes(NaN, 128)).toBeNull();
  });
});

describe("pickClosestPaceReciter", () => {
  const candidates = [
    { name: "Slow", durationSec: 12 },
    { name: "Medium", durationSec: 8 },
    { name: "Fast", durationSec: 5 },
  ];

  it("picks the reciter with the closest duration", () => {
    expect(pickClosestPaceReciter(7.5, candidates).name).toBe("Medium");
    expect(pickClosestPaceReciter(4.5, candidates).name).toBe("Fast");
    expect(pickClosestPaceReciter(14, candidates).name).toBe("Slow");
  });

  it("measures closeness as a ratio, not an absolute difference", () => {
    // User at 2s: "Fast" (5s) is 2.5x; nothing is close, but 5s is the
    // smallest ratio. Absolute difference would also pick Fast here, so
    // use a case where they disagree: user 20s vs candidates 10s and 35s.
    // ratio: 10/20 = 0.5x (|log|=0.69), 35/20 = 1.75x (|log|=0.56) -> 35s
    // absolute: |10-20|=10 < |35-20|=15 -> 10s. Ratio must win.
    const picked = pickClosestPaceReciter(20, [
      { name: "Half", durationSec: 10 },
      { name: "LongEnd", durationSec: 35 },
    ]);
    expect(picked.name).toBe("LongEnd");
  });

  it("skips candidates without usable durations and keeps first on ties", () => {
    const picked = pickClosestPaceReciter(8, [
      { name: "Broken", durationSec: null },
      { name: "A", durationSec: 8 },
      { name: "B", durationSec: 8 },
    ]);
    expect(picked.name).toBe("A");
  });

  it("returns null with no usable user duration or candidates", () => {
    expect(pickClosestPaceReciter(null, candidates)).toBeNull();
    expect(pickClosestPaceReciter(0, candidates)).toBeNull();
    expect(pickClosestPaceReciter(8, [])).toBeNull();
    expect(pickClosestPaceReciter(8, [{ name: "X", durationSec: null }])).toBeNull();
  });
});
