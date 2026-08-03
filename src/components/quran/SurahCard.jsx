import React from "react";
import { motion } from "framer-motion";

export default function SurahCard({ surah, onClick, progress }) {
  const memorizedCount = progress?.memorized || 0;
  const totalAyahs = surah.ayahs;
  const progressPercent = totalAyahs > 0 ? Math.round((memorizedCount / totalAyahs) * 100) : 0;

  return (
    <motion.button
      onClick={onClick}
      whileHover={{ y: -2, scale: 1.01 }}
      whileTap={{ scale: 0.98 }}
      className="group relative w-full text-left rounded-2xl border border-ink-accent/20 bg-gradient-to-br from-ink-surface/80 to-ink-surface-2/60 backdrop-blur-sm p-5 transition-all duration-300 hover:border-ink-accent/40 hover:shadow-ink overflow-hidden"
    >
      <div className="absolute top-0 right-0 w-20 h-20 bg-ink-accent/5 rounded-full -translate-y-1/2 translate-x-1/2 group-hover:bg-ink-accent/10 transition-colors" />

      <div className="flex items-start gap-4">
        <div className="flex-shrink-0 w-11 h-11 rounded-xl bg-ink-accent-soft border border-ink-accent/20 flex items-center justify-center">
          <span className="text-ink-accent font-mono text-sm font-semibold">{surah.number}</span>
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-ink-text font-semibold text-base truncate">{surah.name}</h3>
            <span className="text-ink-accent/80 font-arabic text-xl flex-shrink-0" dir="rtl">{surah.arabic}</span>
          </div>

          <div className="flex items-center gap-2 mt-1.5">
            <span className="text-xs text-ink-text-2">{surah.meaning}</span>
            <span className="text-ink-text-3">·</span>
            <span className="text-xs text-ink-text-3">{surah.ayahs} ayahs</span>
            <span className="text-ink-text-3">·</span>
            {/* Meccan/Medinan get the same two-hue substitution as
                Hadith.jsx's Bukhari/Muslim tags (gold vs. accent) — the
                palette has no separate third hue for this kind of plain
                categorical tag. */}
            <span className={`text-xs px-1.5 py-0.5 rounded-full ${surah.type === 'Meccan' ? 'bg-ink-gold/10 text-ink-gold/80' : 'bg-ink-accent/10 text-ink-accent/80'}`}>
              {surah.type}
            </span>
          </div>

          {memorizedCount > 0 && (
            <div className="mt-3">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] text-ink-accent/70 uppercase tracking-wider">Memorized</span>
                <span className="text-[10px] text-ink-accent/70">{memorizedCount}/{totalAyahs}</span>
              </div>
              <div className="h-1 bg-ink-border/50 rounded-full overflow-hidden">
                <motion.div
                  initial={{ width: 0 }}
                  animate={{ width: `${progressPercent}%` }}
                  transition={{ duration: 0.8, ease: "easeOut" }}
                  className="h-full bg-gradient-to-r from-ink-accent to-ink-accent/80 rounded-full"
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </motion.button>
  );
}