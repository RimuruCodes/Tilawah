// Adjustable size for the Arabic script in the reader. Persisted like the
// other preferences; the default is seeded from the Arabic-comfort answer
// (a less-confident reader gets larger script) but an explicit choice in
// Settings always wins after that.
import { getArabicComfort } from "@/lib/arabicComfort";

const KEY = "qc_arabic_text_size";

export const ARABIC_TEXT_SIZES = [
  { id: "small", label: "Small", scale: 0.85 },
  { id: "medium", label: "Medium", scale: 1 },
  { id: "large", label: "Large", scale: 1.2 },
];

// Beginners get larger script by default; fluent readers a more compact
// mushaf. Everyone else sits in the middle.
export function defaultArabicTextSize(comfort = getArabicComfort()) {
  if (comfort === "beginner") return "large";
  if (comfort === "fluent") return "small";
  return "medium";
}

export function getArabicTextSize() {
  const stored = localStorage.getItem(KEY);
  return ARABIC_TEXT_SIZES.some((s) => s.id === stored) ? stored : defaultArabicTextSize();
}

export function setArabicTextSize(id) {
  if (ARABIC_TEXT_SIZES.some((s) => s.id === id)) {
    localStorage.setItem(KEY, id);
  }
}

// Multiplier applied to the reader's base Arabic font size.
export function getArabicTextScale(id = getArabicTextSize()) {
  return (ARABIC_TEXT_SIZES.find((s) => s.id === id) || ARABIC_TEXT_SIZES[1]).scale;
}
