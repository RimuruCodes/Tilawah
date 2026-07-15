// @vitest-environment node
// Node environment (not jsdom) so crypto.subtle is the real WebCrypto
// implementation; localStorage is stubbed below.
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

const { register, login, changePassword, getCurrentUser, logout, hashEmail } = await import(
  "@/lib/localAuth"
);

const USERS_KEY = "qc_users";

function readRawUsers() {
  return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
}

// Mirrors the legacy (pre-PBKDF2) hashing scheme so we can seed an
// old-style account and prove login still works + upgrades it.
async function legacyHash(password, saltHex) {
  const data = new TextEncoder().encode(`${saltHex}:${password}`);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(digest))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

beforeEach(() => {
  localStorage.clear();
});

describe("localAuth", () => {
  it("stores only a one-way email hash — never the plaintext address", async () => {
    const user = await register({ email: "A@Example.com", password: "secret123", display_name: "Ali" });
    // Nothing readable leaks to the app layer or to storage.
    expect(user.email).toBeUndefined();
    expect(user.salt).toBeUndefined();
    expect(user.passwordHash).toBeUndefined();

    const [raw] = readRawUsers();
    expect(raw.email).toBeUndefined();
    expect(raw.emailHash).toBe(await hashEmail("a@example.com")); // normalized (trim+lowercase)
    expect(raw.emailHash).toHaveLength(64);
    expect(raw.kdf).toBe("pbkdf2");
    expect(raw.kdfIterations).toBeGreaterThanOrEqual(600_000);
    expect(raw.passwordHash).toHaveLength(64);
    // The stored JSON contains no readable copy of the address anywhere.
    expect(localStorage.getItem(USERS_KEY)).not.toContain("example.com");
  });

  it("uses the chosen display name, defaulting to 'Reciter' (never the email)", async () => {
    const named = await register({ email: "named@example.com", password: "secret123", display_name: "  Fatima  " });
    expect(named.full_name).toBe("Fatima");
    logout();

    const blank = await register({ email: "blank@example.com", password: "secret123", display_name: "   " });
    expect(blank.full_name).toBe("Reciter");
    logout();

    const missing = await register({ email: "missing@example.com", password: "secret123" });
    expect(missing.full_name).toBe("Reciter");
  });

  it("rejects a duplicate email by hash", async () => {
    await register({ email: "dupe@example.com", password: "secret123" });
    logout();
    await expect(register({ email: "DUPE@example.com", password: "other123" })).rejects.toThrow(
      /already exists/
    );
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await register({ email: "user@example.com", password: "secret123", display_name: "Sam" });
    logout();

    await expect(login("user@example.com", "wrong")).rejects.toThrow(
      "Invalid email or password"
    );
    const user = await login("USER@example.com ", "secret123"); // normalization still matches
    expect(user.full_name).toBe("Sam");
    expect(user.email).toBeUndefined();
    expect(getCurrentUser()?.full_name).toBe("Sam");
    expect(getCurrentUser()?.emailHash).toBe(await hashEmail("user@example.com"));
  });

  it("migrates a legacy plaintext-email account on login (hashes email, drops plaintext, scrubs email-derived name)", async () => {
    const salt = "ab".repeat(16);
    localStorage.setItem(
      USERS_KEY,
      JSON.stringify([
        {
          id: "legacy1",
          email: "old@example.com",
          full_name: "old", // an old build defaulted the name to the email's local-part
          role: "user",
          salt,
          passwordHash: await legacyHash("oldpass", salt),
          created_date: "2024-01-01T00:00:00.000Z",
        },
      ])
    );

    await expect(login("old@example.com", "wrong")).rejects.toThrow();
    const user = await login("old@example.com", "oldpass");
    expect(user.id).toBe("legacy1");

    const [raw] = readRawUsers();
    expect(raw.kdf).toBe("pbkdf2"); // password scheme upgraded
    expect(raw.salt).not.toBe(salt);
    expect(raw.email).toBeUndefined(); // plaintext dropped
    expect(raw.emailHash).toBe(await hashEmail("old@example.com"));
    expect(raw.full_name).toBe("Reciter"); // email-derived name scrubbed
    expect(localStorage.getItem(USERS_KEY)).not.toContain("old@example.com");

    // And the migrated account keeps working on subsequent logins.
    logout();
    await expect(login("old@example.com", "oldpass")).resolves.toBeTruthy();
  });

  it("changePassword rehashes with PBKDF2 and invalidates the old password", async () => {
    const user = await register({ email: "user@example.com", password: "first" });
    await changePassword(user.id, "second");
    logout();

    await expect(login("user@example.com", "first")).rejects.toThrow();
    await expect(login("user@example.com", "second")).resolves.toBeTruthy();
  });
});
