// Phase 6 (deeper Tajweed analytics): pure aggregation over fields
// RecitationLog already stores on every entry (surah_number, surah_name,
// reciter_used, accuracy_score, tajweed_summary) -- no new tracking, just
// grouping. Kept separate from Progress.jsx so it's unit-testable without
// rendering the page.
import { TAJWEED_CATEGORIES } from "@/lib/tajweedValidationDisplay";

export function aggregateLogsBy(logs, keyFn, labelFn) {
  const groups = new Map();
  for (const log of logs) {
    const key = keyFn(log);
    if (key == null) continue;
    if (!groups.has(key)) {
      groups.set(key, {
        label: labelFn(log),
        count: 0,
        scoreSum: 0,
        categories: Object.fromEntries(TAJWEED_CATEGORIES.map(({ key: k }) => [k, { pass: 0, total: 0 }])),
      });
    }
    const g = groups.get(key);
    g.count += 1;
    g.scoreSum += log.accuracy_score || 0;
    if (log.tajweed_summary) {
      TAJWEED_CATEGORIES.forEach(({ key: k }) => {
        const s = log.tajweed_summary[k];
        if (s) {
          g.categories[k].pass += s.pass;
          g.categories[k].total += s.total;
        }
      });
    }
  }
  return [...groups.values()]
    .map((g) => ({
      label: g.label,
      count: g.count,
      avgScore: Math.round(g.scoreSum / g.count),
      passRateByCategory: Object.fromEntries(
        Object.entries(g.categories).map(([k, { pass, total }]) => [k, total ? Math.round((pass / total) * 100) : null])
      ),
    }))
    .sort((a, b) => b.count - a.count);
}

// Cumulative average of a numeric field over time (oldest-first), the same
// "running average as you practice" shape as Progress.jsx's per-rule
// tajweedTrend, but for a single metric (Style Match) rather than per-rule
// pass/total. `logsNewestFirst` is filtered to entries where `field` is
// non-null before this is called (RecitationLog.list's natural order).
export function cumulativeAverageTrend(logsNewestFirst, field) {
  const chronological = [...logsNewestFirst].filter((l) => l[field] != null).reverse();
  let sum = 0;
  return chronological.map((log, idx) => {
    sum += log[field];
    return { attempt: idx + 1, value: Math.round(sum / (idx + 1)) };
  });
}
