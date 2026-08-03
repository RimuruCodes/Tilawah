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

// A day's `surahs` entries are either a bare surah number (the whole surah
// is the target — every built-in JUZ_AMMA_PLAN entry, unchanged) or, for a
// custom plan's day that only covers PART of a longer surah, an object
// `{ number, fromAyah, toAyah }`. surahName/targetLabel below handle both;
// getPlanProgress's completion check handles both too — see targetDone.
export function targetLabel(target) {
  if (typeof target === "number") return surahName(target);
  return `${surahName(target.number)} ${target.fromAyah}-${target.toAyah}`;
}

export function targetSurahNumber(target) {
  return typeof target === "number" ? target : target.number;
}

// Derives plan progress from recitation logs. A whole-surah target counts
// complete once ANY ayah of that surah has been logged after the plan
// started (matches the original Juz Amma behavior exactly — unchanged for
// every existing plan/test). A partial-surah target (custom plans only)
// counts complete only once EVERY ayah in its fromAyah..toAyah range has
// been logged — real ayah-level tracking, made possible because
// RecitationLog already records ayah_number per entry; no new tracking
// mechanism, just reading a field that was already there. Self-paced:
// "current day" is the first incomplete day, not a calendar position —
// life happens, plans shouldn't punish.
export function getPlanProgress(plan, startedDate, logs) {
  const startMs = new Date(startedDate).getTime();
  const relevantLogs = (logs || []).filter((l) => new Date(l.created_date).getTime() >= startMs);

  const practicedAyahsBySurah = new Map(); // surah_number -> Set<ayah_number>
  for (const l of relevantLogs) {
    if (!practicedAyahsBySurah.has(l.surah_number)) practicedAyahsBySurah.set(l.surah_number, new Set());
    if (l.ayah_number != null) practicedAyahsBySurah.get(l.surah_number).add(l.ayah_number);
  }

  function targetDone(target) {
    if (typeof target === "number") {
      return practicedAyahsBySurah.has(target); // any ayah of this surah practiced -- original behavior
    }
    const practiced = practicedAyahsBySurah.get(target.number);
    if (!practiced) return false;
    for (let a = target.fromAyah; a <= target.toAyah; a++) {
      if (!practiced.has(a)) return false;
    }
    return true;
  }

  let completedDays = 0;
  let currentDay = null;
  for (const day of plan.days) {
    const done = day.surahs.every(targetDone);
    if (done) {
      completedDays++;
    } else if (currentDay === null) {
      currentDay = day;
    }
  }
  const activeDay = currentDay || plan.days[plan.days.length - 1];
  return {
    completedDays,
    totalDays: plan.days.length,
    finished: completedDays === plan.days.length,
    currentDay: activeDay,
    // Within the current day, which targets are already practiced.
    currentDayDone: activeDay.surahs.filter(targetDone),
  };
}

// ---------------------------------------------------------------------
// Custom plans (Phase 4): choose a starting surah/ayah, an ending
// surah/ayah, and a target day count. Reuses the exact same {day, surahs}
// shape and getPlanProgress logic above -- not a parallel system, just a
// second way to produce a `days` array and a plain plan object shaped
// identically to JUZ_AMMA_PLAN.
// ---------------------------------------------------------------------

export function validateCustomPlanInput({ startSurah, startAyah, endSurah, endAyah, targetDays }) {
  const start = SURAHS.find((s) => s.number === startSurah);
  const end = SURAHS.find((s) => s.number === endSurah);
  if (!start) return "Choose a starting surah.";
  if (!end) return "Choose an ending surah.";
  if (endSurah < startSurah || (endSurah === startSurah && endAyah < startAyah)) {
    return "The ending point must come after the starting point.";
  }
  if (!Number.isInteger(startAyah) || startAyah < 1 || startAyah > start.ayahs) {
    return `${start.name} has ${start.ayahs} ayahs -- pick a starting ayah in that range.`;
  }
  if (!Number.isInteger(endAyah) || endAyah < 1 || endAyah > end.ayahs) {
    return `${end.name} has ${end.ayahs} ayahs -- pick an ending ayah in that range.`;
  }
  if (!Number.isInteger(targetDays) || targetDays < 1) {
    return "Choose a target number of days (at least 1).";
  }
  const totalAyahs = countAyahsInRange({ startSurah, startAyah, endSurah, endAyah });
  if (targetDays > totalAyahs) {
    return `That range is only ${totalAyahs} ayah${totalAyahs === 1 ? "" : "s"} -- choose ${totalAyahs} day${totalAyahs === 1 ? "" : "s"} or fewer.`;
  }
  return null;
}

