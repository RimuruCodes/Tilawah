import React from "react";
import { motion } from "framer-motion";
import { Flame, Target, Clock, TrendingUp } from "lucide-react";

export default function StreakDisplay({ streaks, currentStreak, averageScore }) {
  // Look today up by date rather than assuming the newest record is today's —
  // if the last practice was yesterday, its stats must not show as "Today".
  const todayStr = new Date().toISOString().split("T")[0];
  const todayStreak = streaks?.find((s) => s.date === todayStr);

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
      <StatCard
        icon={<Flame className="w-5 h-5" />}
        label="Day Streak"
        value={currentStreak}
        color="warning"
        delay={0}
      />
      <StatCard
        icon={<Target className="w-5 h-5" />}
        label="Today's Score"
        value={todayStreak?.average_accuracy ? `${todayStreak.average_accuracy}%` : "—"}
        color="accent"
        delay={0.1}
      />
      {/* All-time average (from recitation logs) — replaced "Recordings
          Today", which overlapped the other today-tiles without adding
          much. Falls back to it when no scores exist yet. */}
      {averageScore != null ? (
        <StatCard
          icon={<TrendingUp className="w-5 h-5" />}
          label="Average Score"
          value={averageScore}
          color="gold"
          delay={0.2}
        />
      ) : (
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Recordings Today"
          value={todayStreak?.total_recordings || 0}
          color="gold"
          delay={0.2}
        />
      )}
      <StatCard
        icon={<TrendingUp className="w-5 h-5" />}
        label="Ayahs Practiced"
        value={todayStreak?.ayahs_practiced || 0}
        color="danger"
        delay={0.3}
      />
    </div>
  );
}

// Four distinct hues so the tiles read apart at a glance — the Paper & Ink
// palette only defines four non-neutral accent colors total (accent, gold,
// warning, danger), so each is used here exactly once rather than the
// original orange/emerald/blue/purple spread. Less maximally distinct than
// four arbitrary hues, but stays inside the exact palette rather than
// inventing new colors outside it.
function StatCard({ icon, label, value, color, delay }) {
  const colorMap = {
    warning: "bg-ink-warning/10 text-ink-warning border-ink-warning/20",
    accent: "bg-ink-accent/10 text-ink-accent border-ink-accent/20",
    gold: "bg-ink-gold/10 text-ink-gold border-ink-gold/20",
    danger: "bg-ink-danger/10 text-ink-danger border-ink-danger/20"
  };

  const iconColorMap = {
    warning: "bg-ink-warning/20 text-ink-warning",
    accent: "bg-ink-accent/20 text-ink-accent",
    gold: "bg-ink-gold/20 text-ink-gold",
    danger: "bg-ink-danger/20 text-ink-danger"
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className={`rounded-2xl border p-4 ${colorMap[color]}`}
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center mb-3 ${iconColorMap[color]}`}>
        {icon}
      </div>
      <div className="text-2xl font-bold text-ink-text">{value}</div>
      {/* No opacity-70 here: it dropped the tinted label below WCAG AA on
          the tile's own /10 background. Full-strength colored text passes. */}
      <div className="text-xs mt-0.5">{label}</div>
    </motion.div>
  );
}