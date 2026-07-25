// Device-local cache for ASR-ESTIMATED reference-audio word timing (see
// estimateReferenceWordTiming in recitationService.js), keyed by
// (reciter, surah, ayah). This is the first IndexedDB usage in the app —
// everything else uses localStorage (see localDb.js).
//
// Purely a performance cache for a fully regenerable result: it never
// holds user data, is never part of exportUserData/importUserData, and is
// safe to evict or fail to write at any time. Every operation degrades to
// "no cached data" on ANY failure — IndexedDB unavailable (older browsers,
// some in-app webviews), a private-browsing quota refusal, a blocked
// upgrade, a corrupt database — so a storage problem can only ever mean
// "highlighting isn't offered for this ayah this time", never a thrown
// error or blocked playback.
const DB_NAME = "tilawah_word_timing_cache";
const DB_VERSION = 1;
const STORE = "estimated_word_timings";

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === "undefined") {
      resolve(null);
      return;
    }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE);
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function cacheKey(reciterFolder, surahNumber, ayahNumber) {
  return `${reciterFolder}:${surahNumber}:${ayahNumber}`;
}

// Returns { words, cachedAt } for this ayah, or null on any miss or
// failure (including IndexedDB being unavailable) — never throws.
export async function getCachedWordTimings(reciterFolder, surahNumber, ayahNumber) {
  try {
    const db = await openDb();
    if (!db) return null;
    return await new Promise((resolve) => {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).get(cacheKey(reciterFolder, surahNumber, ayahNumber));
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

// Best-effort write. A failure here (quota exceeded, private browsing,
// etc.) is swallowed: the estimate already computed this session is still
// usable, it just won't be there next time. Returns true/false, never
// throws.
export async function setCachedWordTimings(reciterFolder, surahNumber, ayahNumber, words) {
  try {
    const db = await openDb();
    if (!db) return false;
    return await new Promise((resolve) => {
      try {
        const tx = db.transaction(STORE, "readwrite");
        tx.objectStore(STORE).put({ words, cachedAt: Date.now() }, cacheKey(reciterFolder, surahNumber, ayahNumber));
        tx.oncomplete = () => resolve(true);
        tx.onerror = () => resolve(false);
        tx.onabort = () => resolve(false);
      } catch {
        resolve(false);
      }
    });
  } catch {
    return false;
  }
}
