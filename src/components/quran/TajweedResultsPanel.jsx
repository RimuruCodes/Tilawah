import React, { useState } from "react";
import { ChevronDown } from "lucide-react";
import { TAJWEED_RULE_DEFINITIONS } from "@/lib/tajweedAnalysis";

// Small hoverable tag naming how much real evidence backs this rule's
// verdict — see TAJWEED_RULE_DEFINITIONS' validation field and
// tools/qdat-eval/README.md for the actual numbers behind each tier.
// "validated" gets no tag at all: it's the one tier that should look and
// feel exactly like it does today, with no added noise around the thing
// that's actually trustworthy.
function ValidationTag({ validation }) {
  if (!validation || validation.status === "validated") return null;
  const isWeak = validation.status === "weak-signal";
  return (
    <span
      className={`text-[9px] font-medium uppercase tracking-wide rounded px-1.5 py-0.5 cursor-help border ${
        isWeak
          ? "text-amber-400/80 bg-amber-500/10 border-amber-500/20"
          : "text-slate-400 bg-slate-700/30 border-slate-600/30"
      }`}
      title={validation.note}
    >
      {isWeak ? "Weak signal" : "Not yet verified"}
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
        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <p className="text-[11px] text-amber-400/90 leading-relaxed text-center">{unavailableMessage}</p>
        </div>
      );
    }
    return (
      <p className="text-[10px] text-slate-500 text-center">
        Word-level Tajweed detail wasn't available for this attempt.
      </p>
    );
  }

  const { wordFeedback, ruleChecks, glossary, recognizedText } = tajweedResult;
  const warnCount = ruleChecks.filter((r) => r.verdict === "warn").length;
  const passCount = ruleChecks.filter((r) => r.verdict === "pass").length;

  return (
    <div className="space-y-3 pt-2 border-t border-slate-800">
      <div className="flex items-center justify-between">
        <h4 className="text-xs font-semibold text-emerald-400 uppercase tracking-wide">Speech recognition &amp; Tajweed</h4>
        {ruleChecks.length > 0 && (
          <span className="text-[10px] text-slate-500">{passCount} looked good · {warnCount} to review</span>
        )}
      </div>

      {recognizedText && (
        <div className="bg-slate-800/30 rounded-lg p-3 border border-slate-700/20">
          <p className="text-[10px] text-slate-500 mb-1">What speech recognition heard:</p>
          <p className="text-sm text-slate-300" dir="rtl" lang="ar" style={{ fontFamily: "var(--font-arabic)" }}>{recognizedText}</p>
        </div>
      )}

      {/* Word-correctness feedback */}
      {wordFeedback.length > 0 && (
        <div className="space-y-2">
          {wordFeedback.map((note, i) => (
            <div key={`w-${i}`} className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30">
              <p className="text-xs text-slate-300 leading-relaxed">{note}</p>
            </div>
          ))}
        </div>
      )}

      {/* Rule glossary — collapsed by default, explains what's being checked */}
      {glossary?.length > 0 && (
        <div className="bg-slate-800/30 rounded-lg border border-slate-700/20 overflow-hidden">
          <button
            onClick={() => setGlossaryOpen((v) => !v)}
            className="w-full flex items-center justify-between px-3 py-2 text-left"
          >
            <span className="text-[11px] font-medium text-slate-400">What these rules mean</span>
            <ChevronDown className={`w-3.5 h-3.5 text-slate-500 transition-transform ${glossaryOpen ? "rotate-180" : ""}`} />
          </button>
          {glossaryOpen && (
            <div className="px-3 pb-3 space-y-2 border-t border-slate-700/20 pt-2">
              {glossary.map((g) => (
                <div key={g.type}>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-[11px] font-semibold text-slate-300">{g.title}</p>
                    <ValidationTag validation={g.validation} />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{g.definition}</p>
                  {g.validation?.status !== "validated" && (
                    <p className="text-[10px] text-slate-500/80 leading-relaxed mt-1 italic">{g.validation?.note}</p>
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
              <div key={`r-${i}`} className="flex items-start gap-2 bg-slate-800/40 rounded-lg p-3">
                <span className="text-sm mt-0.5">
                  {rule.verdict === "pass" ? "✅" : rule.verdict === "warn" ? "⚠️" : "➖"}
                </span>
                <div>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <p className="text-xs font-medium text-slate-300">{rule.label}</p>
                    <ValidationTag validation={validation} />
                  </div>
                  <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{rule.note}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <p className="text-[10px] text-slate-500 pt-1">
        Based on a general Arabic speech-recognition model (not Quran-specific) and heuristic timing checks — treat this as approximate guidance, not a formal Tajweed ruling.
      </p>
    </div>
  );
}
