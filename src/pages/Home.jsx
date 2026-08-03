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
import CreateCustomPlanModal from "@/components/quran/CreateCustomPlanModal";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { getHomeLayout } from "@/lib/homeLayout";

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
  const [createPlanOpen, setCreatePlanOpen] = useState(false);
  // Read once per mount (Settings is the only place this changes; a fresh
  // read there means the next time Home mounts already reflects it, same
  // pattern as SurahReader's arabicScale).
  const [homeLayout] = useState(getHomeLayout());

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

  // Phase 4: the custom plan definition rides along on the state record
  // itself (custom_plan) rather than a separate collection -- it's already
  // part of the existing exportable recitation_plans collection this way,
  // no new backup/delete wiring needed. See PlanCard's `plan =
  // planState.custom_plan || JUZ_AMMA_PLAN` resolution.
  const startCustomPlan = useCallback(async (customPlan) => {
    const state = await RecitationPlanState.create({
      plan_id: customPlan.id,
      started_date: new Date().toISOString(),
      custom_plan: customPlan,
    });
    setPlanState(state);
    setCreatePlanOpen(false);
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
      <div className="min-h-screen bg-ink-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ink-accent animate-spin" />
      </div>
    );
  }

  // One renderer per customizable card id (see homeLayout.js) — delay is
  // derived from position so the stagger animation still reads correctly
  // regardless of the user's chosen order, instead of a fixed per-card value.
  const cardRenderers = {
    continue: (delay) => <ContinueRecitingCard key="continue" lastLog={recitationLogs[0] || null} delay={delay} />,
    streak: (delay) => (
      <motion.div key="streak" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
        <StreakDisplay streaks={streaks} currentStreak={currentStreak} averageScore={averageScore} />
      </motion.div>
    ),
    plan: (delay) => (
      <PlanCard
        key="plan"
        planState={planState}
        logs={recitationLogs}
        onStart={startPlan}
        onStartCustom={() => setCreatePlanOpen(true)}
        delay={delay}
      />
    ),
    weekly: (delay) => (
      <motion.div key="weekly" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay }}>
        <WeeklyHeatmap streaks={streaks} />
      </motion.div>
    ),
  };
  const visibleCards = homeLayout.filter((c) => c.visible && cardRenderers[c.id]);

  return (
    <div className="min-h-screen bg-ink-bg overscroll-none" {...touchHandlers}>
      <div className="max-w-2xl mx-auto px-4 pt-6 md:pt-10 pb-8 space-y-6">
        {(isRefreshing || pullDistance > 0) && (
          <div className="flex justify-center items-center" style={{ height: Math.max(pullDistance, isRefreshing ? 40 : 0) }}>
            <Loader2 className="w-6 h-6 text-ink-accent animate-spin" />
          </div>
        )}

        {/* Header */}
        <header className="flex items-center justify-between">
          <div className="space-y-1">
            <motion.h1
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="text-3xl md:text-4xl font-bold text-ink-text tracking-tight"
            >
              <span className="bg-gradient-to-r from-ink-accent to-ink-accent/60 bg-clip-text text-transparent">
                Quran
              </span>{" "}
              <span className="text-ink-text/80 font-light">Companion</span>
            </motion.h1>
            <p className="text-sm text-ink-text-3">
              {user?.full_name ? `Assalamu Alaikum, ${user.full_name}` : 'Read, Listen, Memorize, Perfect'}
            </p>
            <p className="text-xs text-ink-text-3" title="Umm al-Qura calendar date">
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
            and go" — detail lives in the reader and the Progress tab.
            RamadanCard and the Ayah/Hadith pair stay in a fixed position
            (seasonal nudge + daily inspiration, not user-reorderable stat/
            habit cards); the 4 cards in homeLayout.js render in the
            user's chosen order/visibility around them. */}
        <RamadanCard delay={0} />
        {visibleCards.map((c, i) => cardRenderers[c.id](0.05 + i * 0.05))}
        <div className="grid gap-4 md:grid-cols-2">
          <AyahOfTheDayCard delay={0.15} />
          <HadithOfTheDayCard delay={0.2} />
        </div>

        {/* Footer */}
        <footer className="py-6 border-t border-ink-border/50 space-y-4">
          <div className="flex items-center justify-center gap-6 text-sm">
            <Link to="/about" className="text-ink-text-3 hover:text-ink-accent transition-colors">About</Link>
            <Link to="/contact" className="text-ink-text-3 hover:text-ink-accent transition-colors">Contact</Link>
            <Link to="/donate" className="text-ink-text-3 hover:text-ink-accent transition-colors">Donate</Link>
          </div>
          <p className="text-xs text-ink-text-3 text-center">
            Built with ❤️ for the Ummah · Audio from EveryAyah.com · Text from Al Quran Cloud API
          </p>
        </footer>
      </div>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />
      <TutorialModal open={tutorialOpen} onClose={() => setTutorialOpen(false)} userId={user?.id} />
      <CreateCustomPlanModal open={createPlanOpen} onClose={() => setCreatePlanOpen(false)} onCreate={startCustomPlan} />
    </div>
  );
}
