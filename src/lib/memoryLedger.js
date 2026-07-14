// Diagnostic ledger of the large buffers the app is KNOWINGLY holding, so
// the lifecycle log can state — at the exact moment the ASR inference
// session is created (the memory spike that kills mobile tabs) — what was
// still referenced. "Eligible for GC" and "dereferenced" are different
// claims; entries here are added when a buffer is created and removed only
// when the owning code explicitly drops its reference, so a stale entry in
// a crash log points at a real retention, not a GC timing artifact.
//
// iOS Safari exposes no heap-measurement API (performance.memory is
// Chrome-only), so this self-accounting is the only memory evidence a
// phone crash log can carry.

const held = new Map(); // name -> bytes

export function trackBuffer(name, bytes) {
  held.set(name, bytes);
}

export function releaseBuffer(name) {
  held.delete(name);
}

export function describeMemoryCheckpoint() {
  const parts = [...held.entries()].map(([name, bytes]) => `${name}=${(bytes / 1048576).toFixed(1)}MB`);
  const ledger = parts.length ? `app buffers held: ${parts.join(", ")}` : "no app-tracked buffers held";
  const mem = typeof performance !== "undefined" ? performance.memory : undefined;
  const heap = mem
    ? `jsHeap=${Math.round(mem.usedJSHeapSize / 1048576)}MB used of ${Math.round(mem.jsHeapSizeLimit / 1048576)}MB limit`
    : "jsHeap=unmeasurable on this browser";
  return `${ledger}; ${heap}`;
}

// Test hook: the ledger is module-global state.
export function clearLedgerForTests() {
  held.clear();
}
