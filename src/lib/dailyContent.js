// Daily rotating content for the Home dashboard: Ayah of the Day and
// Hadith of the Day. Selection is deterministic per calendar date (same
// pick all day, changes at midnight, no server needed) and every fetch is
// cached in localStorage so the cards work offline after first load and
// never refetch within a day.
//
// Sources — both already used/vetted elsewhere in the app:
//  - Ayah text/translation: api.alquran.cloud (same API as the reader).
//  - Hadith: fawazahmed0/hadith-api CDN (jsDelivr), scoped to Sahih
//    al-Bukhari and Sahih Muslim only — collections whose entries are
//    authentic (sahih) by their compilers' methodology; the grading comes
//    from the source collections, not from this app.

const AYAH_CACHE_KEY = "qc_daily_ayah";
const HADITH_CACHE_KEY = "qc_daily_hadith";

const TOTAL_QURAN_AYAHS = 6236;

// Highest hadith number safely present in each collection in this dataset
// (both collections' numbering is dense from 1; staying under the max
// avoids 404s at the tail).
const HADITH_COLLECTIONS = [
  { edition: "eng-bukhari", name: "Sahih al-Bukhari", maxNumber: 7563 },
  { edition: "eng-muslim", name: "Sahih Muslim", maxNumber: 7563 },
];

export function todayKey(now = new Date()) {
  return now.toISOString().split("T")[0];
}

// Small deterministic hash of the date string — stable across reloads,
// different from one day to the next.
export function dateSeed(dayKey) {
  let h = 0;
  for (let i = 0; i < dayKey.length; i++) {
    h = (h * 31 + dayKey.charCodeAt(i)) >>> 0;
  }
  return h;
}

function readCache(key, dayKey) {
  try {
    const cached = JSON.parse(localStorage.getItem(key) || "null");
    if (cached && cached.day === dayKey) return cached.value;
    // Stale (yesterday's) entry: kept as an offline fallback, see callers.
    return cached ? { stale: true, value: cached.value } : null;
  } catch {
    return null;
  }
}

function writeCache(key, dayKey, value) {
  try {
    localStorage.setItem(key, JSON.stringify({ day: dayKey, value }));
  } catch {
    // Storage full — the card just refetches next open.
  }
}

// ---- Ayah of the Day -------------------------------------------------

export function pickDailyAyahNumber(dayKey) {
  return (dateSeed(dayKey) % TOTAL_QURAN_AYAHS) + 1; // global ayah 1..6236
}

export async function getDailyAyah(now = new Date()) {
  const day = todayKey(now);
  const cached = readCache(AYAH_CACHE_KEY, day);
  if (cached && !cached.stale) return cached;

  try {
    const globalAyah = pickDailyAyahNumber(day);
    const res = await fetch(`https://api.alquran.cloud/v1/ayah/${globalAyah}/editions/quran-uthmani,en.sahih`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const [arabic, english] = json.data;
    const value = {
      arabic: arabic.text,
      translation: english.text,
      surahNumber: arabic.surah.number,
      surahName: arabic.surah.englishName,
      ayahNumber: arabic.numberInSurah,
    };
    writeCache(AYAH_CACHE_KEY, day, value);
    return value;
  } catch {
    // Offline / API down: yesterday's cached ayah beats an empty card.
    return cached?.stale ? cached.value : null;
  }
}

// ---- Hadith of the Day -----------------------------------------------

export function pickDailyHadith(dayKey) {
  const seed = dateSeed(dayKey);
  const collection = HADITH_COLLECTIONS[seed % HADITH_COLLECTIONS.length];
  const number = (Math.floor(seed / 7) % collection.maxNumber) + 1;
  return { collection, number };
}

export async function getDailyHadith(now = new Date()) {
  const day = todayKey(now);
  const cached = readCache(HADITH_CACHE_KEY, day);
  if (cached && !cached.stale) return cached;

  try {
    const { collection, number } = pickDailyHadith(day);
    // A few entries in the dataset have empty translation text (chapter
    // placeholders) — step forward to the next non-empty one.
    for (let candidate = number; candidate < number + 5 && candidate <= collection.maxNumber; candidate++) {
      const res = await fetch(
        `https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions/${collection.edition}/${candidate}.min.json`
      );
      if (!res.ok) continue;
      const json = await res.json();
      const hadith = json?.hadiths?.[0];
      const text = hadith?.text?.trim();
      if (!text) continue;
      // Safety net: these collections are sahih by compilation, but if the
      // dataset ever attaches an explicit non-sahih grade to an entry,
      // skip it rather than show it.
      const grades = hadith.grades || [];
      const explicitlyNotSahih = grades.some((g) => g?.grade && !/sahih/i.test(g.grade));
      if (explicitlyNotSahih) continue;
      const value = {
        text,
        collection: collection.name,
        hadithNumber: hadith.hadithnumber ?? candidate,
      };
      writeCache(HADITH_CACHE_KEY, day, value);
      return value;
    }
    throw new Error("No usable hadith at today's position");
  } catch {
    return cached?.stale ? cached.value : null;
  }
}
