// Phase 5: lets a subscriber download a reciter's full Quran audio for
// offline use. Deliberately uses a SEPARATE Cache Storage bucket per
// reciter (`offline-pack-<folder>`) rather than the existing
// `reciter-audio-cache-v2` (see vite.config.js) -- that cache is workbox's
// incidental, LRU-evictable cache for "recently played ayahs stay fast"
// (capped at 1000 entries), not built for guaranteeing a deliberate,
// ~600-900MB, 6,236-file download survives normal playback of OTHER
// reciters. Kept fully separate so per-reciter delete is exact and normal
// playback can never silently evict part of a paid-for offline pack.
//
// Playback wiring: AudioPlayer.jsx explicitly checks getOfflineAudioBlob()
// before falling back to the plain remote URL -- not relying on workbox
// routing, which only knows about reciter-audio-cache-v2. Explicit and
// debuggable, matching this app's history of audio-pipeline bugs being
// subtle and hard to diagnose after the fact.
//
// Entitlement: gates STARTING a new download only (see
// GATED_FEATURES.OFFLINE_RECITER_PACKS in entitlements.js) -- an
// already-downloaded pack keeps working even if the subscription later
// lapses. Re-checking on every playback would require being online, which
// defeats the actual point of "offline."
//
// Known, accepted limitation: OfflinePack metadata (this module's
// bookkeeping) is scoped per local account like the rest of localDb, but
// the underlying Cache Storage entries are origin-wide, not per-account. On
// a device shared by multiple local accounts (uncommon -- this is a
// single-user PWA in its primary use case), a second account could
// theoretically reuse another account's already-cached audio without its
// own OfflinePack record reflecting it. Not solved here: narrow, harmless
// (no data corruption, just an accounting quirk), and flagged honestly
// rather than silently assumed away.
import { getAudioUrl, SURAHS } from "@/lib/quranData";
import { OfflinePack } from "@/lib/localDb";

export function cacheNameForReciter(reciterFolder) {
  return `offline-pack-${reciterFolder}`;
}

export function formatBytes(bytes) {
  if (bytes >= 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}

// Approximate size shown BEFORE a real download starts (the real size is
// only known from actual Content-Length headers as the download runs) --
// derived from real measured file sizes across a 128kbps and a 192kbps
// reciter (samples taken directly from everyayah.com, including the
// Quran's longest ayah, 2:282, to avoid understating the estimate), not
// guessed. See the Phase 5 proposal for the measurement.
export function estimatedPackSizeBytes(reciterFolder) {
  const is192 = reciterFolder.includes("192kbps");
  return is192 ? 800 * 1024 * 1024 : 620 * 1024 * 1024;
}

export function estimatedPackSizeLabel(reciterFolder) {
  return formatBytes(estimatedPackSizeBytes(reciterFolder));
}

export async function getDownloadedPack(reciterFolder) {
  const records = await OfflinePack.filter({ reciter_folder: reciterFolder });
  return records[0] || null;
}

export async function listDownloadedPacks() {
  return OfflinePack.list("-downloaded_at");
}

// Best-effort: asks the browser not to evict this origin's storage under
// disk pressure. Even when granted, no browser guarantees absolute
// permanence -- callers should never claim more certainty than that.
export async function requestPersistentStorage() {
  if (!navigator.storage?.persist) return false;
  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

// Downloads every ayah of a reciter's audio into its own dedicated cache.
// Small concurrent batches (not all 6,236 requests at once, not fully
// sequential either) -- reasonable on mobile network/battery, and frequent
// enough progress reporting to drive a real progress bar. A single ayah
// failing does not fail the whole download -- counted and reported, the
// rest of the pack still downloads (graceful degradation, same philosophy
// as the rest of this app's error handling).
//
// `surahs` defaults to the whole Quran (the only mode the UI exposes, per
// the approved Phase 5 scope) but accepts a smaller list -- purely a
// testing seam so tests can exercise this without 6,236 real requests, not
// a user-facing "partial download" feature.
export async function downloadReciterPack(
  reciterFolder,
  reciterName,
  { onProgress, signal, surahs = SURAHS, concurrency = 4 } = {}
) {
  await requestPersistentStorage();
  const cache = await caches.open(cacheNameForReciter(reciterFolder));

  const urls = [];
  for (const surah of surahs) {
    for (let ayah = 1; ayah <= surah.ayahs; ayah++) {
      urls.push(getAudioUrl(reciterFolder, surah.number, ayah));
    }
  }

  let completed = 0;
  let failed = 0;
  let bytesDownloaded = 0;
  const total = urls.length;

  async function downloadOne(url) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const size = Number(response.headers.get("content-length")) || 0;
      await cache.put(url, response.clone());
      bytesDownloaded += size;
    } catch {
      failed++;
    } finally {
      completed++;
      onProgress?.({ completed, total, failed, bytesDownloaded });
    }
  }

  for (let i = 0; i < urls.length; i += concurrency) {
    if (signal?.aborted) break;
    const batch = urls.slice(i, i + concurrency);
    await Promise.all(batch.map(downloadOne));
  }

  if (signal?.aborted) {
    // Cancelled mid-way: clean up the partial cache rather than leaving an
    // incomplete, unlisted pack silently taking up space.
    await caches.delete(cacheNameForReciter(reciterFolder));
    return { cancelled: true };
  }

  const record = await OfflinePack.create({
    reciter_folder: reciterFolder,
    reciter_name: reciterName,
    downloaded_at: new Date().toISOString(),
    size_bytes: bytesDownloaded,
    ayah_count: total - failed,
    failed_count: failed,
  });

  return { cancelled: false, record, completed, failed, bytesDownloaded };
}

export async function deletePack(reciterFolder) {
  await caches.delete(cacheNameForReciter(reciterFolder));
  const records = await OfflinePack.filter({ reciter_folder: reciterFolder });
  for (const r of records) await OfflinePack.delete(r.id);
}

// Looks up one ayah in a reciter's downloaded pack, if any -- used by
// AudioPlayer.jsx to prefer offline audio over the network when available.
// Returns null (never rejects) on any miss/error, so callers can always
// safely fall back to the plain remote URL unchanged.
export async function getOfflineAudioBlob(reciterFolder, surahNumber, ayahNumber) {
  if (typeof caches === "undefined") return null;
  try {
    const cache = await caches.open(cacheNameForReciter(reciterFolder));
    const url = getAudioUrl(reciterFolder, surahNumber, ayahNumber);
    const response = await cache.match(url);
    if (!response) return null;
    return await response.blob();
  } catch {
    return null;
  }
}
