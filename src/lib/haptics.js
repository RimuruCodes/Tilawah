// Subtle haptic feedback via the Vibration API. Every call no-ops silently
// where it isn't supported — notably iOS Safari, which doesn't implement
// navigator.vibrate at all, so iPhone users simply feel nothing rather than
// hitting an error. Patterns are intentionally short and gentle.

function canVibrate() {
  return typeof navigator !== "undefined" && typeof navigator.vibrate === "function";
}

function buzz(pattern) {
  if (!canVibrate()) return;
  try {
    navigator.vibrate(pattern);
  } catch {
    /* some browsers throw if called without a user gesture — ignore */
  }
}

// A single soft tap — e.g. when a recording stops.
export function hapticTap() {
  buzz(12);
}

// A brief celebratory double-pulse — a personal best or a streak milestone.
export function hapticSuccess() {
  buzz([0, 25, 45, 25]);
}
