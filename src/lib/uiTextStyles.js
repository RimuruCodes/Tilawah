// Documents this app's small-text/corner-radius conventions (2026-07 UI
// polish pass) — established after an audit found the same "small, muted,
// secondary" text role rendered at four different sizes (10/11/12/14px)
// with no rule for which applied where, and an undocumented split for
// which corner-radius tier applied to which element.

// --- Text size tiers ---
// text-[10px]  Micro-labels ONLY: pill/badge/tag text (e.g. "Sahih" badge,
//              Tajweed rule-filter chips). Never body/description text.
// text-xs      THE default "small secondary/caption" size (12px) —
//              descriptions, help text, metadata, footnotes. Default choice.
// text-sm      Slightly more prominent secondary text (14px) — a subtitle
//              directly under a heading, or body text in a compact card.
//
// text-[11px] is retired: found used interchangeably with text-xs for the
// identical role on different screens — fold into text-xs going forward.

export const CAPTION_TEXT = "text-xs text-ink-text-3";
export const MICRO_LABEL_TEXT = "text-[10px]"; // pair with your own color/weight per badge

// --- Corner-radius tiers ---
// rounded-full   Pills, toggle chips, circular icon containers.
// rounded-2xl    Page-level content cards/sections — the largest containers.
// rounded-xl     Everything else interactive: buttons, inputs, small
//                icon-only buttons (see IconButton.jsx), non-pill badges.
//
// rounded-lg is retired: found used sporadically (icon buttons, number
// inputs, one badge) with no rule distinguishing it from rounded-xl — use
// rounded-xl even when nested inside a rounded-2xl parent (already how
// Settings.jsx's own buttons-inside-cards work throughout).
