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

function stubMatchMedia(prefersDark) {
  vi.stubGlobal("window", {
    matchMedia: (query) => ({
      matches: query === "(prefers-color-scheme: dark)" ? prefersDark : false,
    }),
  });
}

const { THEME_PREFERENCES, getThemePreference, setThemePreference, getSystemTheme, resolveTheme, PWA_THEME_COLOR } =
  await import("@/lib/theme");

beforeEach(() => {
  localStorage.clear();
  stubMatchMedia(true);
});

describe("theme preference", () => {
  it("defaults to system when nothing is stored", () => {
    expect(getThemePreference()).toBe("system");
  });

  it("round-trips an explicit choice and ignores junk", () => {
    setThemePreference("light");
    expect(getThemePreference()).toBe("light");
    setThemePreference("sepia"); // invalid — ignored
    expect(getThemePreference()).toBe("light");
  });

  it("THEME_PREFERENCES lists exactly light/dark/system", () => {
    expect(THEME_PREFERENCES).toEqual(["light", "dark", "system"]);
  });
});

describe("getSystemTheme", () => {
  it("reads the real OS preference via matchMedia", () => {
    stubMatchMedia(true);
    expect(getSystemTheme()).toBe("dark");
    stubMatchMedia(false);
    expect(getSystemTheme()).toBe("light");
  });

  it("defaults to dark (this app's actual current experience) when matchMedia is unavailable", () => {
    vi.stubGlobal("window", {});
    expect(getSystemTheme()).toBe("dark");
  });
});

describe("resolveTheme", () => {
  it("passes explicit light/dark through unchanged, regardless of OS preference", () => {
    stubMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    expect(resolveTheme("dark")).toBe("dark");
  });

  it("resolves 'system' to the real OS preference", () => {
    stubMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    stubMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("defaults to the stored preference when called with no argument", () => {
    setThemePreference("dark");
    stubMatchMedia(false); // OS says light, but an explicit dark choice wins
    expect(resolveTheme()).toBe("dark");
  });
});

describe("PWA_THEME_COLOR", () => {
  it("has exactly a dark and light entry, each a real hex color", () => {
    expect(Object.keys(PWA_THEME_COLOR).sort()).toEqual(["dark", "light"]);
    expect(PWA_THEME_COLOR.dark).toMatch(/^#[0-9a-fA-F]{6}$/);
    expect(PWA_THEME_COLOR.light).toMatch(/^#[0-9a-fA-F]{6}$/);
  });

  it("keeps the existing dark value unchanged (zero regression for current users)", () => {
    expect(PWA_THEME_COLOR.dark).toBe("#064e3b");
  });

  it("uses the light theme's actual bg-primary for the light value", () => {
    expect(PWA_THEME_COLOR.light).toBe("#FAF6EC");
  });
});
