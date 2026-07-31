// Pure timing rules for the ASR stall watchdog in transcribeUserRecording.
// Extracted so deadline selection and suspension detection are unit-testable
// without a worker or a browser.

// After the model download reaches 100%, the next step is inference-session
// creation — a bounded operation (seconds), and the exact spot iOS tends to
// freeze under memory / Low Power Mode pressure. It gets its own short
// ceiling instead of inheriting the long, audio-scaled inference ceiling.
export const ASR_LOAD_CEILING_MS = 45_000;

// The watchdog ticks every 2s; a gap several times larger means the tab was
// frozen/throttled (backgrounding, Low Power Mode) rather than merely slow —
// the timer-based watchdog can't be trusted through that, so we note it and
// re-check on resume.
export const ASR_SUSPEND_GAP_MS = 6_000;

// Inference emits no progress events, so its budget scales with audio length
// (10x real-time), floored to 180s and capped at 360s to stay sane.
export function inferenceCeilingMs(audioSec) {
  return Math.min(Math.max(audioSec * 10, 180), 360) * 1000;
}

// Real-device crash logs show the page silently reloading 5-11s after
// inference starts, specifically on iOS/WebKit running the "accurate"
// model — far too fast for inferenceCeilingMs (>=180s) to ever catch, and
// inference emits no progress events to hook a smarter deadline to (see
// stallReasonCode below), so this is a flat ceiling rather than a scaled
// one. It's deliberately scoped to ONLY the iOS+accurate combination (see
// isRiskyInference) rather than applied everywhere: a 10s ceiling would
// false-positive-abort plenty of legitimate longer runs on other
// device/model combinations, which never showed this failure.
//
// Chosen from the observed 5-11s crash range: by construction, nothing can
// catch a crash that kills the tab before this fires, so this cannot help
// the fastest (~5s) observed crashes. It CAN convert the slower half of
// that range (roughly the 10-11s+ end) into a graceful fallback instead of
// a silent reload, IF terminating the worker at the 10s mark actually
// releases enough memory in time to preempt whatever the tab was about to
// hit — plausible (worker.terminate() frees its WASM memory immediately)
// but not verified on-device; there's no way to force the real crash in
// this sandbox to confirm it.
export const IOS_ACCURATE_INFERENCE_CEILING_MS = 10_000;

// Is this the one narrow, opt-in-only combination known to crash? (Default
// ASR is off on iOS, and the default model there is "fast" — reaching this
// requires a user to explicitly enable ASR AND explicitly pick "accurate"
// in Settings.) Scoping the tightened ceiling to exactly this combination
// keeps every other device/model pairing on the normal, audio-scaled budget.
export function isRiskyInference({ isIos, modelId, accurateModelId }) {
  return !!isIos && modelId === accurateModelId;
}

// How far to push the deadline on a model-download progress event: while
// still downloading, keep the generous network-tolerant budget; the instant
// download completes (pct >= 100), tighten to the short session-creation
// ceiling so a hang there falls back in ~45s, not minutes.
export function deadlineDelayForProgress(pct, audioSec) {
  return pct >= 100 ? ASR_LOAD_CEILING_MS : inferenceCeilingMs(audioSec);
}

// A gap between watchdog checks this large means the tab was suspended
// (frozen), not just busy.
export function isSuspensionGap(gapMs) {
  return gapMs > ASR_SUSPEND_GAP_MS;
}

// Which failure code a stall should be attributed to, given what we observed
// during the run. Backgrounding (an explicit visibility change) is the most
// actionable; a suspension gap with no visibility change points at
// throttling (Low Power Mode / very low battery); otherwise it's a plain
// timeout.
export function stallReasonCode({ wentHidden, wasSuspended }) {
  if (wentHidden) return "backgrounded-during-inference";
  if (wasSuspended) return "suspended-during-inference";
  return "timed-out";
}
