import React, { useState, useEffect, useMemo, useCallback } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Search, BookOpen, Loader2 } from "lucide-react";
import { MemorizationProgress } from "@/lib/localDb";
import { SURAHS, MILESTONES } from "@/lib/quranData";
import SurahCard from "@/components/quran/SurahCard";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";

// The Quran tab: browse/search all 114 surahs. Moved out of Home when the
// dashboard redesign made Home a glance-and-go habit screen — this page owns
// the full list, the filters, and the memorization milestone bar.
export default function QuranIndex() {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [progressMap, setProgressMap] = useState({});
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const progressData = await MemorizationProgress.list("-updated_date", 1000);
    const pMap = {};
    progressData.forEach((p) => {
      if (!pMap[p.surah_number]) pMap[p.surah_number] = { memorized: 0, learning: 0, total: 0 };
      pMap[p.surah_number].total++;
      if (p.status === "memorized") pMap[p.surah_number].memorized++;
      if (p.status === "learning") pMap[p.surah_number].learning++;
    });
    setProgressMap(pMap);
    setLoading(false);
  }, []);

  useEffect(() => { load(); }, [load]);

  const { pullDistance, isRefreshing, touchHandlers } = usePullToRefresh(load);

  const filteredSurahs = useMemo(() => {
    let result = SURAHS;
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(
        (s) =>
          s.name.toLowerCase().includes(q) ||
          s.arabic.includes(search) ||
          s.meaning.toLowerCase().includes(q) ||
          String(s.number).includes(q)
      );
    }
    if (filter === "meccan") result = result.filter((s) => s.type === "Meccan");
    if (filter === "medinan") result = result.filter((s) => s.type === "Medinan");
    if (filter === "short") result = result.filter((s) => s.ayahs <= 20);
    if (filter === "memorized") result = result.filter((s) => progressMap[s.number]?.memorized > 0);
    return result;
  }, [search, filter, progressMap]);

  const totalMemorized = Object.values(progressMap).reduce((sum, p) => sum + (p.memorized || 0), 0);
  const nextMilestone = MILESTONES.find((m) => m.count > totalMemorized) || MILESTONES[MILESTONES.length - 1];

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 overscroll-none" {...touchHandlers}>
      <div className="max-w-6xl mx-auto px-4 pt-6 pb-8 space-y-6">
        {(isRefreshing || pullDistance > 0) && (
          <div className="flex justify-center items-center" style={{ height: Math.max(pullDistance, isRefreshing ? 40 : 0) }}>
            <Loader2 className="w-6 h-6 text-emerald-400 animate-spin" />
          </div>
        )}

        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <BookOpen className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Quran</h1>
          </div>
          <p className="text-xs text-slate-500">All 114 surahs — read, listen, memorize, recite.</p>
        </header>

        {/* Milestone Progress */}
        {nextMilestone && totalMemorized < nextMilestone.count && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="bg-gradient-to-r from-emerald-900/20 to-slate-900/40 border border-emerald-500/10 rounded-2xl p-4 flex items-center gap-4"
          >
            <span className="text-2xl">{nextMilestone.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-medium text-white">{nextMilestone.label}</span>
                <span className="text-xs text-emerald-400">{totalMemorized}/{nextMilestone.count}</span>
              </div>
              <div className="h-1.5 bg-slate-800 rounded-full overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-emerald-500 to-emerald-300 rounded-full transition-all duration-700"
                  style={{ width: `${Math.min(100, (totalMemorized / nextMilestone.count) * 100)}%` }}
                />
              </div>
              <p className="text-[10px] text-slate-500 mt-1">{nextMilestone.description}</p>
            </div>
          </motion.div>
        )}

        {/* Search & Filters */}
        <div className="space-y-3">
          <div className="relative">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search surahs by name, number, or meaning..."
              className="w-full pl-11 pr-4 py-3 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm"
            />
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
            {[
              { key: "all", label: "All Surahs" },
              { key: "meccan", label: "Meccan" },
              { key: "medinan", label: "Medinan" },
              { key: "short", label: "Short (≤20)" },
              { key: "memorized", label: "In Progress" }
            ].map((f) => (
              <button
                key={f.key}
                onClick={() => setFilter(f.key)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  filter === f.key
                    ? "bg-emerald-500 text-slate-900 shadow-sm shadow-emerald-500/20"
                    : "bg-slate-800/50 text-slate-400 hover:text-slate-300 border border-slate-700/30"
                }`}
              >
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Surah Grid */}
        <div className="grid gap-3 md:grid-cols-2">
          {filteredSurahs.map((surah) => (
            <Link key={surah.number} to={`/surah/${surah.number}`}>
              <SurahCard surah={surah} progress={progressMap[surah.number]} />
            </Link>
          ))}
        </div>

        {filteredSurahs.length === 0 && (
          <div className="text-center py-20">
            <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-4" />
            <p className="text-slate-500">No surahs match your search</p>
          </div>
        )}
      </div>
    </div>
  );
}
