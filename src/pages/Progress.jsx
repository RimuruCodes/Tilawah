import React, { useState, useEffect, useMemo, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { RecitationLog, DailyStreak, MemorizationProgress } from "@/lib/localDb";
import { motion } from "framer-motion";
import { ArrowLeft, BookOpen, Mic, Trophy, TrendingUp, Loader2, Calendar, Sparkles, Lock, Download } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts";
import { MILESTONES } from "@/lib/quranData";
import WeeklyHeatmap from "@/components/quran/WeeklyHeatmap";
import UpgradeModal from "@/components/quran/UpgradeModal";
import EmptyState from "@/components/EmptyState";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useSubscription } from "@/lib/SubscriptionContext";
import { canAccessFeature, GATED_FEATURES } from "@/lib/entitlements";
import { computeCurrentStreak } from "@/lib/streaks";
import { downloadJson } from "@/lib/downloadJson";
import { TAJWEED_CATEGORIES, STYLE_MATCH_DISPLAY } from "@/lib/tajweedValidationDisplay";
import { aggregateLogsBy, cumulativeAverageTrend } from "@/lib/practiceAnalytics";

// Compact per-point breakdown (value + short tag, not the full note — the
// full note lives on the legend's title/hover, matching how
// TajweedResultsPanel puts it on the tag's title attribute rather than
// inline, so the tooltip doesn't balloon into several paragraphs when
// multiple unvalidated categories have data at the same point).
// Raw inline styles (not Tailwind classes) since recharts' Tooltip content
// renders outside the normal DOM flow -- these still resolve per the
// active theme, same as WaveformTimeline's SVG fill/stroke values.
function TajweedTrendTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div style={{ background: "hsl(var(--ink-bg-surface))", border: "1px solid hsl(var(--ink-border))", borderRadius: 8 }} className="p-2.5 text-xs space-y-1">
      <p style={{ color: "hsl(var(--ink-text-tertiary))" }}>Attempt #{label}</p>
      {payload.map((entry) => {
        const cat = TAJWEED_CATEGORIES.find((c) => c.key === entry.dataKey);
        if (!cat || entry.value == null) return null;
        return (
          <div key={entry.dataKey} className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: entry.color }} />
            <span className="text-ink-text-2">
              {cat.label}: {entry.value}%
              {cat.tagText && <span className="text-ink-text-3 italic"> ({cat.tagText})</span>}
            </span>
          </div>
        );
      })}
    </div>
  );
}

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
    // Raised from 50 (Phase 6): a surah/reciter breakdown or long-term trend
    // silently reflecting only the most recent 50 recitations would badly
    // undercut anyone who's practiced for months. Matches Home.jsx's own
    // existing fetch limit for the same reason.
    const [logData, streakData, progressData] = await Promise.all([
      RecitationLog.list('-created_date', 1000),
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

  // Cumulative average Style Match over time -- the same "running average
  // as you practice" shape as tajweedTrend, but for a single metric rather
  // than per-rule. Phase 6: requires style_match_score, a NEW field on
  // RecitationLog (recitationService.js) -- older logs from before this
  // shipped simply won't have it, so this naturally only reflects practice
  // from here forward, never retroactively invented.
  const styleMatchTrend = useMemo(
    () => cumulativeAverageTrend(logs, "style_match_score").map((p) => ({ attempt: p.attempt, styleMatch: p.value })),
    [logs]
  );

  const surahBreakdown = useMemo(
    () => aggregateLogsBy(logs, (l) => String(l.surah_number), (l) => l.surah_name || `Surah ${l.surah_number}`),
    [logs]
  );
  const reciterBreakdown = useMemo(() => aggregateLogsBy(logs, (l) => l.reciter_used, (l) => l.reciter_used), [logs]);

  // A self-documenting export: each rule's validation status/note travels
  // WITH the numbers, so the file stays honest even opened outside the app
  // — not just in the UI where the hover tooltip lives.
  const handleDownloadAnalytics = () => {
    downloadJson(
      {
        exportedAt: new Date().toISOString(),
        overview: { avgScore, totalRecordings, totalMemorized, currentStreak },
        tajweedPassRateByCategory: TAJWEED_CATEGORIES.map(({ key, label, status, validationNote }) => ({
          category: label,
          validationStatus: status,
          validationNote,
          cumulativePassRatePercent: tajweedTrend.length ? tajweedTrend[tajweedTrend.length - 1][key] : null,
        })),
        styleMatch: {
          validationStatus: STYLE_MATCH_DISPLAY.status,
          validationNote: STYLE_MATCH_DISPLAY.validationNote,
          averagePercent: styleMatchTrend.length ? styleMatchTrend[styleMatchTrend.length - 1].styleMatch : null,
        },
        bySurah: surahBreakdown,
        byReciter: reciterBreakdown,
      },
      "quran-companion-tajweed-analytics"
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-ink-bg flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-ink-accent animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-bg overscroll-none" {...touchHandlers}>
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-6">
        {(isRefreshing || pullDistance > 0) && (
          <div className="flex justify-center items-center" style={{ height: Math.max(pullDistance, isRefreshing ? 40 : 0) }}>
            <Loader2 className="w-6 h-6 text-ink-accent animate-spin" />
          </div>
        )}
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-text-2 hover:text-ink-text transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-ink-text">Your Progress</h1>
        </div>

        {/* Overview Stats -- same 4-token spread as StreakDisplay/Home
            (accent/gold/warning/danger), so the same category always maps
            to the same hue across the app rather than a fresh assignment
            per screen. */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <ProgressStat icon={<TrendingUp className="w-5 h-5" />} label="Avg Score" value={`${avgScore}%`} color="accent" />
          <ProgressStat icon={<Mic className="w-5 h-5" />} label="Recordings" value={totalRecordings} color="gold" />
          <ProgressStat icon={<BookOpen className="w-5 h-5" />} label="Memorized" value={totalMemorized} color="danger" />
          <ProgressStat icon={<Calendar className="w-5 h-5" />} label="Day Streak" value={currentStreak} color="warning" />
        </div>

        <WeeklyHeatmap streaks={streaks} />

        {/* Milestones -- gold, not the general accent: trophies read as
            gold regardless of theme, a deliberate distinct association
            from the app's main green accent. */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink-text flex items-center gap-2">
            <Trophy className="w-5 h-5 text-ink-gold" />
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
                      ? 'border-ink-gold/30 bg-ink-gold/5'
                      : 'border-ink-border/40 bg-ink-surface/30 opacity-50'
                  }`}
                >
                  <span className="text-2xl">{m.icon}</span>
                  <div className="flex-1">
                    <h3 className={`text-sm font-medium ${achieved ? 'text-ink-gold' : 'text-ink-text-2'}`}>{m.label}</h3>
                    <p className="text-xs text-ink-text-3">{m.description}</p>
                  </div>
                  {achieved && (
                    <span className="text-xs text-ink-gold/60 bg-ink-gold/10 px-2 py-1 rounded-full">Achieved</span>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Tajweed Trends */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink-text flex items-center gap-2">
            <Sparkles className="w-5 h-5 text-ink-accent" />
            Tajweed Trends
          </h2>
          {!hasTajweedTrendsAccess ? (
            <button
              onClick={() => setUpgradeOpen(true)}
              className="w-full text-center py-10 bg-ink-surface/30 rounded-2xl border border-ink-border/40 hover:border-ink-accent/30 transition-colors"
            >
              <Lock className="w-6 h-6 text-ink-text-3 mx-auto mb-2" />
              <p className="text-ink-text-2 text-sm font-medium">Tajweed Trends is part of Quran Companion's subscription</p>
              <p className="text-ink-text-3 text-xs mt-1">See your Qalqalah, Ghunnah, and Madd pass-rate trend over time — tap to unlock</p>
            </button>
          ) : (
            <>
              {tajweedTrend.length < 2 ? (
                <EmptyState
                  icon={TrendingUp}
                  title="Not enough Tajweed-checked recitations yet"
                  message="Keep practicing single-ayah recitation to see your Qalqalah, Ghunnah, and Madd trends here"
                />
              ) : (
                <div className="bg-ink-surface/50 border border-ink-border/40 rounded-2xl p-4">
                  <ResponsiveContainer width="100%" height={220}>
                    <LineChart data={tajweedTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ink-border))" />
                      <XAxis dataKey="attempt" stroke="hsl(var(--ink-text-tertiary))" fontSize={11} tickLine={false} label={{ value: "Attempt #", position: "insideBottom", offset: -3, fill: "hsl(var(--ink-text-tertiary))", fontSize: 10 }} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--ink-text-tertiary))" fontSize={11} tickLine={false} width={35} />
                      <Tooltip content={<TajweedTrendTooltip />} />
                      {TAJWEED_CATEGORIES.map(({ key, label, color, strokeDasharray, strokeOpacity }) => (
                        <Line
                          key={key}
                          type="monotone"
                          dataKey={key}
                          name={label}
                          stroke={color}
                          strokeWidth={2}
                          strokeDasharray={strokeDasharray}
                          strokeOpacity={strokeOpacity}
                          dot={false}
                          connectNulls
                        />
                      ))}
                    </LineChart>
                  </ResponsiveContainer>
                  <div className="flex items-center justify-center gap-4 mt-2 flex-wrap">
                    {TAJWEED_CATEGORIES.map(({ key, label, color, tagText, validationNote }) => (
                      <div key={key} className="flex items-center gap-1.5" title={validationNote || undefined}>
                        <span className="w-2 h-2 rounded-full" style={{ backgroundColor: color }} />
                        <span className={`text-[11px] ${tagText ? "text-ink-text-3 cursor-help" : "text-ink-text-3"}`}>
                          {label}
                          {tagText && <span className="italic"> · {tagText}</span>}
                        </span>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] text-ink-text-3 text-center mt-2 leading-relaxed">
                    Cumulative pass rate per rule as you practice — a rising line means that rule is improving.
                    <br />
                    Solid = validated against real labeled data · dashed = weak or unproven signal (hover a label for why).
                  </p>
                </div>
              )}

              {/* Style Match trend (Phase 6) — its own honest tag, not
                  borrowed from the rule-validation tiers (see
                  tajweedValidationDisplay.js's STYLE_MATCH_DISPLAY for why:
                  it's a similarity-to-a-reciter-profile score, not a
                  pass/fail rule check against expert labels). */}
              {styleMatchTrend.length >= 2 && (
                <div className="bg-ink-surface/50 border border-ink-border/40 rounded-2xl p-4">
                  <h3 className="text-sm font-medium text-ink-text-2 mb-2">Style Match trend</h3>
                  <ResponsiveContainer width="100%" height={160}>
                    <LineChart data={styleMatchTrend} margin={{ top: 5, right: 10, left: -20, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--ink-border))" />
                      <XAxis dataKey="attempt" stroke="hsl(var(--ink-text-tertiary))" fontSize={11} tickLine={false} />
                      <YAxis domain={[0, 100]} stroke="hsl(var(--ink-text-tertiary))" fontSize={11} tickLine={false} width={35} />
                      <Tooltip
                        content={({ active, payload, label }) =>
                          active && payload?.length ? (
                            <div style={{ background: "hsl(var(--ink-bg-surface))", border: "1px solid hsl(var(--ink-border))", borderRadius: 8 }} className="p-2.5 text-xs">
                              <p style={{ color: "hsl(var(--ink-text-tertiary))" }}>Attempt #{label}</p>
                              <p className="text-ink-text-2">{payload[0].value}%</p>
                            </div>
                          ) : null
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="styleMatch"
                        stroke={STYLE_MATCH_DISPLAY.color}
                        strokeWidth={2}
                        strokeDasharray={STYLE_MATCH_DISPLAY.strokeDasharray}
                        strokeOpacity={STYLE_MATCH_DISPLAY.strokeOpacity}
                        dot={false}
                      />
                    </LineChart>
                  </ResponsiveContainer>
                  <p
                    className="text-[10px] text-ink-text-3 text-center mt-2 leading-relaxed cursor-help"
                    title={STYLE_MATCH_DISPLAY.validationNote}
                  >
                    How closely your pacing/elongation/pitch matched your reciter's own typical delivery.{" "}
                    <span className="italic">{STYLE_MATCH_DISPLAY.tagText}</span> — hover for why. Only tracked for
                    recitations against a reciter with a built style profile (currently: Alafasy).
                  </p>
                </div>
              )}

              {/* Breakdown by surah / reciter (Phase 6) — pure aggregation
                  over fields RecitationLog already stores; no new tracking. */}
              {(surahBreakdown.length > 0 || reciterBreakdown.length > 0) && (
                <div className="grid gap-3 md:grid-cols-2">
                  <BreakdownTable title="By Surah" rows={surahBreakdown} />
                  <BreakdownTable title="By Reciter" rows={reciterBreakdown} />
                </div>
              )}

              {logs.length > 0 && (
                <button
                  onClick={handleDownloadAnalytics}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-ink-surface-2 text-ink-text-2 text-sm font-medium hover:brightness-110 transition-colors"
                >
                  <Download className="w-4 h-4" />
                  Download Tajweed analytics summary
                </button>
              )}
            </>
          )}
        </div>

        {/* Recent Activity */}
        <div className="space-y-3">
          <h2 className="text-lg font-semibold text-ink-text">Recent Recitations</h2>
          {logs.length === 0 ? (
            <EmptyState
              icon={Mic}
              title="No recitations yet"
              message="Record your first verse and your scores, streaks, and Tajweed trends will start filling in here."
              actionLabel="Browse surahs"
              actionTo="/quran"
            />
          ) : (
            <div className="space-y-2">
              {/* Capped display, even though `logs` itself now holds up to
                  1000 (raised for the analytics above) -- this list was
                  never meant to render hundreds of rows, just the recent
                  ones; the fetch limit and the render cap are now two
                  separate concerns instead of accidentally the same number. */}
              {logs.slice(0, 50).map(log => (
                <motion.div
                  key={log.id}
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="flex items-center gap-4 p-4 rounded-xl bg-ink-surface/50 border border-ink-border/40"
                >
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-sm font-bold ${
                    (log.accuracy_score || 0) >= 90 ? 'bg-ink-success/20 text-ink-success' :
                    (log.accuracy_score || 0) >= 75 ? 'bg-ink-warning/20 text-ink-warning' :
                    'bg-ink-danger/20 text-ink-danger'
                  }`}>
                    {log.accuracy_score || 0}
                  </div>
                  <div className="flex-1 min-w-0">
                    <h4 className="text-sm font-medium text-ink-text truncate">
                      {log.surah_name} · Ayah {log.ayah_number}
                    </h4>
                    <p className="text-xs text-ink-text-3">
                      {log.reciter_used} · {log.duration_seconds || 0}s
                    </p>
                  </div>
                  <span className="text-[10px] text-ink-text-3">
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

// Phase 6: renders an aggregateBy() result -- shared by "By Surah" and "By
// Reciter", same row shape either way.
function BreakdownTable({ title, rows }) {
  if (rows.length === 0) return null;
  return (
    <div className="bg-ink-surface/50 border border-ink-border/40 rounded-2xl p-4">
      <h3 className="text-sm font-medium text-ink-text-2 mb-3">{title}</h3>
      <div className="space-y-2">
        {rows.slice(0, 10).map((row) => (
          <div key={row.label} className="flex items-center justify-between gap-2 text-xs">
            <span className="text-ink-text-2 truncate flex-1">{row.label}</span>
            <span className="text-ink-text-3 flex-shrink-0">{row.count}x</span>
            <span
              className={`flex-shrink-0 font-semibold w-9 text-right ${
                row.avgScore >= 90 ? "text-ink-success" : row.avgScore >= 75 ? "text-ink-warning" : "text-ink-danger"
              }`}
            >
              {row.avgScore}%
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Same 4-token spread as StreakDisplay/Home's stat tiles -- see this
// project's Phase 5 note there for why (only 4 non-neutral tokens exist).
function ProgressStat({ icon, label, value, color }) {
  const colorMap = {
    accent: "bg-ink-accent/10 text-ink-accent border-ink-accent/20",
    gold: "bg-ink-gold/10 text-ink-gold border-ink-gold/20",
    danger: "bg-ink-danger/10 text-ink-danger border-ink-danger/20",
    warning: "bg-ink-warning/10 text-ink-warning border-ink-warning/20"
  };
  const iconColorMap = {
    accent: "bg-ink-accent/20 text-ink-accent",
    gold: "bg-ink-gold/20 text-ink-gold",
    danger: "bg-ink-danger/20 text-ink-danger",
    warning: "bg-ink-warning/20 text-ink-warning"
  };

  return (
    <div className={`rounded-2xl border p-4 ${colorMap[color]}`}>
      <div className={`w-8 h-8 rounded-lg flex items-center justify-center mb-2 ${iconColorMap[color]}`}>{icon}</div>
      <div className="text-2xl font-bold text-ink-text">{value}</div>
      <div className="text-xs">{label}</div>
    </div>
  );
}