import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TAJWEED_RULE_DEFINITIONS } from "@/lib/tajweedAnalysis";
import { validationTagText } from "@/lib/tajweedValidationDisplay";

// Small hoverable tag naming how much real evidence backs this rule's
// verdict — see TAJWEED_RULE_DEFINITIONS' validation field and
// tools/qdat-eval/README.md for the actual numbers behind each tier.
// "validated" gets no tag at all: it's the one tier that should look and
// feel exactly like it does today, with no added noise around the thing
// that's actually trustworthy. Text comes from the shared
// tajweedValidationDisplay module (also used by Progress.jsx's Tajweed
// Trends chart) so the two never drift into saying this two different ways.
function ValidationTag({ validation }) {
  const tagText = validationTagText(validation?.status);
  if (!tagText) return null;
  const isWeak = validation.status === "weak-signal";
  return (
    <span
      className={`text-[9px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 cursor-help border ${
        isWeak
          ? "text-ink-warning/80 bg-ink-warning/10 border-ink-warning/20"
          : "text-ink-text-2 bg-ink-surface-2/30 border-ink-border/40"
      }`}
      title={validation.note}
    >
      {tagText}
    </span>
  );
}

export default function TajweedResultsPanel({ tajweedResult, unavailableMessage }) {
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  if (!tajweedResult) {
    // A specific reason (backgrounded, timed out, nothing recognized…) is
    // actionable and gets real visual weight; only the unexplained case
    // falls back to the quiet generic line.
    if (unavailableMessage) {
      return (
        <div className="bg-ink-warning/10 border border-ink-warning/20 rounded-xl p-3">
          <p className="text-[11px] text-ink-warning/90 leading-relaxed text-center">{unavailableMessage}</p>
        </div>
      );
    }
    return (
      <p className="text-[10px] text-ink-text-3 text-center">
        Word-level Tajweed detail wasn't available for this attempt.
      </p>
    );
  }

  const { wordFeedback, ruleChecks, glossary, recognizedText } = tajweedResult;
  const warnCount = ruleChecks.filter((r) => r.verdict === "warn").length;
  const passCount = ruleChecks.filter((r) => r.verdict === "pass").length;

  return (
    <div className="space-y-3 pt-2 border-t border-ink-border">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-ink-accent uppercase tracking-wide">Speech recognition &amp; Tajweed</h4>
        {ruleChecks.length > 0 && (
          <span className="text-[10px] text-ink-text-3">{passCount} looked good · {warnCount} to review</span>
        )}
      </div>

      {recognizedText && (
        <div className="bg-ink-surface-2/30 rounded-lg p-3 border border-ink-border/40">
          <p className="text-[10px] text-ink-text-3 mb-1">What speech recognition heard:</p>
          <p className="text-sm text-ink-text-2" dir="rtl" lang="ar" style={{ fontFamily: "var(--font-arabic)" }}>{recognizedText}</p>
        </div>
      )}

      {/* Word-correctness feedback */}
      {wordFeedback.length > 0 && (
        <div className="space-y-2">
          {wordFeedback.map((note, i) => (
            <div key={`w-${i}`} className="bg-ink-surface-2/50 rounded-lg p-3 border border-ink-border/60">
              <p className="text-xs text-ink-text-2 leading-relaxed">{note}</p>
            </div>
          ))}
        </div>
      )}

      {/* Rule glossary — collapsed by default, explains what's being checked */}
      {glossary?.length > 0 && (
        <div className="bg-ink-surface-2/30 rounded-lg border border-ink-border/40 overflow-hidden">
          <button
            onClick={() => setGlossaryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <span className="text-[11px] font-medium text-ink-text-2">What these rules mean</span>
            <ChevronDown className={`w-3.5 h-3.5 text-ink-text-3 transition-transform ${glossaryOpen ? "rotate-180" : ""}`} />
          </button>
          {glossaryOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-ink-border/40 pt-2">
              {glossary.map((g) => (
                <div key={g.type}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[11px] font-semibold text-ink-text-2">{g.title}</p>
                    <ValidationTag validation={g.validation} />
                  </div>
                  <p className="text-[11px] text-ink-text-3 leading-relaxed">{g.definition}</p>
                  {g.validation?.status !== "validated" && (
                    <p className="text-[10px] text-ink-text-3/80 leading-relaxed mt-1 italic">{g.validation?.note}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Individual rule checks with specific, actionable notes */}
      {ruleChecks.length > 0 && (
        <div className="space-y-1.5">
          {ruleChecks.map((rule, i) => {
            const validation = TAJWEED_RULE_DEFINITIONS[rule.ruleType]?.validation;
            return (
              <div key={`r-${i}`} className="flex items-start gap-2 bg-ink-surface-2/40 rounded-lg p-3">
                <span className="text-sm mt-0.5">
                  {rule.verdict === "pass" ? "✅" : rule.verdict === "warn" ? "⚠️" : "➖"}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-medium text-ink-text-2">{rule.label}</p>
                    <ValidationTag validation={validation} />
                  </div>
                  <p className="text-[11px] text-ink-text-3 leading-relaxed mt-0.5">{rule.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-ink-text-3 pt-1">
        Based on a general Arabic speech-recognition model (not Quran-specific) and heuristic timing checks — treat this as approximate guidance, not a formal Tajweed ruling.
      </p>
    </div>
  );
}
