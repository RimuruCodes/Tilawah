// "How comfortable are you reading Arabic script?" — asked once during
// onboarding, changeable anytime in Settings. Used only to pick friendlier
// DEFAULTS (never to lock features):
//  - beginner:    translation shown by default; the reader's Words panel
//                 (per-word meaning + transliteration) is the suggested aid.
//  - comfortable: translation shown by default.
//  - fluent:      translation hidden by default — just the mushaf text.
// The reader's own toggle always wins after that; this only seeds it.

const KEY = "qc_arabic_comfort";

export const ARABIC_COMFORT_LEVELS = [
  { id: "beginner", label: "Beginner", description: "I'm still learning to read Arabic script" },
  { id: "comfortable", label: "Comfortable", description: "I can read, slowly or with some help" },
  { id: "fluent", label: "Fluent", description: "I read Arabic easily" },
];

export function getArabicComfort() {
  const stored = localStorage.getItem(KEY);
  return ARABIC_COMFORT_LEVELS.some((l) => l.id === stored) ? stored : "comfortable";
}

export function setArabicComfort(level) {
  if (ARABIC_COMFORT_LEVELS.some((l) => l.id === level)) {
    localStorage.setItem(KEY, level);
  }
}

export function defaultShowTranslation(level = getArabicComfort()) {
  return level !== "fluent";
}
