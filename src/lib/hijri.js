// Hijri (Islamic) calendar support, via the browser's built-in
// Intl `islamic-umalqura` calendar — the ICU implementation of the official
// Saudi Umm al-Qura calendar, not hand-rolled date math. Verified against
// reference dates (Ramadan 1 1445 = 2024-03-11, Ramadan 1 1446 = 2025-03-01,
// Eid al-Adha 1445 = 2024-06-16) — see hijri.test.js.
//
// Honest limit: calendrical conversion can differ by a day from local moon
// sighting; the UI presents dates as Umm al-Qura calendar dates.

const RAMADAN_MONTH = 9;

export function getHijriDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", {
    day: "numeric",
    month: "numeric",
    year: "numeric",
  }).formatToParts(now);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  const monthName = new Intl.DateTimeFormat("en-u-ca-islamic-umalqura", { month: "long" }).format(now);
  const day = get("day");
  const month = get("month");
  const year = get("year");
  return {
    day,
    month,
    year,
    monthName,
    isRamadan: month === RAMADAN_MONTH,
    // "Muharram 28, 1448 AH" — for display.
    formatted: `${monthName} ${day}, ${year} AH`,
  };
}

// Ramadan mode is on by default but a one-tap Settings toggle away —
// "subtle and optional to disable", per the feature spec.
const RAMADAN_MODE_KEY = "qc_ramadan_mode";

export function isRamadanModeEnabled() {
  return localStorage.getItem(RAMADAN_MODE_KEY) !== "off";
}

export function setRamadanModeEnabled(on) {
  localStorage.setItem(RAMADAN_MODE_KEY, on ? "on" : "off");
}
