// Per-ayah study content for the reader: tafsir (commentary) and
// word-by-word meanings. Both fetch lazily on first open and cache
// in-memory for the session (an opened ayah re-opens instantly; nothing
// is fetched for ayahs never opened).
//
// Sources — chosen and caveated in the Phase 1/2 research report:
//  - Tafsir: Tafsir Ibn Kathir (Abridged, English) from the spa5k/tafsir_api
//    static dataset on jsDelivr (per-ayah JSON, CORS-open, keyless). ONE
//    scholarly perspective by design — the UI says so.
//  - Word-by-word: quran.com's public v4 API (per-word Uthmani text,
//    English meaning, transliteration; no morphology roots — the only open
//    root data is corpus.quran.com's GPL dump, which has no API).

const TAFSIR_CDN = "https://cdn.jsdelivr.net/gh/spa5k/tafsir_api@main/tafsir/en-tafisr-ibn-kathir";
const WORDS_API = "https://api.qurancdn.com/api/v4/verses/by_key";

export const TAFSIR_ATTRIBUTION = {
  work: "Tafsir Ibn Kathir (Abridged)",
  author: "Hafiz Ibn Kathir",
  note: "One classical scholarly perspective — not the only one. English abridgment via the Quran.com / spa5k dataset.",
};

const tafsirCache = new Map(); // "s:a" -> text | null
const wordsCache = new Map(); // "s:a" -> [{arabic, meaning, transliteration}] | null

export async function getTafsir(surahNumber, ayahNumber) {
  const key = `${surahNumber}:${ayahNumber}`;
  if (tafsirCache.has(key)) return tafsirCache.get(key);
  try {
    const res = await fetch(`${TAFSIR_CDN}/${surahNumber}/${ayahNumber}.json`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const text = json?.text?.trim() || null;
    tafsirCache.set(key, text);
    return text;
  } catch {
    // Not cached as null on network failure — a retry after reconnecting
    // should get another chance.
    return null;
  }
}

// Filters the API's word list down to actual words (it also returns the
// ayah-number glyph as a pseudo-word with char_type_name "end").
export function toWordEntries(apiWords) {
  return (apiWords || [])
    .filter((w) => w.char_type_name === "word" && w.text_uthmani)
    .map((w) => ({
      arabic: w.text_uthmani,
      meaning: w.translation?.text || "",
      transliteration: w.transliteration?.text || "",
    }));
}

export async function getWordMeanings(surahNumber, ayahNumber) {
  const key = `${surahNumber}:${ayahNumber}`;
  if (wordsCache.has(key)) return wordsCache.get(key);
  try {
    const res = await fetch(
      `${WORDS_API}/${surahNumber}:${ayahNumber}?words=true&word_fields=text_uthmani&word_translation_language=en`
    );
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = await res.json();
    const entries = toWordEntries(json?.verse?.words);
    wordsCache.set(key, entries.length ? entries : null);
    return entries.length ? entries : null;
  } catch {
    return null;
  }
}
