// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
vi.stubGlobal("localStorage", makeLocalStorageStub());

const { PLAYBACK_SPEEDS, getPlaybackSpeedId, setPlaybackSpeedId, getPlaybackRate } =
  await import("@/lib/playbackSpeed");

beforeEach(() => localStorage.clear());

describe("playbackSpeed", () => {
  it("defaults to 1x when nothing is stored", () => {
    expect(getPlaybackSpeedId()).toBe("1");
    expect(getPlaybackRate()).toBe(1);
  });

  it("round-trips an explicit choice and ignores junk", () => {
    setPlaybackSpeedId("1.25");
    expect(getPlaybackSpeedId()).toBe("1.25");
    expect(getPlaybackRate()).toBe(1.25);
    setPlaybackSpeedId("3x-turbo"); // invalid — ignored
    expect(getPlaybackSpeedId()).toBe("1.25");
  });

  it("every advertised speed maps to a real, distinct playbackRate", () => {
    const rates = PLAYBACK_SPEEDS.map((s) => getPlaybackRate(s.id));
    expect(new Set(rates).size).toBe(PLAYBACK_SPEEDS.length);
    rates.forEach((r) => expect(r).toBeGreaterThan(0));
  });
});
