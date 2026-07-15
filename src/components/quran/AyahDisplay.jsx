import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, CheckCircle2, Circle, Mic } from "lucide-react";
import AyahInsights from "@/components/quran/AyahInsights";

function lastScoreColor(score) {
  if (score >= 90) return "text-emerald-400 bg-emerald-500/10 border-emerald-500/20";
  if (score >= 75) return "text-amber-400 bg-amber-500/10 border-amber-500/20";
  return "text-orange-400 bg-orange-500/10 border-orange-500/20";
}

export default function AyahDisplay({
  ayah,
  surahNumber,
  isPlaying,
  isHighlighted,
  memorizationStatus,
  showTranslation,
  onRecordClick,
  hideMode,
  lastScore,
  arabicScale = 1
}) {
  const [revealed, setRevealed] = useState(!hideMode);

  const statusColor = {
    memorized: "border-emerald-500/40 bg-emerald-500/5",
    learning: "border-amber-500/30 bg-amber-500/5",
    needs_review: "border-orange-500/30 bg-orange-500/5",
    not_started: "border-slate-700/30 bg-transparent"
  };

  const statusIcon = {
    memorized: <CheckCircle2 className="w-4 h-4 text-emerald-400" />,
    learning: <Circle className="w-4 h-4 text-amber-400" />,
    needs_review: <Circle className="w-4 h-4 text-orange-400" />,
    not_started: <Circle className="w-4 h-4 text-slate-600" />
  };

  const status = memorizationStatus || "not_started";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className={`group relative rounded-2xl border p-6 transition-all duration-500 ${statusColor[status]} ${isHighlighted ? 'ring-2 ring-emerald-400/50 shadow-lg shadow-emerald-500/10' : ''}`}
    >
      <div className="flex items-start gap-4">
        <div className="flex flex-col items-center gap-2 flex-shrink-0 pt-2">
          <div className="w-8 h-8 rounded-lg bg-slate-800 border border-slate-700 flex items-center justify-center">
            <span className="text-xs font-mono text-slate-400">{ayah.number}</span>
          </div>
          {statusIcon[status]}
          {lastScore != null && (
            <span
              className={`text-[10px] px-1.5 py-0.5 rounded-full border whitespace-nowrap ${lastScoreColor(lastScore)}`}
              title="Your most recent recitation score for this ayah"
            >
              {lastScore}
            </span>
          )}
        </div>

        <div className="flex-1 min-w-0 space-y-4">
          <div dir="rtl" className="relative">
            <AnimatePresence mode="wait">
              {hideMode && !revealed ? (
                <motion.button
                  key="hidden"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  onClick={() => setRevealed(true)}
                  className="w-full py-8 rounded-xl border-2 border-dashed border-slate-600/50 bg-slate-800/30 flex items-center justify-center gap-3 hover:border-emerald-500/30 transition-colors"
                >
                  <Eye className="w-5 h-5 text-slate-500" />
                  <span className="text-slate-500 text-sm">Tap to reveal — test your memory</span>
                </motion.button>
              ) : (
                <motion.p
                  key="visible"
                  initial={{ opacity: 0, filter: "blur(8px)" }}
                  animate={{ opacity: 1, filter: "blur(0px)" }}
                  transition={{ duration: 0.5 }}
                  className={`font-arabic leading-loose text-right tracking-wide transition-colors duration-300 ${isHighlighted ? 'text-emerald-300' : 'text-white/90'}`}
                  style={{ fontFamily: "'Scheherazade New', 'Amiri', serif", lineHeight: "2.8", fontSize: `${(1.75 * arabicScale).toFixed(3)}rem` }}
                >
                  {ayah.arabic}
                </motion.p>
              )}
            </AnimatePresence>

            {hideMode && revealed && (
              <button
                onClick={() => setRevealed(false)}
                aria-label="Hide the Arabic text again"
                className="absolute top-2 left-2 p-1.5 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white transition-colors"
              >
                <EyeOff className="w-4 h-4" />
              </button>
            )}
          </div>

          {showTranslation && (
            <motion.p
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-slate-400 text-sm leading-relaxed border-t border-slate-700/30 pt-3 italic"
            >
              {ayah.translation}
            </motion.p>
          )}

          {/* Study panels (tafsir / word-by-word) — hidden while the ayah is
              hidden in memorization mode so they can't leak the answer. */}
          {surahNumber != null && !(hideMode && !revealed) && (
            <AyahInsights surahNumber={surahNumber} ayahNumber={ayah.number} />
          )}
        </div>

        <div className="flex flex-col gap-2 flex-shrink-0 opacity-100 transition-opacity">
          <button
            onClick={() => onRecordClick?.(ayah)}
            className="p-2 rounded-xl bg-red-500/10 text-red-400 hover:bg-red-500/20 transition-colors"
            title="Record your recitation"
            aria-label={`Record your recitation of ayah ${ayah.number}`}
          >
            <Mic className="w-4 h-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}