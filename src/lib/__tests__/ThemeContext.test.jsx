import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { ThemeProvider, useTheme } from "@/lib/ThemeContext";

// A controllable fake MediaQueryList so tests can simulate a live OS-level
// light/dark change while the app is following "system" — the one behavior
// that can't be tested through localStorage alone.
function makeFakeMediaQueryList(initialMatches) {
  let matches = initialMatches;
  const listeners = new Set();
  return {
    get matches() {
      return matches;
    },
    addEventListener: (event, cb) => listeners.add(cb),
    removeEventListener: (event, cb) => listeners.delete(cb),
    // Test-only: flips the simulated OS preference and notifies listeners,
    // the same way a real 'change' event would.
    _setMatches(next) {
      matches = next;
      listeners.forEach((cb) => cb());
    },
  };
}

function Probe() {
  const { themePreference, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="preference">{themePreference}</span>
      <span data-testid="resolved">{resolvedTheme}</span>
      <button onClick={() => setTheme("light")}>Light</button>
      <button onClick={() => setTheme("dark")}>Dark</button>
      <button onClick={() => setTheme("system")}>System</button>
    </div>
  );
}

let fakeMql;
let themeColorMeta;

beforeEach(() => {
  localStorage.clear();
  fakeMql = makeFakeMediaQueryList(true); // OS defaults to dark for these tests
  vi.stubGlobal("matchMedia", vi.fn(() => fakeMql));
  // Mirrors index.html's real <meta name="theme-color">, which the effect
  // under test updates in place — jsdom starts each test with an empty
  // <head>, so this stands in for it.
  themeColorMeta = document.createElement("meta");
  themeColorMeta.setAttribute("name", "theme-color");
  themeColorMeta.setAttribute("content", "#064e3b");
  document.head.appendChild(themeColorMeta);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  themeColorMeta.remove();
});

describe("ThemeProvider / useTheme", () => {
  it("defaults to system, resolving to the real OS preference, and sets data-theme on <html>", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("preference").textContent).toBe("system");
    expect(screen.getByTestId("resolved").textContent).toBe("dark");
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
  });

  it("setTheme persists the explicit choice and updates data-theme immediately", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Light"));
    expect(screen.getByTestId("preference").textContent).toBe("light");
    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    expect(localStorage.getItem("qc_theme_preference")).toBe("light");
  });

  it("an explicit choice overrides the OS preference (OS says dark, user picked light)", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Light"));
    expect(screen.getByTestId("resolved").textContent).toBe("light");
  });

  it("while following 'system', a live OS-level change updates the resolved theme without a reload", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    expect(screen.getByTestId("resolved").textContent).toBe("dark");

    act(() => {
      fakeMql._setMatches(false); // OS switches to light
    });

    expect(screen.getByTestId("resolved").textContent).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("does NOT react to OS changes once an explicit choice has been made", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Dark")); // explicit, not "system"

    act(() => {
      fakeMql._setMatches(false); // OS switches to light -- should be ignored
    });

    expect(screen.getByTestId("resolved").textContent).toBe("dark");
  });

  it("also toggles the .dark class next-themes used to manage, so the original shadcn --background/--foreground variables (body's own bg-background/text-foreground) don't silently regress", () => {
    document.documentElement.classList.remove("dark");
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    fireEvent.click(screen.getByText("Dark"));
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    fireEvent.click(screen.getByText("Light"));
    expect(document.documentElement.classList.contains("dark")).toBe(false);
  });

  it("keeps the <meta name=\"theme-color\"> tag in sync with the resolved theme (Phase 6: PWA chrome color)", () => {
    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>
    );
    // Starts dark (OS default in this suite) -> dark's theme-color.
    expect(themeColorMeta.getAttribute("content")).toBe("#064e3b");

    fireEvent.click(screen.getByText("Light"));
    expect(themeColorMeta.getAttribute("content")).toBe("#FAF6EC");

    fireEvent.click(screen.getByText("Dark"));
    expect(themeColorMeta.getAttribute("content")).toBe("#064e3b");
  });

  it("useTheme throws outside a ThemeProvider, same as this app's other required-context hooks", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => render(<Probe />)).toThrow(/useTheme must be used within a ThemeProvider/);
    spy.mockRestore();
  });
});
