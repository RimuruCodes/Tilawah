// Pure, worker-independent model-cache logic used by asrWorker.js: only ONE
// model may be resident at a time (switching models used to leave the old
// one loaded alongside the new one -- a guaranteed OOM on memory-
// constrained devices), so requesting a new modelId evicts every other
// cached entry.
//
// Extracted from asrWorker.js's getTranscriber (2026-08-01 code audit) so
// the eviction/dispose sequencing itself is testable without a real Worker,
// real model downloads, or real timers -- see asrModelCache.test.js.
//
// Reference-counted (2026-08-01, same-day follow-up): eviction alone isn't
// safe to dispose on -- a caller can still be holding/using an evicted
// model's reference when the newer request's load resolves (the exact race
// asrModelCache.test.js's "KNOWN BUG" case originally pinned down). Every
// `get(modelId)` call increments that modelId's active-user count; the
// MATCHING caller must call `release(modelId)` exactly once when done
// (success OR failure -- a finally-equivalent, never conditional on the
// outcome), or the count never reaches zero and an evicted-but-still-
// referenced model leaks its wasm memory forever instead of ever being
// disposed. An evicted model is only actually disposed once its count
// reaches zero, whether that happens before or after the eviction itself
// is noticed (both orderings are handled -- see asrModelCache.test.js).
//
// `loadFn(modelId, ...args)` is supplied by the caller and must return a
// Promise resolving to the loaded model -- a real transformers.js pipeline
// in production, an opaque fake object with a `dispose` method in tests.
// Extra args are passed through unchanged (asrWorker.js uses this for
// onProgress/allowWebGpu; tests don't need any).
export function createModelCache(loadFn) {
  const cache = new Map(); // modelId -> Promise<model>, the current "live" slot
  const activeUsers = new Map(); // modelId -> count of get() calls not yet release()'d
  const pendingDisposal = new Map(); // modelId -> Promise<model>, evicted from `cache`
  // but still in use when eviction happened; disposed once release() drops
  // that modelId's count to zero.

  // Known, accepted, narrow limitation: if a modelId already awaiting
  // disposal in `pendingDisposal` is requested again via get() before it's
  // actually disposed (re-loading the exact same modelId while its
  // just-evicted zombie generation is still outstanding), its active-user
  // count is shared with the fresh generation's callers rather than
  // tracked separately. This delays that zombie's disposal until every
  // caller of BOTH generations has released, rather than exactly when its
  // own original caller finishes -- conservative, not incorrect: no
  // double-dispose, no wrong-instance-disposed, no permanent leak, just
  // later cleanup than ideal. Not fixed here: it's rarer than the race
  // this module exists to solve, wasn't part of what was asked, and
  // doesn't corrupt anything -- flagging it honestly rather than silently
  // assuming it can't happen.

  function get(modelId, ...loadArgs) {
    activeUsers.set(modelId, (activeUsers.get(modelId) || 0) + 1);
    if (!cache.has(modelId)) {
      for (const [otherId, otherPromise] of cache) {
        cache.delete(otherId);
        otherPromise.then((model) => {
          if ((activeUsers.get(otherId) || 0) > 0) {
            // A caller's get(otherId) hasn't been release()'d yet -- defer
            // disposal to release(), instead of disposing it out from
            // under whoever is still holding/using this reference.
            pendingDisposal.set(otherId, otherPromise);
            return;
          }
          model?.dispose?.();
        }).catch(() => {});
      }
      const promise = loadFn(modelId, ...loadArgs).catch((err) => {
        cache.delete(modelId); // allow retry on next call
        throw err;
      });
      cache.set(modelId, promise);
    }
    return cache.get(modelId);
  }

  // Must be called exactly once for every get() call, once the caller is
  // done with that model -- success OR failure, a finally-equivalent.
  function release(modelId) {
    const count = activeUsers.get(modelId) || 0;
    if (count <= 0) return; // defensive: no-op on an unmatched/extra release
    if (count > 1) {
      activeUsers.set(modelId, count - 1);
      return;
    }
    activeUsers.delete(modelId);
    const pending = pendingDisposal.get(modelId);
    if (pending) {
      pendingDisposal.delete(modelId);
      pending.then((model) => model?.dispose?.()).catch(() => {});
    }
  }

  return { get, release };
}
