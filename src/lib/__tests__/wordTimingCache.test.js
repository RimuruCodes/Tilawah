import { describe, it, expect } from "vitest";
import { getCachedWordTimings, setCachedWordTimings } from "@/lib/wordTimingCache";

// jsdom (this project's test environment) does not implement IndexedDB —
// `typeof indexedDB === "undefined"` here, exactly like a real browser
// with IndexedDB unavailable/blocked. That means every test in this file
// exercises the "IndexedDB unavailable" degrade-gracefully path for real,
// not a simulation of it — which is exactly the guarantee this module
// exists to make. The actual read/write round-trip in a real IndexedDB
// (a real browser) is covered by live verification, not here.
describe("wordTimingCache — degrades gracefully when IndexedDB is unavailable", () => {
  it("getCachedWordTimings resolves to null, never throws", async () => {
    await expect(getCachedWordTimings("Husary_128kbps", 1, 1)).resolves.toBeNull();
  });

  it("setCachedWordTimings resolves to false, never throws", async () => {
    const words = [{ wordIndex: 0, startSec: 0, endSec: 0.5, confidence: 0.8 }];
    await expect(setCachedWordTimings("Husary_128kbps", 1, 1, words)).resolves.toBe(false);
  });

  it("repeated calls stay safe (no leaked open connections/exceptions)", async () => {
    for (let i = 0; i < 5; i++) {
      await expect(getCachedWordTimings("Alafasy_128kbps", 2, i + 1)).resolves.toBeNull();
      await expect(setCachedWordTimings("Alafasy_128kbps", 2, i + 1, [])).resolves.toBe(false);
    }
  });
});
