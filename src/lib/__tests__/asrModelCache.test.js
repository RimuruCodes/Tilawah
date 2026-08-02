import { describe, it, expect, vi } from "vitest";
import { createModelCache } from "@/lib/asrModelCache";

// A fake "model" that models the real observable contract: not just
// whether dispose() was called, but whether a caller holding a reference
// can still actually USE it. Real usage (transcribeAudio calling the
// resolved transformers.js pipeline) is itself an async operation that
// takes real time — modeled here with one extra microtask tick before
// checking `disposed`, so the test doesn't depend on the precise
// microtask-ordering of resolution-vs-eviction (which is an implementation
// detail, not the actual contract worth pinning).
function makeFakeModel(id) {
  const model = {
    id,
    disposed: false,
    dispose: vi.fn(() => {
      model.disposed = true;
    }),
    use: async () => {
      await Promise.resolve(); // one tick, simulating real async inference work
      if (model.disposed) throw new Error(`used ${id} after it was disposed`);
      return `result-from-${id}`;
    },
  };
  return model;
}

describe("createModelCache — normal (non-racing) usage", () => {
  it("loads a model once and reuses the cached promise for repeat requests", async () => {
    const modelX = makeFakeModel("X");
    const loadFn = vi.fn().mockResolvedValue(modelX);
    const cache = createModelCache(loadFn);

    const a = await cache.get("X");
    const b = await cache.get("X");

    expect(a).toBe(modelX);
    expect(b).toBe(modelX);
    expect(loadFn).toHaveBeenCalledTimes(1);
  });

  it("passes extra args through to loadFn unchanged", async () => {
    const loadFn = vi.fn().mockResolvedValue(makeFakeModel("X"));
    const cache = createModelCache(loadFn);
    const onProgress = () => {};

    await cache.get("X", onProgress, true);

    expect(loadFn).toHaveBeenCalledWith("X", onProgress, true);
  });

  it("removes a failed load from the cache, allowing a retry", async () => {
    const loadFn = vi
      .fn()
      .mockRejectedValueOnce(new Error("network blip"))
      .mockResolvedValueOnce(makeFakeModel("X"));
    const cache = createModelCache(loadFn);

    await expect(cache.get("X")).rejects.toThrow("network blip");
    const model = await cache.get("X");

    expect(model.id).toBe("X");
    expect(loadFn).toHaveBeenCalledTimes(2);
  });
});

// Control case: the SAME modelId requested twice must never trigger
// eviction/dispose at all — only a genuinely DIFFERENT modelId does. This
// is the case that already worked correctly before reference-counting was
// added; it exists so the fix can't have accidentally started disposing
// (or double-counting release()s) on the common, already-correct path.
describe("createModelCache — same modelId requested twice (control, no eviction expected)", () => {
  it("never calls dispose when both requests are for the same modelId", async () => {
    let resolveX;
    const loadFn = vi.fn(() => new Promise((resolve) => { resolveX = resolve; }));
    const cache = createModelCache(loadFn);

    const aPromise = cache.get("X");
    const bPromise = cache.get("X"); // same modelId, before X resolves

    const modelX = makeFakeModel("X");
    resolveX(modelX);

    const [a, b] = await Promise.all([aPromise, bPromise]);

    expect(a).toBe(modelX);
    expect(b).toBe(modelX);
    expect(modelX.dispose).not.toHaveBeenCalled();
    expect(loadFn).toHaveBeenCalledTimes(1); // never loaded twice either

    // Both callers release; still shouldn't dispose (nothing evicted it).
    cache.release("X");
    cache.release("X");
    expect(modelX.dispose).not.toHaveBeenCalled();
  });
});

// The race asrModelCache.js was extracted specifically to fix (see the
// RACE CONDITION FOUND AND FIXED comment in asrWorker.js, 2026-08-01).
// Fixed via reference counting: get() increments an active-user count per
// modelId, release() decrements it, and an evicted model is only actually
// disposed once that count reaches zero.
describe("createModelCache — reference-counted eviction (fixed race)", () => {
  it("does not let a later request for a different modelId dispose a model an earlier caller is still using", async () => {
    let resolveX;
    const loadFn = vi.fn((modelId) => {
      if (modelId === "X") return new Promise((resolve) => { resolveX = resolve; });
      if (modelId === "Y") return Promise.resolve(makeFakeModel("Y"));
      throw new Error(`unexpected modelId: ${modelId}`);
    });
    const cache = createModelCache(loadFn);
    let modelXRef;

    // Caller A requests X, immediately awaits it (mirroring
    // ensureAsrModelLoaded's real `await getTranscriber(...)`), then uses
    // it, releasing only once truly done — the finally-equivalent
    // asrWorker.js's self.onmessage handlers use.
    const aResultPromise = (async () => {
      const model = await cache.get("X");
      modelXRef = model;
      try {
        return await model.use();
      } finally {
        cache.release("X");
      }
    })();

    // Before X resolves, caller B requests a DIFFERENT model Y on the same
    // cache — simulating the user changing their model preference in
    // Settings and starting a new analysis. B follows the same
    // get/use/release discipline.
    const modelY = await cache.get("Y");
    cache.release("Y");
    expect(modelY.dispose).not.toHaveBeenCalled(); // Y was never evicted

    // X's load finally completes. A still hasn't released it yet (still
    // inside `model.use()`'s own pending tick) -- eviction must NOT
    // dispose it out from under A.
    resolveX(makeFakeModel("X"));

    // The real, observable contract: caller A's own held reference must
    // remain valid and usable through to the point A's await resolves --
    // not just "was dispose() called at some point".
    await expect(aResultPromise).resolves.toBe("result-from-X");

    // Only NOW, after A actually released it, is disposal expected.
    expect(modelXRef.dispose).toHaveBeenCalledTimes(1);
  });

  it("still eventually disposes an evicted model even when the original caller's own usage fails (release() fires in a finally, not just on success)", async () => {
    let resolveX;
    const loadFn = vi.fn((modelId) => {
      if (modelId === "X") return new Promise((resolve) => { resolveX = resolve; });
      if (modelId === "Y") return Promise.resolve(makeFakeModel("Y"));
      throw new Error(`unexpected modelId: ${modelId}`);
    });
    const cache = createModelCache(loadFn);

    // Caller A's own downstream usage aborts (an analysis error, a thrown
    // exception, an abandoned run) -- but its OWN finally still calls
    // release(), exactly like asrWorker.js's self.onmessage handlers do
    // regardless of success or failure.
    const aResultPromise = (async () => {
      const model = await cache.get("X");
      try {
        throw new Error("analysis aborted");
      } finally {
        cache.release("X");
      }
    })();
    // Prevent this from ever surfacing as an unhandled rejection in the
    // test run -- the real assertion below awaits it properly.
    aResultPromise.catch(() => {});

    const modelY = await cache.get("Y"); // evicts X
    cache.release("Y");

    const modelX = makeFakeModel("X");
    resolveX(modelX);

    await expect(aResultPromise).rejects.toThrow("analysis aborted");

    // release() ran inside A's finally regardless of the throw above --
    // the evicted model must not leak just because its caller's own work
    // failed. (A couple of microtask ticks for the deferred dispose chain
    // to settle after release().)
    await Promise.resolve();
    await Promise.resolve();
    expect(modelX.dispose).toHaveBeenCalledTimes(1);
    expect(modelY.dispose).not.toHaveBeenCalled(); // Y was never evicted
  });
});
