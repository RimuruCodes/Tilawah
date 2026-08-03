// The real, single source of truth for "Paper & Ink" theming — replaces
// next-themes as the app's actual theme mechanism (see App.jsx). The
// next-themes package's own ThemeProvider is no longer used anywhere:
// src/components/ui/sonner.jsx (a shadcn-scaffold Toaster wrapper that
// called next-themes' useTheme()) was confirmed fully orphaned — never
// imported anywhere in the app, toast() never called anywhere either — and
// removed outright, so there's exactly one theme system now, not two
// nominally-present ones.
import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { getThemePreference, setThemePreference, getSystemTheme, resolveTheme, PWA_THEME_COLOR } from "@/lib/theme";

const ThemeContext = createContext(null);

export function ThemeProvider({ children }) {
  const [themePreference, setPreferenceState] = useState(getThemePreference);
  const [resolvedTheme, setResolvedTheme] = useState(() => resolveTheme(themePreference));

  useEffect(() => {
    setResolvedTheme(resolveTheme(themePreference));
  }, [themePreference]);

  // Only matters while following "system": react live to an OS-level
  // light/dark change without needing a reload.
  useEffect(() => {
    if (themePreference !== "system" || typeof window === "undefined" || !window.matchMedia) return undefined;
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const handleChange = () => setResolvedTheme(getSystemTheme());
    mq.addEventListener("change", handleChange);
    return () => mq.removeEventListener("change", handleChange);
  }, [themePreference]);

  // The DOM effect every --ink-* token in index.css keys off.
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", resolvedTheme);
    // Also keeps toggling the .dark class next-themes used to manage: the
    // ORIGINAL shadcn --background/--foreground variables (body's own
    // bg-background/text-foreground in index.css, plus whatever shadcn/ui
    // primitives read them directly) are keyed off that class, not
    // data-theme. Without this, removing next-themes would silently orphan
    // that -- confirmed directly, not assumed: body's computed background
    // actually turned white once this class stopped being applied, since
    // :root's un-classed stub is the light shadcn scaffold. Keeping both in
    // sync here means nothing downstream of either mechanism regresses.
    document.documentElement.classList.toggle("dark", resolvedTheme === "dark");

    // PWA browser-chrome color (Phase 6): the manifest's own theme_color is
    // a static, install-time-only value with no way to vary by theme (the
    // Web App Manifest spec has no media-query equivalent for it) -- the
    // actual LIVE mechanism is this meta tag, which real browsers do let JS
    // update at runtime. One tag, always kept in sync, rather than static
    // prefers-color-scheme-scoped duplicates: those would only track OS
    // preference, not an explicit in-app Light/Dark choice that overrides it.
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", PWA_THEME_COLOR[resolvedTheme]);
  }, [resolvedTheme]);

  const setTheme = useCallback((preference) => {
    setThemePreference(preference);
    setPreferenceState(preference);
  }, []);

  return (
    <ThemeContext.Provider value={{ themePreference, resolvedTheme, setTheme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return ctx;
}