function countAyahsInRange({ startSurah, startAyah, endSurah, endAyah }) {
  let total = 0;
  for (let s = startSurah; s <= endSurah; s++) {
    const surah = SURAHS.find((x) => x.number === s);
    const from = s === startSurah ? startAyah : 1;
    const to = s === endSurah ? endAyah : surah.ayahs;
    total += to - from + 1;
  }
  return total;
}

// Builds the flat, ordered {surah, ayah} sequence covering the range, then
// slices it into roughly-equal day-sized chunks (evenly dividing total
// ayahs across the target day count, same "one comfortable target a day"
// spirit as buildJuzAmmaDays) and groups each chunk's consecutive same-surah
// ayahs into a single target -- a plain surah number when the chunk covers
// that surah's full ayah range, otherwise a {number, fromAyah, toAyah}
// partial target. May resolve to slightly FEWER days than targetDays when
// the range doesn't divide evenly (rounding the per-day size up rather than
// down) -- self-paced plans finishing a little early is a feature, not a
// bug, same reasoning as getPlanProgress's "current day" being progress-
// based rather than calendar-based.
export function buildCustomPlanDays({ startSurah, startAyah, endSurah, endAyah, targetDays }) {
  const points = [];
  for (let s = startSurah; s <= endSurah; s++) {
    const surah = SURAHS.find((x) => x.number === s);
    const from = s === startSurah ? startAyah : 1;
    const to = s === endSurah ? endAyah : surah.ayahs;
    for (let a = from; a <= to; a++) points.push({ surah: s, ayah: a });
  }

  const perDay = Math.max(1, Math.ceil(points.length / targetDays));
  const days = [];
  for (let i = 0; i < points.length; i += perDay) {
    const chunk = points.slice(i, i + perDay);
    const targets = [];
    for (const point of chunk) {
      const last = targets[targets.length - 1];
      if (last && typeof last === "object" && last.number === point.surah && last.toAyah === point.ayah - 1) {
        last.toAyah = point.ayah; // extend the run already being built
      } else {
        targets.push({ number: point.surah, fromAyah: point.ayah, toAyah: point.ayah });
      }
    }
    // Collapse any run that turned out to cover a surah's FULL ayah range
    // into a plain number -- identical semantics to a JUZ_AMMA_PLAN entry,
    // and what getPlanProgress's whole-surah fast path expects.
    const collapsed = targets.map((t) => {
      const surah = SURAHS.find((x) => x.number === t.number);
      return t.fromAyah === 1 && t.toAyah === surah.ayahs ? t.number : t;
    });
    days.push({ day: days.length + 1, surahs: collapsed });
  }
  return days;
}

let customPlanSeq = 0;
export function createCustomPlan({ startSurah, startAyah, endSurah, endAyah, targetDays }) {
  const days = buildCustomPlanDays({ startSurah, startAyah, endSurah, endAyah, targetDays });
  const startLabel = targetLabel(startAyah === 1 ? startSurah : { number: startSurah, fromAyah: startAyah, toAyah: startAyah });
  const endSurahData = SURAHS.find((x) => x.number === endSurah);
  const endLabel = targetLabel(endAyah === endSurahData.ayahs ? endSurah : { number: endSurah, fromAyah: endAyah, toAyah: endAyah });
  return {
    id: `custom-${Date.now().toString(36)}-${customPlanSeq++}`,
    name: startSurah === endSurah ? `${surahName(startSurah)} in ${days.length} days` : `${surahName(startSurah)} to ${surahName(endSurah)} in ${days.length} days`,
    description: `${startLabel} through ${endLabel}, one comfortable target a day.`,
    days,
    isCustom: true,
  };
}
