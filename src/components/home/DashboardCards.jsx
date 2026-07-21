// The Home dashboard cards: the "glance and go" layer that anchors the
// daily recitation habit. Follows the app's existing card language
// (slate-900/50 panels, slate-700/20 borders, emerald accents) — see
// RecordingModal / TajweedResultsPanel for the reference styling.
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Play, BookOpen, Quote, ScrollText, ChevronRight } from "lucide-react";
import { getDailyAyah, getDailyHadith } from "@/lib/dailyContent";
import { getHijriDate, isRamadanModeEnabled } from "@/lib/hijri";
import { JUZ_AMMA_PLAN, getPlanProgress, surahName } from "@/lib/recitationPlans";

// `delay` lets Home.jsx stagger the dashboard cards in on load instead of
// having all of them pop in at once.
const cardMotion = (delay = 0) => ({
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, ease: "easeOut", delay },
});

// "Continue reciting" — one tap back into the last practiced surah.
export function ContinueRecitingCard({ lastLog, delay }) {
  if (!lastLog) {
    return (
      <motion.div {...cardMotion(delay)}>
        <Link
          to="/surah/1"
          className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-900/30 to-slate-900/60 p-4 hover:border-emerald-500/40 transition-colors"
        >
          <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 flex-shrink-0">
            <Play className="w-5 h-5 text-white ml-0.5" />
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-sm font-semibold text-white">Start reciting</h3>
            <p className="text-xs text-slate-400">Begin with Al-Fatihah — your first score is one tap away.</p>
          </div>
          <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
        </Link>
      </motion.div>
    );
  }

  return (
    <motion.div {...cardMotion(delay)}>
      <Link
        to={`/surah/${lastLog.surah_number}`}
        className="flex items-center gap-4 rounded-2xl border border-emerald-500/20 bg-gradient-to-r from-emerald-900/30 to-slate-900/60 p-4 hover:border-emerald-500/40 transition-colors"
      >
        <div className="w-11 h-11 rounded-xl bg-emerald-500 flex items-center justify-center shadow-lg shadow-emerald-500/25 flex-shrink-0">
          <Play className="w-5 h-5 text-white ml-0.5" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-[10px] uppercase tracking-wider text-emerald-400/80 font-medium">Continue reciting</p>
          <h3 className="text-sm font-semibold text-white truncate">{lastLog.surah_name}</h3>
          <p className="text-xs text-slate-400">
            Last practiced Ayah {lastLog.ayah_number}
            {Number.isFinite(lastLog.accuracy_score) ? ` · scored ${lastLog.accuracy_score}` : ""}
          </p>
        </div>
        <ChevronRight className="w-4 h-4 text-slate-500 flex-shrink-0" />
      </Link>
    </motion.div>
  );
}

// Ayah of the Day — same text source as the reader (api.alquran.cloud).
export function AyahOfTheDayCard({ delay } = {}) {
  const [ayah, setAyah] = useState(undefined); // undefined=loading, null=unavailable

  useEffect(() => {
    let cancelled = false;
    getDailyAyah().then((a) => { if (!cancelled) setAyah(a); });
    return () => { cancelled = true; };
  }, []);

  if (ayah === null) return null; // offline with no cache — hide rather than show an empty shell

  return (
    <motion.div {...cardMotion(delay)} className="rounded-2xl border border-slate-700/20 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BookOpen className="w-4 h-4 text-emerald-400" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Ayah of the Day</h3>
      </div>
      {ayah === undefined ? (
        <div className="h-16 rounded-xl bg-slate-800/40 animate-pulse" />
      ) : (
        <>
          <p dir="rtl" lang="ar" className="text-lg leading-loose text-white font-arabic text-right">{ayah.arabic}</p>
          <p className="text-xs text-slate-400 leading-relaxed">{ayah.translation}</p>
          <Link
            to={`/surah/${ayah.surahNumber}`}
            className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300 transition-colors"
          >
            {ayah.surahName} · Ayah {ayah.ayahNumber}
            <ChevronRight className="w-3 h-3" />
          </Link>
        </>
      )}
    </motion.div>
  );
}

