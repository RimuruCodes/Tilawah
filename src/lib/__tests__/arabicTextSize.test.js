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

const { getArabicTextSize, setArabicTextSize, getArabicTextScale, defaultArabicTextSize } =
  await import("@/lib/arabicTextSize");

beforeEach(() => localStorage.clear());

describe("arabicTextSize", () => {
  it("defaults are seeded from comfort level (less comfort -> larger)", () => {
    expect(defaultArabicTextSize("beginner")).toBe("large");
    expect(defaultArabicTextSize("comfortable")).toBe("medium");
    expect(defaultArabicTextSize("fluent")).toBe("small");
  });

  it("falls back to the comfort-seeded default when nothing is stored", () => {
    localStorage.setItem("qc_arabic_comfort", "beginner");
    expect(getArabicTextSize()).toBe("large");
  });

  it("round-trips an explicit choice and ignores junk", () => {
    setArabicTextSize("small");
    expect(getArabicTextSize()).toBe("small");
    setArabicTextSize("gigantic"); // invalid — ignored
    expect(getArabicTextSize()).toBe("small");
  });

  it("maps sizes to sensible scale multipliers", () => {
    expect(getArabicTextScale("small")).toBeLessThan(1);
    expect(getArabicTextScale("medium")).toBe(1);
    expect(getArabicTextScale("large")).toBeGreaterThan(1);
  });
});
