import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RecitationLog, DailyStreak, MemorizationProgress } from "@/lib/localDb";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Mic, Trophy, TrendingUp, Loader2, Calendar, Sparkles, Lock } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { MILESTONES } from "@/lib/quranData";
import WeeklyHeatmap from "@/components/quran/WeeklyHeatmap";
import UpgradeModal from "@/components/quran/UpgradeModal";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSubscription } from "@/lib/SubscriptionContext";
import { canAccessFeature, GATED_FEATURES } from "@/lib/entitlements";
import { computeCurrentStreak } from "@/lib/streaks";

const TAJWEED_CATEGORIES = [
  { key: "qalqalah", label: "Qalqalah", color: "#38bdf8" },
  { key: "ghunnah", label: "Ghunnah", color: "#a78bfa" },
  { key: "iqlab", label: "Iqlab", color: "#f472b6" },
  { key: "idgham_ghunnah", label: "Idgham", color: "#fb923c" },
  { key: "ikhfa", label: "Ikhfa", color: "#22d3ee" },
  { key: "madd", label: "Madd", color: "#34d399" },
];

export default function Progress() {
  const navigate = useNavigate();
  const [logs, setLogs] = useState([]);
  const [streaks, setStreaks] = useState([]);
  const [progress, setProgress] = useState([]);
  const [loading, setLoading] = useState(true);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const { subscription } = useSubscription();
  const hasTajweedTrendsAccess = canAccessFeature(GATED_FEATURES.TAJWEED_TRENDS, subscription);

  const load = useCallback(async () => {
    const [logData, streakData, progressData] = await Promise.all([
      RecitationLog.list('-created_date', 50),
      DailyStreak.list('-date', 30),
      MemorizationProgress.filter({ status: 'memorized' })
    ]);
    setLogs(logData);
    setStreaks(streakData);
    setProgress(progressData);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const { pullDistance, isRefreshing, touchHandlers } = usePullToRefresh(load);

  const totalRecordings = logs.length;
  const avgScore = totalRecordings > 0
    ? Math.round(logs.reduce((sum, l) => sum + (l.accuracy_score || 0), 0) / totalRecordings)
    : 0;
  const totalMemorized = progress.length;

  const currentStreak = useMemo(() => computeCurrentStreak(streaks), [streaks]);

  const achievedMilestones = MILESTONES.filter(m => totalMemorized >= m.count || currentStreak >= m.count);

  // Cumulative pass-rate over time per Tajweed rule category, so someone
  // can see whether e.g. their Qalqalah detection rate is actually
  // trending up as they practice, not just their overall score.
  const tajweedTrend = useMemo(() => {
    const chronological = [...logs]
      .filter(l => l.tajweed_summary && Object.keys(l.tajweed_summary).length > 0)
      .reverse(); // logs are fetched newest-first; chart wants oldest-first

    const cumulative = Object.fromEntries(TAJWEED_CATEGORIES.map(({ key }) => [key, { pass: 0, total: 0 }]));
    return chronological.map((log, idx) => {
      TAJWEED_CATEGORIES.forEach(({ key }) => {
        const s = log.tajweed_summary[key];
        if (s) {
          cumulative[key].pass += s.pass;
          cumulative[key].total += s.total;
        }
      });
      const point = { attempt: idx + 1 };
      TAJWEED_CATEGORIES.forEach(({ key }) => {
        point[key] = cumulative[key].total ? Math.round((cumulative[key].pass / cumulative[key].total) * 100) : null;
      });
      return point;
    });
  }, [logs]);

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none" {...touchHandlers}>
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-6">
        {(isRefreshing || pullDistance > 0) && (
          <div className="flex justify-center items-center" style={{ height: Math.max(pullDistance, isRefreshing ? 40 : 0) }}>
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">Your Progress</h1>
        </div>

        {/* Overview Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ProgressStat icon={<TrendingUp className="w-5 h-5" />} label="Avg Score" value={`${avgScore}%`} color="emerald" />
          <ProgressStat icon={<Mic className="w-5 h-5" />} label="Recordings" value={totalRecordings} color="blue" />
          <ProgressStat icon={<BookOpen className="w-5 h-5" />} label="Memorized" value={totalMemorized} color="purple" />
          <ProgressStat icon={<Calendar className="w-5 h-5" />} label="Day Streak" value={currentStreak} color="orange" />
        </div>

        <WeeklyHeatmap streaks={streaks} />

        {/* Milestones */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Trophy className="w-5 h-5 text-amber-400" />
            Milestones
          </h2>
          <div className="grid gap-2">
            {MILESTONES.map(m => {
              const achieved = totalMemorized >= m.count || currentStreak >= m.count;
              return (
                <div
                  key={m.label}
                  className={`flex items-center gap-4 p-4 rounded-xl border transition-all ${
                    achieved
                      ? 'border-amber-500/30 bg-amber-500/5'
                      : 'border-slate-700/20 bg-slate-900/30 opacity-50'
                  }`}
                >
                  <span className="text-2xl">{m.icon}</span>
                  <div className="flex-1">
                    <h3 className={`text-sm font-medium ${achieved ? 'text-amber-300' : 'text-slate-400'}`}>{m.label}</h3>
                    <p className="text-xs text-slate-500">{m.description}</p>
                  </div>
                  {achieved && (
                    <span className="text-xs text-amber-400/60 bg-amber-500/10 px-2 py-1 rounded-full">Achieved</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tajweed Trends */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-emerald-400" />
            Tajweed Trends
          </h2>
          {!hasTajweedTrendsAccess ? (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="w-full text-center py-10 bg-slate-900/30 rounded-2xl border border-slate-700/20 hover:border-emerald-500/30 transition-colors"
            >
              <Lock className="w-6 h-6 text-slate-600 mx-auto mb-2" />
              <p className="text-slate-400 text-sm font-medium">Tajweed Trends is part of Quran Companion's subscription</p>
              <p className="text-slate-600 text-xs mt-1">See your Qalqalah, Ghunnah, and Madd pass-rate trend over time — tap to unlock</p>
            </button>
          ) : tajweedTrend.length < 2 ? (
            <div className="text-center py-10 bg-slate-900/30 rounded-2xl border border-slate-700/20">
              <p className="text-slate-500 text-sm">Not enough Tajweed-checked recitations yet</p>
              <p className="text-slate-600 text-xs mt-1">Keep practicing single-ayah recitation to see your Qalqalah, Ghunnah, and Madd trends here</p>
            </div>
          ) : (
            <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4">
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={tajweedTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="attempt" stroke="#64748b" fontSize={11} tickLine={false} label={{ value: "Attempt #", position: "insideBottom", offset: -3, fill: "#64748b", fontSize: 10 }} />
                  <YAxis domain={[0, 100]} stroke="#64748b" fontSize={11} tickLine={false} width={35} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #334155", borderRadius: 8, fontSize: 12 }}
                    labelStyle={{ color: "#94a3b8" }}
                  />
                  {TAJWEED_CATEGORIES.map(({ key, label, color }) => (
                    <Line key={key} type="monotone" dataKey={key} name={label} stroke={color} strokeWidth={2} dot={false} connectNulls />
                  ))}
                </LineChart>
              </ResponsiveContainer>
              <div className="flex items-center justify-center gap-4 mt-2">
                {TAJWEED_CATEGORIES.map(({ key, label, color }) => (
                  <div key={key} className="flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                    <span className="text-[11px] text-slate-500">{label}</span>
                  </div>
                ))}
              </div>
              <p className="text-[10px] text-slate-600 text-center mt-2">
                Cumulative pass rate per rule as you practice — a rising line means that rule is improving.
              </p>
            </div>
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-white">Recent Recitations</h2>
          {logs.length === 0 ? (
            <div className="text-center py-12 bg-slate-900/30 rounded-2xl border border-slate-700/20">
              <Mic className="w-10 h-10 text-slate-700 mx-auto mb-3" />
              <p className="text-slate-500 text-sm">No recitations yet</p>
              <p className="text-slate-600 text-xs mt-1">Start by recording a verse from any surah</p>
            </div>
          ) : (
            <div className="space-y-2">
              {logs.map(log => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-slate-900/50 border border-slate-700/20"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                    (log.accuracy_score || 0) >= 90 ? 'bg-emerald-500/20 text-emerald-400' :
                    (log.accuracy_score || 0) >= 75 ? 'bg-amber-500/20 text-amber-400' :
                    'bg-orange-500/20 text-orange-400'
                  }`}>
                    {log.accuracy_score || 0}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-white truncate">
                      {log.surah_name} · Ayah {log.ayah_number}
                    </h4>
                    <p className="text-xs text-slate-500">
                      {log.reciter_used} · {log.duration_seconds || 0}s
                    </p>
                  </div>
                  <span className="text-[10px] text-slate-600">
                    {new Date(log.created_date).toLocaleDateString()}
                  </span>
                </motion.div>
              ))}
            </div>
          )}
        </div>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureLabel="Tajweed Trends" />
    </div>
  );
}

function ProgressStat({ icon, label, value, color }) {
  const colorMap = {
    emerald: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    blue: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    purple: "bg-purple-500/10 text-purple-400 border-purple-500/20",
    orange: "bg-orange-500/10 text-orange-400 border-orange-500/20"
  };
  const iconColorMap = {
    emerald: "bg-emerald-500/20 text-emerald-400",
    blue: "bg-blue-500/20 text-blue-400",
    purple: "bg-purple-500/20 text-purple-400",
    orange: "bg-orange-500/20 text-orange-400"
  };

  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconColorMap[color]}`}>{icon}</div>
      <div className="text-2xl font-bold text-white">{value}</div>
      <div className="text-xs opacity-70">{label}</div>
    </div>
  );
}