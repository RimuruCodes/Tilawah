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

const { HOME_CARDS, getHomeLayout, setHomeLayout, resetHomeLayout, moveCard, toggleCardVisibility } =
  await import("@/lib/homeLayout");

beforeEach(() => localStorage.clear());

describe("homeLayout", () => {
  it("defaults to every known card, visible, in HOME_CARDS order", () => {
    const layout = getHomeLayout();
    expect(layout.map((c) => c.id)).toEqual(HOME_CARDS.map((c) => c.id));
    expect(layout.every((c) => c.visible)).toBe(true);
  });

  it("round-trips an explicit layout", () => {
    const custom = [
      { id: "weekly", visible: true },
      { id: "continue", visible: false },
      { id: "streak", visible: true },
      { id: "plan", visible: true },
    ];
    setHomeLayout(custom);
    expect(getHomeLayout()).toEqual(custom);
  });

  it("drops unknown stale ids and appends missing known ids as visible", () => {
    localStorage.setItem(
      "qc_home_layout",
      JSON.stringify([
        { id: "streak", visible: false },
        { id: "some_removed_card", visible: true },
      ])
    );
    const layout = getHomeLayout();
    expect(layout.find((c) => c.id === "some_removed_card")).toBeUndefined();
    expect(layout.find((c) => c.id === "streak")).toEqual({ id: "streak", visible: false });
    // Every other known card got appended, defaulting to visible.
    for (const card of HOME_CARDS) {
      if (card.id === "streak") continue;
      expect(layout.find((c) => c.id === card.id)).toEqual({ id: card.id, visible: true });
    }
  });

  it("ignores garbage stored JSON and falls back to default", () => {
    localStorage.setItem("qc_home_layout", "{not json");
    expect(getHomeLayout().map((c) => c.id)).toEqual(HOME_CARDS.map((c) => c.id));
  });

  it("resetHomeLayout clears back to default", () => {
    setHomeLayout([{ id: "streak", visible: false }]);
    resetHomeLayout();
    expect(getHomeLayout().every((c) => c.visible)).toBe(true);
  });

  describe("moveCard", () => {
    it("swaps with the previous/next entry", () => {
      const layout = getHomeLayout(); // continue, streak, plan, weekly
      const movedDown = moveCard(layout, "continue", 1);
      expect(movedDown.map((c) => c.id)).toEqual(["streak", "continue", "plan", "weekly"]);
      const movedUp = moveCard(movedDown, "continue", -1);
      expect(movedUp.map((c) => c.id)).toEqual(["continue", "streak", "plan", "weekly"]);
    });

    it("is a no-op past either end", () => {
      const layout = getHomeLayout();
      expect(moveCard(layout, "continue", -1).map((c) => c.id)).toEqual(layout.map((c) => c.id));
      expect(moveCard(layout, "weekly", 1).map((c) => c.id)).toEqual(layout.map((c) => c.id));
    });
  });

  it("toggleCardVisibility flips only the targeted card", () => {
    const layout = getHomeLayout();
    const toggled = toggleCardVisibility(layout, "plan");
    expect(toggled.find((c) => c.id === "plan").visible).toBe(false);
    expect(toggled.find((c) => c.id === "streak").visible).toBe(true);
  });
});
