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

const { register, login, changePassword, getCurrentUser, logout } = await import(
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
  it("registers with PBKDF2 and never exposes hash material", async () => {
    const user = await register({ email: "A@Example.com", password: "secret123" });
    expect(user.email).toBe("a@example.com");
    expect(user.salt).toBeUndefined();
    expect(user.passwordHash).toBeUndefined();
    expect(user.kdf).toBeUndefined();

    const [raw] = readRawUsers();
    expect(raw.kdf).toBe("pbkdf2");
    expect(raw.kdfIterations).toBeGreaterThanOrEqual(600_000);
    expect(raw.passwordHash).toHaveLength(64);
  });

  it("logs in with the right password and rejects the wrong one", async () => {
    await register({ email: "user@example.com", password: "secret123" });
    logout();

    await expect(login("user@example.com", "wrong")).rejects.toThrow(
      "Invalid email or password"
    );
    const user = await login("USER@example.com ", "secret123");
    expect(user.email).toBe("user@example.com");
    expect(getCurrentUser()?.email).toBe("user@example.com");
  });

  it("still accepts legacy SHA-256 accounts and upgrades them on login", async () => {
    const salt = "ab".repeat(16);
    localStorage.setItem(
      USERS_KEY,
      JSON.stringify([
        {
          id: "legacy1",
          email: "old@example.com",
          full_name: "Old Timer",
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
    expect(raw.kdf).toBe("pbkdf2");
    expect(raw.salt).not.toBe(salt);

    // And the upgraded hash keeps working on subsequent logins.
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
