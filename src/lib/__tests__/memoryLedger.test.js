import { describe, it, expect, beforeEach } from "vitest";
import { trackBuffer, releaseBuffer, describeMemoryCheckpoint, clearLedgerForTests } from "@/lib/memoryLedger";

// The ledger is crash evidence: on iOS (no heap API) the lifecycle log's
// memory checkpoint is the ONLY record of what the app still referenced
// when the tab died at ASR session creation. Its claims must be exact.
describe("memoryLedger", () => {
  beforeEach(() => clearLedgerForTests());

  it("reports tracked buffers with sizes in MB", () => {
    trackBuffer("user-samples", 4 * 16000 * 60); // 60s mono float32 @16kHz
    trackBuffer("reference-samples", 8 * 1048576);
    const note = describeMemoryCheckpoint();
    expect(note).toContain("user-samples=3.7MB");
    expect(note).toContain("reference-samples=8.0MB");
  });

  it("a released buffer disappears from the checkpoint — dereference must be provable", () => {
    trackBuffer("reference-samples", 8 * 1048576);
    releaseBuffer("reference-samples");
    expect(describeMemoryCheckpoint()).toContain("no app-tracked buffers held");
  });

  it("re-tracking a name overwrites rather than accumulates (one recording at a time)", () => {
    trackBuffer("user-samples", 1048576);
    trackBuffer("user-samples", 2 * 1048576);
    const note = describeMemoryCheckpoint();
    expect(note).toContain("user-samples=2.0MB");
    expect(note.match(/user-samples/g)).toHaveLength(1);
  });

  it("always states whether the JS heap was measurable", () => {
    // jsdom has no performance.memory — the checkpoint must say so rather
    // than omit the subject (mirrors iOS Safari, where this is the norm).
    expect(describeMemoryCheckpoint()).toMatch(/jsHeap=/);
  });
});
