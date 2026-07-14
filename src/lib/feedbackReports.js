// Pure logic for the "This result seems off" widget on the recitation
// result screens. Deliberately minimal and text-only: a report records
// which verdict the person disagreed with and an optional note — never
// audio, never sent anywhere (localStorage only, exportable from Settings
// so the developer can review reports someone chooses to share).

const VERDICT_LABELS = {
  pass: "marked good",
  warn: "flagged for improvement",
  unchecked: "couldn't be checked",
};

// The list of things a person can flag on a result screen: the overall
// score, plus each individual Tajweed rule check that was shown.
export function buildFlagOptions({ score, ruleChecks = [] }) {
  const options = [
    { id: "overall", kind: "overall", label: `The overall score (${score})` },
  ];
  ruleChecks.forEach((check, i) => {
    options.push({
      id: `rule-${i}`,
      kind: "rule",
      label: `${check.label} on "${check.word}" — ${VERDICT_LABELS[check.verdict] || check.verdict}`,
      ruleType: check.ruleType,
      word: check.word,
      verdict: check.verdict,
    });
  });
  return options;
}

// Shapes the stored report from a chosen option + note. Context fields are
// what's needed to make the report reviewable later (which ayah(s), what
// the scores were) — no audio, no transcript.
export function buildFeedbackReport({ option, note, surahNumber, surahName, ayahNumbers, score, mode }) {
  return {
    flagged_kind: option.kind,
    flagged_label: option.label,
    rule_type: option.kind === "rule" ? option.ruleType : null,
    rule_word: option.kind === "rule" ? option.word : null,
    rule_verdict: option.kind === "rule" ? option.verdict : null,
    note: (note || "").trim().slice(0, 500),
    surah_number: surahNumber,
    surah_name: surahName,
    ayah_numbers: ayahNumbers,
    score,
    mode, // "single" | "continuous"
  };
}
