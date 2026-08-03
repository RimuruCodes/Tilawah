// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";

function makeLocalStorageStub() {
  const store = new Map();
  return {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
    clear: () => store.clear(),
  };
}
vi.stubGlobal("localStorage", makeLocalStorageStub());

// Minimal Cache Storage API double -- jsdom/node don't provide a real one.
// Real enough to exercise put/match/delete semantics faithfully: separate
// named buckets, keyed by request URL.
function makeCachesStub() {
  const stores = new Map(); // cacheName -> Map<url, response>
  const api = {
    async open(name) {
      if (!stores.has(name)) stores.set(name, new Map());
      const store = stores.get(name);
      return {
        async put(request, response) {
          const url = typeof request === "string" ? request : request.url;
          store.set(url, response);
        },
        async match(request) {
          const url = typeof request === "string" ? request : request.url;
          return store.get(url);
        },
        async keys() {
          return [...store.keys()].map((url) => ({ url }));
        },
      };
    },
    async delete(name) {
      return stores.delete(name);
    },
    _stores: stores, // test-only escape hatch
  };
  return api;
}

function makeFakeResponse({ ok = true, status = 200, contentLength = 1000 } = {}) {
  return {
    ok,
    status,
    headers: { get: (name) => (name.toLowerCase() === "content-length" ? String(contentLength) : null) },
    clone() {
      return makeFakeResponse({ ok, status, contentLength });
    },
    async blob() {
      return { size: contentLength, __fake: true };
    },
  };
}

const {
  cacheNameForReciter,
  formatBytes,
  estimatedPackSizeBytes,
  estimatedPackSizeLabel,
  downloadReciterPack,
  deletePack,
  getOfflineAudioBlob,
  getDownloadedPack,
} = await import("@/lib/offlinePacks");
const { getAudioUrl } = await import("@/lib/quranData");

// Two tiny fake "surahs" (not real Quran data) so tests exercise a handful
// of ayahs instead of the real 6,236 -- downloadReciterPack's `surahs`
// param exists specifically as this testing seam (see its own doc comment).
const TINY_SURAHS = [
  { number: 900, ayahs: 2 },
  { number: 901, ayahs: 1 },
];

beforeEach(() => {
  localStorage.clear();
  vi.stubGlobal("caches", makeCachesStub());
});

describe("cacheNameForReciter / formatBytes / size estimate", () => {
  it("names the cache distinctly per reciter folder", () => {
    expect(cacheNameForReciter("Husary_128kbps")).toBe("offline-pack-Husary_128kbps");
    expect(cacheNameForReciter("Husary_128kbps")).not.toBe(cacheNameForReciter("Alafasy_128kbps"));
  });

  it("formats bytes as MB below 1GB and GB at/above it", () => {
    expect(formatBytes(50 * 1024 * 1024)).toBe("50 MB");
    expect(formatBytes(1.5 * 1024 * 1024 * 1024)).toBe("1.5 GB");
  });

  it("estimates a larger size for a 192kbps reciter than a 128kbps one", () => {
    expect(estimatedPackSizeBytes("Abdul_Basit_Murattal_192kbps")).toBeGreaterThan(
      estimatedPackSizeBytes("Alafasy_128kbps")
    );
    expect(estimatedPackSizeLabel("Alafasy_128kbps")).toMatch(/MB|GB/);
  });
});

