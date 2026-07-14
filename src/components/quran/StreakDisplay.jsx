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
        color="orange"
        delay={0}
      />
      <StatCard
        icon={<Target className="w-5 h-5" />}
        label="Today's Score"
        value={todayStreak?.average_accuracy ? `${todayStreak.average_accuracy}%` : "—"}
        color="emerald"
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
          color="blue"
          delay={0.2}
        />
      ) : (
        <StatCard
          icon={<Clock className="w-5 h-5" />}
          label="Recordings Today"
          value={todayStreak?.total_recordings || 0}
          color="blue"
          delay={0.2}
        />
      )}
      <StatCard
        icon={<TrendingUp className="w-5 h-5" />}
        label="Ayahs Practiced"
        value={todayStreak?.ayahs_practiced || 0}
        color="purple"
        delay={0.3}
      />
    </div>
  );
}

function StatCard({ icon, label, value, color, delay }) {
  const colorMap = {
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20",
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20"
  };

  const iconColorMap = {
    orange: "bg-orange-500/20 text-orange-400",
    emerald: "bg-emerald-500/20 text-emerald-400",
    blue: "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400"
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
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs mt-0.5 opacity-70">{label}</div>
    </motion.div>
  );
}