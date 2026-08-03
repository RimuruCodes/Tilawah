// Shared honesty-tier display mapping for anything that shows a per-rule
// (or per-metric) stat backed by TAJWEED_RULE_DEFINITIONS' validation
// tiers — originally built for Progress.jsx's Tajweed Trends chart, now
// also used by the deeper analytics breakdown (Phase 6) so the same rule
// is never shown with two different confidence treatments depending on
// which chart happens to render it. One source of truth for the mapping,
// not copy-pasted per view.
import { TAJWEED_RULE_DEFINITIONS } from "@/lib/tajweedAnalysis";

// Which TAJWEED_RULE_DEFINITIONS entry each category's validation tier
// comes from. "madd" covers madd_natural/extended/obligatory, which all
// share one validation tier (MADD_VALIDATION in tajweedAnalysis.js), so any
// one of them is representative.
export const CATEGORY_TO_RULE_KEY = {
  qalqalah: "qalqalah",
  ghunnah: "ghunnah",
  iqlab: "iqlab",
  idgham_ghunnah: "idgham_ghunnah",
  ikhfa: "ikhfa",
  madd: "madd_natural",
};

// Same three-tier line treatment for every status but "validated" (solid,
// unchanged) — dashing and dimming scale with how much evidence backs the
// rule, so an unproven line can't visually pass as being as trustworthy as
// Madd's real one (2026-07, Phase 4 — see tools/qdat-eval/README.md).
export const LINE_STYLE_BY_STATUS = {
  validated: { strokeDasharray: undefined, strokeOpacity: 1 },
  "weak-signal": { strokeDasharray: "6 4", strokeOpacity: 0.85 },
  unvalidated: { strokeDasharray: "2 3", strokeOpacity: 0.65 },
};

// One voice across the app for the same underlying tiers, not fresh copy
// invented per chart.
export function validationTagText(status) {
  if (!status || status === "validated") return null;
  return status === "weak-signal" ? "Weak signal" : "Not yet verified";
}

// Colors read as raw CSS custom properties (see index.css's --rule-* /
// tailwind.config.js's `rule` block) rather than hardcoded hex, so this
// stays in sync with SurahReader's practice-filter chips AND resolves
// correctly per theme — the plain hex values used to be measurably
// different anyway (e.g. ghunnah was violet-400 here vs. purple-400 in the
// chips), a small drift this consolidation also fixes. `madd` reuses
// ink-accent directly, same as the chips, since its dark-mode value
// already IS ink-accent-primary's dark value.
export const TAJWEED_CATEGORIES = [
  { key: "qalqalah", label: "Qalqalah", color: "hsl(var(--rule-qalqalah))" },
  { key: "ghunnah", label: "Ghunnah", color: "hsl(var(--rule-ghunnah))" },
  { key: "iqlab", label: "Iqlab", color: "hsl(var(--rule-iqlab))" },
  { key: "idgham_ghunnah", label: "Idgham", color: "hsl(var(--rule-idgham))" },
  { key: "ikhfa", label: "Ikhfa", color: "hsl(var(--rule-ikhfa))" },
  { key: "madd", label: "Madd", color: "hsl(var(--ink-accent-primary))" },
].map((cat) => {
  const validation = TAJWEED_RULE_DEFINITIONS[CATEGORY_TO_RULE_KEY[cat.key]]?.validation;
  const status = validation?.status || "validated";
  return {
    ...cat,
    status,
    tagText: validationTagText(status),
    validationNote: validation?.note || null,
    ...LINE_STYLE_BY_STATUS[status],
  };
});

// Style Match is NOT one of TAJWEED_RULE_DEFINITIONS' pass/fail rule
// checks — it's a similarity-to-a-reciter's-statistical-profile score, a
// fundamentally different kind of claim, so it doesn't borrow a tier from
// that system. It gets its own honest tag instead, reusing the same
// VISUAL treatment (dashed, dimmed, "Not yet verified") as an unvalidated
// rule, because that's what it honestly is — never claimed to be more
// certain just because it's a subscriber-only metric. See
// computeStyleMatchScore's own doc comment in tajweedAnalysis.js.
export const STYLE_MATCH_DISPLAY = {
  key: "styleMatch",
  label: "Style Match",
  color: "hsl(var(--ink-accent-gold))",
  status: "unvalidated",
  tagText: validationTagText("unvalidated"),
  validationNote:
    "Not yet validated against labeled data — no reciter-style-profile-aware dataset exists to validate against. It measures how closely your pacing/elongation/pitch-contour pattern matched this reciter's own typical delivery, not correctness against expert Tajweed labels.",
  ...LINE_STYLE_BY_STATUS.unvalidated,
};