describe("downloadReciterPack", () => {
  it("downloads every ayah in range, tracks real progress, and records a pack", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeFakeResponse({ contentLength: 1000 })));
    const progressCalls = [];

    const result = await downloadReciterPack("Test_128kbps", "Test Reciter", {
      surahs: TINY_SURAHS,
      onProgress: (p) => progressCalls.push({ ...p }),
    });

    expect(result.cancelled).toBe(false);
    expect(result.completed).toBe(3); // 2 + 1 ayahs across the two tiny surahs
    expect(result.failed).toBe(0);
    expect(result.bytesDownloaded).toBe(3000);

    // Progress genuinely advanced, not just a single final call.
    expect(progressCalls.length).toBeGreaterThanOrEqual(3);
    expect(progressCalls[progressCalls.length - 1].completed).toBe(3);
    expect(progressCalls.every((p) => p.total === 3)).toBe(true);

    // A real cache entry exists for every ayah URL in the range.
    const cache = await caches.open(cacheNameForReciter("Test_128kbps"));
    for (const surah of TINY_SURAHS) {
      for (let a = 1; a <= surah.ayahs; a++) {
        const url = getAudioUrl("Test_128kbps", surah.number, a);
        await expect(cache.match(url)).resolves.toBeDefined();
      }
    }

    const pack = await getDownloadedPack("Test_128kbps");
    expect(pack).toMatchObject({ reciter_folder: "Test_128kbps", reciter_name: "Test Reciter", size_bytes: 3000, ayah_count: 3, failed_count: 0 });
  });

  it("a single ayah failing doesn't fail the whole download -- counted and the rest still downloads", async () => {
    let call = 0;
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        call++;
        // The 2nd request (any ayah) fails; the rest succeed.
        if (call === 2) return makeFakeResponse({ ok: false, status: 404, contentLength: 0 });
        return makeFakeResponse({ contentLength: 500 });
      })
    );

    const result = await downloadReciterPack("Test_128kbps", "Test Reciter", { surahs: TINY_SURAHS, concurrency: 1 });

    expect(result.cancelled).toBe(false);
    expect(result.completed).toBe(3);
    expect(result.failed).toBe(1);
    expect(result.bytesDownloaded).toBe(1000); // 2 successes * 500, the failure contributes 0

    const pack = await getDownloadedPack("Test_128kbps");
    expect(pack.ayah_count).toBe(2); // 3 total minus 1 failed
    expect(pack.failed_count).toBe(1);
  });

  it("cancelling mid-download cleans up the partial cache and records no pack", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeFakeResponse({ contentLength: 1000 })));
    const controller = new AbortController();
    // Abort before the download loop even starts its first batch --
    // deterministic without needing real timing races.
    controller.abort();

    const result = await downloadReciterPack("Test_128kbps", "Test Reciter", {
      surahs: TINY_SURAHS,
      signal: controller.signal,
    });

    expect(result.cancelled).toBe(true);
    expect(await getDownloadedPack("Test_128kbps")).toBeNull();
    // The cache itself was cleaned up, not left as an orphaned partial pack.
    const cache = await caches.open(cacheNameForReciter("Test_128kbps"));
    expect(await cache.keys()).toHaveLength(0);
  });
});

describe("deletePack", () => {
  it("removes both the cache entries and the metadata record", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeFakeResponse({ contentLength: 1000 })));
    await downloadReciterPack("Test_128kbps", "Test Reciter", { surahs: TINY_SURAHS });
    expect(await getDownloadedPack("Test_128kbps")).not.toBeNull();

    await deletePack("Test_128kbps");

    expect(await getDownloadedPack("Test_128kbps")).toBeNull();
    const cache = await caches.open(cacheNameForReciter("Test_128kbps"));
    expect(await cache.keys()).toHaveLength(0);
  });
});

describe("getOfflineAudioBlob", () => {
  it("returns a blob for a downloaded ayah and null for one that was never downloaded", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => makeFakeResponse({ contentLength: 777 })));
    await downloadReciterPack("Test_128kbps", "Test Reciter", { surahs: TINY_SURAHS });

    const blob = await getOfflineAudioBlob("Test_128kbps", 900, 1);
    expect(blob).toMatchObject({ size: 777 });

    // Ayah 999:1 was never part of the downloaded range.
    expect(await getOfflineAudioBlob("Test_128kbps", 999, 1)).toBeNull();
    // A reciter with no pack at all.
    expect(await getOfflineAudioBlob("Never_Downloaded_128kbps", 900, 1)).toBeNull();
  });

  it("never throws even if the Cache Storage API itself errors", async () => {
    vi.stubGlobal("caches", {
      open: async () => {
        throw new Error("simulated Cache Storage failure");
      },
    });
    await expect(getOfflineAudioBlob("Test_128kbps", 900, 1)).resolves.toBeNull();
  });
});
