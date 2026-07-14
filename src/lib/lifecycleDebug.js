// TEMPORARY diagnostic instrumentation for the mobile "page reloads instead
// of showing the result" bug. Records page-lifecycle and service-worker
// events to BOTH the console and a persisted localStorage ring buffer —
// on a phone, a reload wipes the console, so persistence is the only way
// to read what happened afterwards (Settings shows the buffer under
// "Lifecycle debug log"). Remove this module once the cause is confirmed.

const EVENTS_KEY = "qc_lifecycle_debug";
const INFLIGHT_KEY = "qc_analysis_inflight";
const MAX_EVENTS = 60;

let currentPhase = "idle";

function readEvents() {
  try {
    return JSON.parse(localStorage.getItem(EVENTS_KEY) || "[]");
  } catch {
    return [];
  }
}

export function recordLifecycleEvent(type, detail = "") {
  const entry = {
    t: new Date().toISOString(),
    type,
    detail,
    phase: currentPhase,
  };
  console.log(`[lifecycle] ${entry.t} ${type}${detail ? ` (${detail})` : ""} — phase: ${currentPhase}`);
  try {
    const events = readEvents();
    events.push(entry);
    localStorage.setItem(EVENTS_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // storage full/unavailable — console logging already happened
  }
}

// Called by the recording modals on every state change so each recorded
// event knows what the app was doing at that moment.
export function setLifecyclePhase(phase) {
  if (phase === currentPhase) return;
  currentPhase = phase;
  recordLifecycleEvent("phase", phase);
  // Sync marker: if the tab dies (OOM kill, crash, reload) while an
  // analysis is in flight, this survives into the next load and proves the
  // session ended mid-analysis rather than completing.
  try {
    if (/analyzing|transcribing/.test(phase)) {
      localStorage.setItem(INFLIGHT_KEY, JSON.stringify({ phase, since: new Date().toISOString() }));
    } else {
      localStorage.removeItem(INFLIGHT_KEY);
    }
  } catch { /* ignore */ }
}

export function getLifecycleEvents() {
  return readEvents();
}

export function clearLifecycleEvents() {
  localStorage.removeItem(EVENTS_KEY);
}

// Wire up listeners once at app start.
export function initLifecycleDebug() {
  // Did the previous session die mid-analysis? (The marker is only ever
  // cleared by reaching the result/error/idle state.)
  try {
    const inflight = JSON.parse(localStorage.getItem(INFLIGHT_KEY) || "null");
    if (inflight) {
      // Before recording the marker, look at the tail of the PREVIOUS
      // session's events: if the last checkpoint was an unfinished ASR
      // stage, flag it — asrEngine then defaults to skipping ASR on this
      // device rather than crashing the same way again (a dead tab can't
      // catch its own errors; not starting the stage is the only real
      // protection). Key literal matches ASR_CRASH_SUSPECT_KEY in
      // asrEngine.js (not imported, to avoid a circular dependency).
      const prior = readEvents();
      // Only actual in-flight stage markers count as "died mid-ASR".
      // Informational asr-* events (asr-gate, asr-stalled, a previous
      // asr-crash-suspected) must never re-latch the flag.
      const ASR_STAGE_EVENT = /^asr-(load-start|download-started|download-complete|inference-start|load-complete|load-error|inference-complete|inference-error)$/;
      const lastAsr = [...prior].reverse().find((e) => ASR_STAGE_EVENT.test(e.type));
      if (lastAsr && !/complete|error/.test(lastAsr.type)) {
        localStorage.setItem("qc_asr_crash_suspected", `${lastAsr.type} at ${lastAsr.t}`);
        recordLifecycleEvent(
          "asr-crash-suspected",
          `previous session died after "${lastAsr.type}" — speech recognition now defaults OFF on this device (re-enable in Settings)`
        );
      }
      recordLifecycleEvent(
        "PREVIOUS-SESSION-DIED-MID-ANALYSIS",
        `was in "${inflight.phase}" since ${inflight.since} — the tab was killed/reloaded before the analysis finished`
      );
      localStorage.removeItem(INFLIGHT_KEY);
    }
  } catch { /* ignore */ }

  recordLifecycleEvent("load", `visibility=${document.visibilityState}`);

  window.addEventListener("pagehide", (e) => {
    // persisted=true means the page went into the back/forward cache (may
    // come back); persisted=false means it's being discarded for real.
    recordLifecycleEvent("pagehide", `persisted=${e.persisted}`);
  });
  document.addEventListener("visibilitychange", () => {
    recordLifecycleEvent("visibilitychange", document.visibilityState);
  });

  // A controller change means a (new) service worker took over this page —
  // if one fires mid-recitation, the SW/update path is implicated. On the
  // dev server no SW ever registers, so any such event would be a surprise
  // worth knowing about.
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.addEventListener("controllerchange", () => {
      recordLifecycleEvent("sw-controllerchange", "a service worker took control of this page");
    });
  }
}
