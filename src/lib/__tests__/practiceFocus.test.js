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

const { PRACTICE_FOCUS_RULES, getDefaultPracticeFocusRule, setDefaultPracticeFocusRule } =
  await import("@/lib/practiceFocus");

beforeEach(() => localStorage.clear());

describe("practiceFocus", () => {
  it("defaults to null (All ayahs) when nothing is stored", () => {
    expect(getDefaultPracticeFocusRule()).toBeNull();
  });

  it("round-trips a valid rule id", () => {
    setDefaultPracticeFocusRule("madd");
    expect(getDefaultPracticeFocusRule()).toBe("madd");
  });

  it("ignores an unknown rule id, leaving the default at All ayahs", () => {
    setDefaultPracticeFocusRule("not_a_real_rule");
    expect(getDefaultPracticeFocusRule()).toBeNull();
  });

  it("clears back to All ayahs when set with a falsy value", () => {
    setDefaultPracticeFocusRule("ikhfa");
    expect(getDefaultPracticeFocusRule()).toBe("ikhfa");
    setDefaultPracticeFocusRule(null);
    expect(getDefaultPracticeFocusRule()).toBeNull();
  });

  it("PRACTICE_FOCUS_RULES has a unique id per entry with a non-empty label", () => {
    const ids = PRACTICE_FOCUS_RULES.map((r) => r.id);
    expect(new Set(ids).size).toBe(ids.length);
    PRACTICE_FOCUS_RULES.forEach((r) => expect(r.label.length).toBeGreaterThan(0));
  });
});
