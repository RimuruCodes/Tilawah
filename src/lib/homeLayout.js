// Which Home dashboard cards show, and in what order. Follows the same
// persisted-preference pattern as arabicTextSize.js/arabicFont.js/hijri.js's
// Ramadan mode. Scoped to the 4 cards that make sense to reorder/hide
// (streak+stats, continue-reciting, the memorization plan, weekly
// activity) — RamadanCard already self-hides outside Ramadan (see hijri.js)
// and the Ayah/Hadith-of-the-day pair is daily inspiration, not a stat/
// habit card, so neither is part of this preference.
const KEY = "qc_home_layout";

export const HOME_CARDS = [
  { id: "continue", label: "Continue Reciting" },
  { id: "streak", label: "Streak & Stats" },
  { id: "plan", label: "Memorization Plan" },
  { id: "weekly", label: "Weekly Activity" },
];

const DEFAULT_LAYOUT = HOME_CARDS.map((c) => ({ id: c.id, visible: true }));
const KNOWN_IDS = new Set(HOME_CARDS.map((c) => c.id));

// Reconciles stored data against the current known card set: drops ids that
// no longer exist (an older build's card that got removed) and appends any
// new known ids that aren't in the stored order yet (a newer build's card,
// defaulting to visible) — so a future card addition doesn't silently vanish
// for someone with an existing stored layout, and a removed card doesn't
// leave a dangling entry.
function normalize(layout) {
  if (!Array.isArray(layout)) return DEFAULT_LAYOUT;
  const seen = new Set();
  const kept = [];
  for (const entry of layout) {
    if (!entry || !KNOWN_IDS.has(entry.id) || seen.has(entry.id)) continue;
    seen.add(entry.id);
    kept.push({ id: entry.id, visible: entry.visible !== false });
  }
  for (const card of HOME_CARDS) {
    if (!seen.has(card.id)) kept.push({ id: card.id, visible: true });
  }
  return kept;
}

export function getHomeLayout() {
  const raw = localStorage.getItem(KEY);
  if (!raw) return DEFAULT_LAYOUT;
  try {
    return normalize(JSON.parse(raw));
  } catch {
    return DEFAULT_LAYOUT;
  }
}

export function setHomeLayout(layout) {
  localStorage.setItem(KEY, JSON.stringify(normalize(layout)));
}

export function resetHomeLayout() {
  localStorage.removeItem(KEY);
}

// Swaps a card with its neighbor in the given direction; no-op at either
// end. Returns the new layout (does not persist it — callers decide when).
export function moveCard(layout, id, direction) {
  const list = normalize(layout);
  const index = list.findIndex((c) => c.id === id);
  const swapWith = index + direction;
  if (index === -1 || swapWith < 0 || swapWith >= list.length) return list;
  const next = [...list];
  [next[index], next[swapWith]] = [next[swapWith], next[index]];
  return next;
}

export function toggleCardVisibility(layout, id) {
  return normalize(layout).map((c) => (c.id === id ? { ...c, visible: !c.visible } : c));
}