// Hadith of the Day — Sahih al-Bukhari / Sahih Muslim only; grading is the
// source collections' classification, not this app's.
export function HadithOfTheDayCard({ delay } = {}) {
  const [hadith, setHadith] = useState(undefined);

  useEffect(() => {
    let cancelled = false;
    getDailyHadith().then((h) => { if (!cancelled) setHadith(h); });
    return () => { cancelled = true; };
  }, []);

  if (hadith === null) return null;

  return (
    <motion.div {...cardMotion(delay)} className="rounded-2xl border border-slate-700/20 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center gap-2">
        <ScrollText className="w-4 h-4 text-amber-400" />
        <h3 className="text-xs font-medium uppercase tracking-wider text-slate-400">Hadith of the Day</h3>
      </div>
      {hadith === undefined ? (
        <div className="h-16 rounded-xl bg-slate-800/40 animate-pulse" />
      ) : (
        <>
          <div className="flex gap-2">
            <Quote className="w-4 h-4 text-slate-600 flex-shrink-0 mt-0.5" />
            <p className="text-xs text-slate-300 leading-relaxed line-clamp-6">{hadith.text}</p>
          </div>
          <p className="text-[11px] text-slate-500">
            {hadith.collection} {hadith.hadithNumber}
            <span className="text-emerald-400/70"> · Sahih</span>
            <span className="text-slate-600"> (graded by the source collection)</span>
          </p>
        </>
      )}
    </motion.div>
  );
}

// (The former QuickStatsCard strip was consolidated into StreakDisplay —
// its "average score" became a tile there; the rest duplicated existing
// tiles. See the Phase-4 note in the redesign discussion.)

// During Ramadan (Umm al-Qura calendar), a gentle nightly-practice nudge.
// Hidden entirely outside Ramadan or when disabled in Settings.
export function RamadanCard({ delay } = {}) {
  const hijri = getHijriDate();
  if (!hijri.isRamadan || !isRamadanModeEnabled()) return null;
  // Taraweeh traditionally covers roughly one juz per night — suggest
  // following along by reviewing that juz's opening surah context.
  return (
    <motion.div
      {...cardMotion(delay)}
      className="rounded-2xl border border-amber-500/20 bg-gradient-to-r from-amber-900/20 to-slate-900/60 p-4"
    >
      <p className="text-[10px] uppercase tracking-wider text-amber-400/90 font-medium">
        Ramadan Mubarak · Night {hijri.day}
      </p>
      <p className="text-sm text-slate-300 mt-1">
        Taraweeh tonight typically reaches Juz {Math.min(hijri.day, 30)}. Reciting or reviewing even a few
        of its ayahs before the prayer makes following along sweeter.
      </p>
      <p className="text-[10px] text-slate-500 mt-2">Can be turned off in Settings · dates follow the Umm al-Qura calendar.</p>
    </motion.div>
  );
}

// Structured plan card: current day's target, completion, overall progress.
export function PlanCard({ planState, logs, onStart, delay }) {
  if (!planState) {
    return (
      <motion.div {...cardMotion(delay)} className="rounded-2xl border border-slate-700/20 bg-slate-900/50 p-4 space-y-2">
        <h3 className="text-sm font-semibold text-white">{JUZ_AMMA_PLAN.name}</h3>
        <p className="text-xs text-slate-400">{JUZ_AMMA_PLAN.description}</p>
        <button
          onClick={onStart}
          className="w-full py-2 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-medium hover:bg-emerald-500/25 transition-colors"
        >
          Start the 30-day plan
        </button>
      </motion.div>
    );
  }

  const progress = getPlanProgress(JUZ_AMMA_PLAN, planState.started_date, logs);
  const pct = Math.round((progress.completedDays / progress.totalDays) * 100);

  return (
    <motion.div {...cardMotion(delay)} className="rounded-2xl border border-slate-700/20 bg-slate-900/50 p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-white">{JUZ_AMMA_PLAN.name}</h3>
        <span className="text-[10px] text-slate-500">
          {progress.finished ? "Complete!" : `Day ${progress.currentDay.day} of ${progress.totalDays}`}
        </span>
      </div>
      <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
        <div
          className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-700"
          style={{ width: `${pct}%` }}
        />
      </div>
      {progress.finished ? (
        <p className="text-xs text-emerald-300">Juz Amma complete — Masha'Allah! Keep reviewing to keep it.</p>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">Today:</span>
          {progress.currentDay.surahs.map((s) => {
            const done = progress.currentDayDone.includes(s);
            return (
              <Link
                key={s}
                to={`/surah/${s}`}
                className={`px-2.5 py-1 rounded-lg text-xs border transition-colors ${
                  done
                    ? "bg-emerald-500/15 border-emerald-500/30 text-emerald-300"
                    : "bg-slate-800/50 border-slate-700/30 text-slate-300 hover:border-emerald-500/30"
                }`}
              >
                {done ? "✓ " : ""}{surahName(s)}
              </Link>
            );
          })}
        </div>
      )}
    </motion.div>
  );
}
