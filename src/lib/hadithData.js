// Data layer for the Hadith section. Content policy (deliberate, see
// README "Hadith"): ONLY Sahih al-Bukhari and Sahih Muslim — collections
// whose entries are authentic (sahih) by their compilers' methodology and
// mainstream scholarly consensus. The grading is the source collections'
// classification, not this app's judgment. As a safety net, any entry the
// dataset ever explicitly grades as something other than sahih is dropped
// rather than shown (currently zero such entries in either collection).
//
// Source: fawazahmed0/hadith-api on the jsDelivr CDN (keyless, CORS-open,
// compiled from sunnah.com / al-maktaba.org and similar). Book names and
// hadith-number ranges are baked into hadithBooks.json at build time (they
// never change); hadith text is fetched per-book (small files) with the
// full-collection download reserved for explicit search.
import HADITH_BOOKS from "@/lib/hadithBooks.json";

const CDN = "https://cdn.jsdelivr.net/gh/fawazahmed0/hadith-api@1/editions";

export const HADITH_COLLECTIONS = [
  { id: "bukhari", name: "Sahih al-Bukhari", english: "eng-bukhari", arabic: "ara-bukhari" },
  { id: "muslim", name: "Sahih Muslim", english: "eng-muslim", arabic: "ara-muslim" },
];

export function getBooks(collectionId) {
  return HADITH_BOOKS[collectionId] || [];
}

// Drops entries that are unusable or fail the authenticity safety net.
export function usableHadith(hadith) {
  if (!hadith?.text || !hadith.text.trim()) return false;
  const grades = hadith.grades || [];
  return !grades.some((g) => g?.grade && !/sahih/i.test(g.grade));
}

const bookCache = new Map(); // `${collectionId}:${bookNumber}` -> entries

// One book's hadith, English + Arabic zipped by hadith number.
export async function getBookHadiths(collectionId, bookNumber) {
  const cacheKey = `${collectionId}:${bookNumber}`;
  if (bookCache.has(cacheKey)) return bookCache.get(cacheKey);

  const collection = HADITH_COLLECTIONS.find((c) => c.id === collectionId);
  if (!collection) throw new Error(`Unknown collection: ${collectionId}`);

  const [engRes, araRes] = await Promise.all([
    fetch(`${CDN}/${collection.english}/sections/${bookNumber}.min.json`),
    fetch(`${CDN}/${collection.arabic}/sections/${bookNumber}.min.json`),
  ]);
  if (!engRes.ok) throw new Error(`Couldn't load this book (HTTP ${engRes.status}).`);
  const eng = await engRes.json();
  // Arabic is enrichment — a failed fetch degrades to English-only.
  const ara = araRes.ok ? await araRes.json() : { hadiths: [] };
  const arabicByNumber = new Map(ara.hadiths.map((h) => [h.hadithnumber, h.text]));

  const entries = eng.hadiths.filter(usableHadith).map((h) => ({
    number: h.hadithnumber,
    english: h.text.trim(),
    arabic: arabicByNumber.get(h.hadithnumber) || null,
    book: bookNumber,
  }));
  bookCache.set(cacheKey, entries);
  return entries;
}

// Full-collection text search. Downloads the whole English edition once
// (~4-5MB, kept in memory only) — callers gate this behind an explicit
// user action and say so in the UI.
const fullCollectionCache = new Map();

async function getFullCollection(collectionId) {
  if (fullCollectionCache.has(collectionId)) return fullCollectionCache.get(collectionId);
  const collection = HADITH_COLLECTIONS.find((c) => c.id === collectionId);
  const res = await fetch(`${CDN}/${collection.english}.min.json`);
  if (!res.ok) throw new Error(`Couldn't download the collection (HTTP ${res.status}).`);
  const json = await res.json();
  const entries = json.hadiths.filter(usableHadith).map((h) => ({
    number: h.hadithnumber,
    english: h.text.trim(),
    arabic: null, // fetched lazily per result set would be overkill for search
    book: h.reference?.book,
  }));
  fullCollectionCache.set(collectionId, entries);
  return entries;
}

export function isCollectionLoadedForSearch(collectionId) {
  return fullCollectionCache.has(collectionId);
}

export async function searchCollection(collectionId, query, limit = 50) {
  const q = query.trim().toLowerCase();
  if (q.length < 3) return [];
  const entries = await getFullCollection(collectionId);
  const results = [];
  for (const entry of entries) {
    if (entry.english.toLowerCase().includes(q)) {
      results.push(entry);
      if (results.length >= limit) break;
    }
  }
  return results;
}
