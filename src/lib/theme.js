// "Paper & Ink" theme preference — Light/Dark/System, following the exact
// same persisted-preference pattern as arabicTextSize.js/playbackSpeed.js.
// Kept separate from React (see ThemeContext.jsx for the reactive wrapper)
// so the preference itself is plain, synchronous, and unit-testable.
//
// Known scope boundary (deliberate, not an oversight): the migration to
// ink-* tokens covers the authenticated app shell (Home, SurahReader,
// QuranIndex, Hadith, Progress, Settings, the recording/analysis flow, and
// every shared modal/primitive they use) plus the Tutorial modal. It does
// NOT cover the pre-auth pages (Landing, Login, Register, ForgotPassword,
// ResetPassword), the legal pages (Privacy, Terms), or Donate/About/
// Contact/PageNotFound — those still render the original dark-only
// hardcoded classes regardless of `resolvedTheme`, on purpose, and were
// never in the migration's scope. If one of those pages is touched later,
// check whether it should be brought onto ink-* tokens rather than
// assuming its current dark styling is intentional for THAT page too.
const KEY = "qc_theme_preference";

export const THEME_PREFERENCES = ["light", "dark", "system"];
const DEFAULT_PREFERENCE = "system";

export function getThemePreference() {
  const stored = localStorage.getItem(KEY);
  return THEME_PREFERENCES.includes(stored) ? stored : DEFAULT_PREFERENCE;
}

export function setThemePreference(preference) {
  if (THEME_PREFERENCES.includes(preference)) {
    localStorage.setItem(KEY, preference);
  }
}

// The OS-level preference, read directly — never stored, always live.
// Defaults to "dark" (this app's actual current experience) on a browser
// with no matchMedia support at all, rather than assuming light.
export function getSystemTheme() {
  if (typeof window === "undefined" || !window.matchMedia) return "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

// Turns a preference ("light" | "dark" | "system") into the ACTUAL theme to
// render ("light" | "dark") — the one distinction every consumer actually
// cares about.
export function resolveTheme(preference = getThemePreference()) {
  return preference === "system" ? getSystemTheme() : preference;
}

// PWA browser-chrome color (the <meta name="theme-color"> tag ThemeContext
// keeps in sync -- see its DOM effect) per resolved theme. Dark keeps the
// existing, unchanged value app users already see; light uses the Paper &
// Ink palette's own bg-primary (#FAF6EC) so the status/address bar reads as
// part of the page rather than a mismatched dark strip above a cream app.
// Deliberately NOT the same as either theme's accent-primary -- a status
// bar is chrome, not content, and this mirrors the dark value's own
// existing choice of a muted, unobtrusive tone rather than the bright
// in-app accent.
export const PWA_THEME_COLOR = {
  dark: "#064e3b",
  light: "#FAF6EC",
};
