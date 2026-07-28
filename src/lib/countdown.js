// Pure date math for the App Store release countdown (Phase 1, 2026-07) —
// kept separate from the component that displays it, same convention as
// audioAnalysis.js's pure functions vs. the components that render them.
//
// Target instant: midnight UTC on August 25, 2026. UTC (not a specific
// city's timezone) is the deliberate choice here — an App Store release
// actually rolls out gradually per App Store region/timezone anyway, so
// there is no single true "release moment" to point at precisely; a fixed
// UTC instant is the simplest, most honest anchor rather than implying
// false precision about one particular timezone. Displaying the remaining
// time in the VISITOR'S OWN local timezone needs no extra logic beyond
// this: Date arithmetic is always absolute (UTC) internally regardless of
// what timezone `now` was constructed in, so a plain `targetDate - now`
// diff already does the right thing for every visitor, everywhere.
export const APP_STORE_RELEASE_DATE = new Date("2026-08-25T00:00:00Z");

const SECOND_MS = 1000;
const MINUTE_MS = 60 * SECOND_MS;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;

// Returns the remaining days/hours/minutes/seconds until targetDate, or
// `{ isPast: true }` once targetDate has arrived or passed — callers MUST
// check `isPast` before displaying days/hours/minutes/seconds, since those
// are always 0 (never negative) once the date has passed, by design: this
// function alone cannot "count up" into a broken-looking countdown, since
// there is nothing meaningful to show once the target time is reached.
export function getCountdown(targetDate, now = new Date()) {
  const diffMs = targetDate.getTime() - now.getTime();
  if (diffMs <= 0) {
    return { isPast: true, days: 0, hours: 0, minutes: 0, seconds: 0 };
  }
  const days = Math.floor(diffMs / DAY_MS);
  const hours = Math.floor((diffMs % DAY_MS) / HOUR_MS);
  const minutes = Math.floor((diffMs % HOUR_MS) / MINUTE_MS);
  const seconds = Math.floor((diffMs % MINUTE_MS) / SECOND_MS);
  return { isPast: false, days, hours, minutes, seconds };
}
