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

const {
  getSubscriberOwner,
  setSubscriberOwner,
  clearSubscriberOwner,
  shouldSignOutSubscriber,
} = await import("@/lib/subscriberIdentity");

beforeEach(() => localStorage.clear());

describe("subscriber owner marker", () => {
  it("round-trips and clears", () => {
    expect(getSubscriberOwner()).toBeNull();
    setSubscriberOwner("local-42");
    expect(getSubscriberOwner()).toBe("local-42");
    clearSubscriberOwner();
    expect(getSubscriberOwner()).toBeNull();
  });

  it("ignores empty owner ids (nothing to record)", () => {
    setSubscriberOwner("");
    setSubscriberOwner(null);
    setSubscriberOwner(undefined);
    expect(getSubscriberOwner()).toBeNull();
  });
});

describe("shouldSignOutSubscriber", () => {
  it("keeps a session owned by the current local account", () => {
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: true, ownerLocalId: "A", currentLocalId: "A" })
    ).toBe(false);
  });

  it("signs out a session owned by a DIFFERENT local account (the leak)", () => {
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: true, ownerLocalId: "A", currentLocalId: "B" })
    ).toBe(true);
  });

  it("signs out when logged out locally but a subscriber session lingers", () => {
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: true, ownerLocalId: "A", currentLocalId: null })
    ).toBe(true);
  });

  it("signs out an unattributed session (no recorded owner — not provably yours)", () => {
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: true, ownerLocalId: null, currentLocalId: "A" })
    ).toBe(true);
    // ...even with nobody logged in locally.
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: true, ownerLocalId: null, currentLocalId: null })
    ).toBe(true);
  });

  it("does nothing when there's no subscriber session at all", () => {
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: false, ownerLocalId: "A", currentLocalId: "B" })
    ).toBe(false);
    expect(
      shouldSignOutSubscriber({ hasSubscriberSession: false, ownerLocalId: null, currentLocalId: null })
    ).toBe(false);
  });
});
