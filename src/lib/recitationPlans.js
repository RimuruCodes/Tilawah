// Structured recitation plans. One pre-built plan to start (Juz Amma in 30
// days) — a full plan-builder is deliberately out of scope until this
// proves useful. Plan state (which plan, when started) lives in localDb
// like every other user record; day completion is DERIVED from the
// existing RecitationLog data rather than stored, so practicing a target
// surah anywhere in the app counts automatically.
import { SURAHS } from "@/lib/quranData";

// Juz Amma (Juz 30): surahs 78-114 across 30 self-paced days — one surah a
// day while they're longer, pairs once they're very short.
function buildJuzAmmaDays() {
  const days = [];
  // Days 1-23: surahs 78..100, one per day.
  for (let s = 78; s <= 100; s++) {
    days.push({ day: days.length + 1, surahs: [s] });
  }
  // Days 24-30: the shortest surahs in pairs.
  for (let s = 101; s <= 114; s += 2) {
    days.push({ day: days.length + 1, surahs: [s, s + 1] });
  }
  return days;
}

export const JUZ_AMMA_PLAN = Object.freeze({
  id: "juz-amma-30",
  name: "Memorize Juz Amma in 30 days",
  description: "Surahs An-Naba (78) through An-Nas (114), one comfortable target a day.",
  days: buildJuzAmmaDays(),
});

export function surahName(number) {
  return SURAHS.find((s) => s.number === number)?.name || `Surah ${number}`;
}

// Derives plan progress from recitation logs. A day counts as complete
// once every one of its surahs has at least one recitation logged after
// the plan was started. Self-paced: "current day" is the first incomplete
// day, not a calendar position — life happens, plans shouldn't punish.
export function getPlanProgress(plan, startedDate, logs) {
  const startMs = new Date(startedDate).getTime();
  const practicedSurahs = new Set(
    (logs || [])
      .filter((l) => new Date(l.created_date).getTime() >= startMs)
      .map((l) => l.surah_number)
  );

  let completedDays = 0;
  let currentDay = null;
  for (const day of plan.days) {
    const done = day.surahs.every((s) => practicedSurahs.has(s));
    if (done) {
      completedDays++;
    } else if (currentDay === null) {
      currentDay = day;
    }
  }
  return {
    completedDays,
    totalDays: plan.days.length,
    finished: completedDays === plan.days.length,
    currentDay: currentDay || plan.days[plan.days.length - 1],
    // Within the current day, which targets are already practiced.
    currentDayDone: (currentDay || plan.days[plan.days.length - 1]).surahs.filter((s) => practicedSurahs.has(s)),
  };
}
