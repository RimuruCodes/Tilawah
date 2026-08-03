// Default Tajweed rule focus, pre-selected when a surah opens instead of
// always starting at "All ayahs" — applies to SurahReader.jsx's existing
// practice-filter feature. Follows the same persisted-preference pattern as
// arabicTextSize.js/playbackSpeed.js.
//
// The single source of truth for which rule ids/labels the practice filter
// offers, both here and in SurahReader.jsx (which adds its own per-rule
// color for the filter chips — presentation-only, kept page-side).
export const PRACTICE_FOCUS_RULES = [
  { id: "qalqalah", label: "Qalqalah" },
  { id: "ghunnah", label: "Ghunnah" },
  { id: "iqlab", label: "Iqlab" },
  { id: "idgham_ghunnah", label: "Idgham" },
  { id: "ikhfa", label: "Ikhfa" },
  { id: "madd", label: "Madd" },
];

const KEY = "qc_practice_focus_rule";
const VALID_IDS = new Set(PRACTICE_FOCUS_RULES.map((r) => r.id));

// null means "All ayahs" — the pre-existing default.
export function getDefaultPracticeFocusRule() {
  const stored = localStorage.getItem(KEY);
  return VALID_IDS.has(stored) ? stored : null;
}

export function setDefaultPracticeFocusRule(id) {
  if (id && VALID_IDS.has(id)) {
    localStorage.setItem(KEY, id);
  } else {
    localStorage.removeItem(KEY);
  }
}
