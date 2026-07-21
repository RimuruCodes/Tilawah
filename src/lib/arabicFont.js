// Adjustable typeface for the Arabic script, following the same pattern as
// arabicTextSize.js. Persisted to localStorage; applied globally via the
// --font-arabic CSS custom property (see src/index.css's .font-arabic class
// and the inline `fontFamily: 'var(--font-arabic)'` usages) so every reader,
// recording, and results surface updates together from one setting.
const KEY = "qc_arabic_font";

export const ARABIC_FONTS = [
  { id: "scheherazade", label: "Scheherazade", stack: "'Scheherazade New', 'Amiri', serif" },
  { id: "amiri", label: "Amiri", stack: "'Amiri', 'Scheherazade New', serif" },
];

const DEFAULT_FONT = "scheherazade";

export function getArabicFont() {
  const stored = localStorage.getItem(KEY);
  return ARABIC_FONTS.some((f) => f.id === stored) ? stored : DEFAULT_FONT;
}

export function getArabicFontStack(id = getArabicFont()) {
  return (ARABIC_FONTS.find((f) => f.id === id) || ARABIC_FONTS[0]).stack;
}

// Persists the choice and immediately updates the CSS variable every
// consumer reads from, so the change applies app-wide without a reload.
export function setArabicFont(id) {
  if (!ARABIC_FONTS.some((f) => f.id === id)) return;
  localStorage.setItem(KEY, id);
  applyArabicFont(id);
}

export function applyArabicFont(id = getArabicFont()) {
  document.documentElement.style.setProperty("--font-arabic", getArabicFontStack(id));
}
