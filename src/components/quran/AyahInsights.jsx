// Per-ayah study panels for the reader: Tafsir (commentary) and Words
// (word-by-word meanings). Collapsed by default so reading flow is
// undisturbed; content is fetched only on first open.
import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { BookMarked, WholeWord, Loader2 } from "lucide-react";
import { getTafsir, getWordMeanings, TAFSIR_ATTRIBUTION } from "@/lib/ayahInsights";

export default function AyahInsights({ surahNumber, ayahNumber }) {
  const [open, setOpen] = useState(null); // null | "tafsir" | "words"
  const [tafsir, setTafsir] = useState(undefined); // undefined=not loaded, null=unavailable
  const [words, setWords] = useState(undefined);
  const [activeWord, setActiveWord] = useState(null);

  const toggle = async (panel) => {
    const next = open === panel ? null : panel;
    setOpen(next);
    setActiveWord(null);
    if (next === "tafsir" && tafsir === undefined) {
      setTafsir(await getTafsir(surahNumber, ayahNumber));
    }
    if (next === "words" && words === undefined) {
      setWords(await getWordMeanings(surahNumber, ayahNumber));
    }
  };

  const pill = (panel, icon, label) => (
    <button
      onClick={() => toggle(panel)}
      className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-all border ${
        open === panel
          ? "bg-ink-accent/15 border-ink-accent/40 text-ink-accent"
          : "bg-ink-surface-2/40 border-ink-border/60 text-ink-text-3 hover:text-ink-text-2"
      }`}
    >
      {icon}
      {label}
    </button>
  );

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        {pill("tafsir", <BookMarked className="w-3 h-3" />, "Tafsir")}
        {pill("words", <WholeWord className="w-3.5 h-3.5" />, "Words")}
      </div>

      <AnimatePresence>
        {open === "tafsir" && (
          <motion.div
            key="tafsir"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-ink-surface-2/30 border border-ink-border/60 p-4 space-y-3">
              {tafsir === undefined && (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-ink-accent animate-spin" /></div>
              )}
              {tafsir === null && (
                <p className="text-xs text-ink-text-3">
                  Commentary for this ayah couldn't be loaded — check your connection and reopen.
                </p>
              )}
              {typeof tafsir === "string" && (
                <>
                  <div className="text-sm text-ink-text-2 leading-relaxed whitespace-pre-line max-h-80 overflow-y-auto pr-1">
                    {tafsir}
                  </div>
                  <p className="text-[10px] text-ink-text-3 border-t border-ink-border/60 pt-2">
                    {TAFSIR_ATTRIBUTION.work} — {TAFSIR_ATTRIBUTION.author}. {TAFSIR_ATTRIBUTION.note}
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}

        {open === "words" && (
          <motion.div
            key="words"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="rounded-xl bg-ink-surface-2/30 border border-ink-border/60 p-4 space-y-3">
              {words === undefined && (
                <div className="flex justify-center py-4"><Loader2 className="w-4 h-4 text-ink-accent animate-spin" /></div>
              )}
              {words === null && (
                <p className="text-xs text-ink-text-3">
                  Word meanings for this ayah couldn't be loaded — check your connection and reopen.
                </p>
              )}
              {Array.isArray(words) && (
                <>
                  <p className="text-[10px] text-ink-text-3">Tap a word for its meaning.</p>
                  <div dir="rtl" className="flex flex-wrap gap-1.5">
                    {words.map((w, i) => (
                      <button
                        key={i}
                        onClick={() => setActiveWord(activeWord === i ? null : i)}
                        className={`px-2.5 py-1.5 rounded-lg font-arabic text-lg leading-normal transition-colors border ${
                          activeWord === i
                            ? "bg-ink-accent/15 border-ink-accent/40 text-ink-accent"
                            : "bg-ink-surface-2/50 border-ink-border/60 text-ink-text/90 hover:border-ink-border"
                        }`}
                      >
                        {w.arabic}
                      </button>
                    ))}
                  </div>
                  {activeWord != null && words[activeWord] && (
                    <div className="rounded-lg bg-ink-surface/60 border border-ink-accent/20 p-3 space-y-1">
                      <p dir="rtl" className="font-arabic text-xl text-ink-accent">{words[activeWord].arabic}</p>
                      {words[activeWord].transliteration && (
                        <p className="text-xs text-ink-text-2 italic">{words[activeWord].transliteration}</p>
                      )}
                      <p className="text-sm text-ink-text-2">{words[activeWord].meaning || "—"}</p>
                    </div>
                  )}
                  <p className="text-[10px] text-ink-text-3 border-t border-ink-border/60 pt-2">
                    Word meanings and transliteration from Quran.com's word-by-word data.
                  </p>
                </>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
