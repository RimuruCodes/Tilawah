import React, { useState } from "react";
import { ChevronDown } from "lucide-react";

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
      <p className="text-[10px] text-slate-600 text-center">
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
          <p className="text-sm text-slate-300" dir="rtl" style={{ fontFamily: "'Scheherazade New', serif" }}>{recognizedText}</p>
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
                  <p className="text-[11px] font-semibold text-slate-300">{g.title}</p>
                  <p className="text-[11px] text-slate-500 leading-relaxed">{g.definition}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Individual rule checks with specific, actionable notes */}
      {ruleChecks.length > 0 && (
        <div className="space-y-1.5">
          {ruleChecks.map((rule, i) => (
            <div key={`r-${i}`} className="flex items-start gap-2 bg-slate-800/40 rounded-lg p-3">
              <span className="text-sm mt-0.5">
                {rule.verdict === "pass" ? "✅" : rule.verdict === "warn" ? "⚠️" : "➖"}
              </span>
              <div>
                <p className="text-xs font-medium text-slate-300">{rule.label}</p>
                <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{rule.note}</p>
              </div>
            </div>
          ))}
        </div>
      )}

      <p className="text-[10px] text-slate-600 pt-1">
        Based on a general Arabic speech-recognition model (not Quran-specific) and heuristic timing checks — treat this as approximate guidance, not a formal Tajweed ruling.
      </p>
    </div>
  );
}
