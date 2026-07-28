import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { DailyStreak, RecitationLog, RecitationPlanState } from "@/lib/localDb";
import { getHijriDate } from "@/lib/hijri";
import { JUZ_AMMA_PLAN } from "@/lib/recitationPlans";
import { useAuth } from "@/lib/AuthContext";
import { motion } from "framer-motion";
import { Loader2, HelpCircle } from "lucide-react";
import { computeCurrentStreak } from "@/lib/streaks";
import StreakDisplay from "@/components/quran/StreakDisplay";
import WeeklyHeatmap from "@/components/quran/WeeklyHeatmap";
import SupportModal from "@/components/quran/SupportModal";
import IconButton from "@/components/IconButton";
import SupportButton from "@/components/SupportButton";
import TutorialModal, { hasSeenTutorial } from "@/components/TutorialModal";
import { ContinueRecitingCard, AyahOfTheDayCard, HadithOfTheDayCard, RamadanCard, PlanCard } from "@/components/home/DashboardCards";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// Home is the daily-habit dashboard: resume practice, streak at a glance,
// daily ayah + hadith. Browsing the full surah list lives on the Quran tab
// (src/pages/QuranIndex.jsx); detailed stats live on the Progress tab.
export default function Home() {
  const [streaks, setStreaks] = useState([]);
  const [recitationLogs, setRecitationLogs] = useState([]);
  const [planState, setPlanState] = useState(null);
  const [loading, setLoading] = useState(true);
  const { user } = useAuth();
  const [supportOpen, setSupportOpen] = useState(false);
  const [tutorialOpen, setTutorialOpen] = useState(false);

  useEffect(() => {
    if (user && !hasSeenTutorial(user.id)) {
      setTutorialOpen(true);
    }
  }, [user]);

  const load = useCallback(async () => {
    // A full year of daily records (one tiny object per practiced day) so a
    // streak longer than 30 days isn't silently capped by the fetch limit.
    const [streakData, logData, planStates] = await Promise.all([
      DailyStreak.list('-date', 366),
      RecitationLog.list('-created_date', 1000),
      RecitationPlanState.list('-created_date', 1),
    ]);
    setStreaks(streakData);
    setRecitationLogs(logData);
    setPlanState(planStates[0] || null);
    setLoading(false);
  }, []);

  const startPlan = useCallback(async () => {
    const state = await RecitationPlanState.create({
      plan_id: JUZ_AMMA_PLAN.id,
      started_date: new Date().toISOString(),
    });
    setPlanState(state);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { pullDistance, isRefreshing, touchHandlers } = usePullToRefresh(load);

  const currentStreak = useMemo(() => computeCurrentStreak(streaks), [streaks]);

  const averageScore = useMemo(() => {
    const scored = recitationLogs.filter((l) => Number.isFinite(l.accuracy_score));
    if (!scored.length) return null;
    return Math.round(scored.reduce((sum, l) => sum + l.accuracy_score, 0) / scored.length);
  }, [recitationLogs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none" {...touchHandlers}>
      <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-10 pb-8 space-y-6">
        {(isRefreshing || pullDistance > 0) && (
          <div className="flex justify-center items-center" style={{ height: Math.max(pullDistance, isRefreshing ? 40 : 0) }}>
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-4xl font-bold text-white tracking-tight"
            >
              <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
                Quran
              </span>{" "}
              <span className="text-white/80 font-light">Companion</span>
            </motion.h1>
            <p className="text-sm text-slate-500">
              {user?.full_name ? `Assalamu Alaikum, ${user.full_name}` : 'Read, Listen, Memorize, Perfect'}
            </p>
            <p className="text-xs text-slate-600" title="Umm al-Qura calendar date">
              {getHijriDate().formatted}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <IconButton
              icon={HelpCircle}
              label="How does the AI scoring work?"
              variant="neutral"
              onClick={() => setTutorialOpen(true)}
            />
            <SupportButton onClick={() => setSupportOpen(true)} />
          </div>
        </header>

        {/* Daily-habit dashboard: resume practice, streak tiles (with the
            all-time average score folded in), daily inspiration. "Glance
            and go" — detail lives in the reader and the Progress tab. */}
        <RamadanCard delay={0} />
        <ContinueRecitingCard lastLog={recitationLogs[0] || null} delay={0.05} />
        <StreakDisplay streaks={streaks} currentStreak={currentStreak} averageScore={averageScore} />
        <PlanCard planState={planState} logs={recitationLogs} onStart={startPlan} delay={0.1} />
        <div className="grid gap-4 md:grid-cols-2">
          <AyahOfTheDayCard delay={0.15} />
          <HadithOfTheDayCard delay={0.2} />
        </div>

        {/* Weekly Activity */}
        <WeeklyHeatmap streaks={streaks} />

        {/* Footer */}
        <footer className="py-6 border-t border-slate-800/50 space-y-4">
          <div className="flex items-center justify-center gap-6 text-sm">
            <Link to="/about" className="text-slate-500 hover:text-emerald-400 transition-colors">About</Link>
            <Link to="/contact" className="text-slate-500 hover:text-emerald-400 transition-colors">Contact</Link>
            <Link to="/donate" className="text-slate-500 hover:text-emerald-400 transition-colors">Donate</Link>
          </div>
          <p className="text-xs text-slate-600 text-center">
            Built with ❤️ for the Ummah · Audio from EveryAyah.com · Text from Al Quran Cloud API
          </p>
        </footer>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} userId={user?.id} />
    </div>
  );
}
