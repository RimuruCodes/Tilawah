// Optional pace-aware reciter matching (Settings toggle, default OFF).
//
// When enabled, single-ayah analysis compares the user against whichever
// reciter's recording of that ayah is closest in DURATION to the user's
// recording — decided from duration estimates alone, BEFORE any scoring
// happens. Deliberately NOT implemented as "score against everyone and
// keep the best result": that would quietly cherry-pick the most
// flattering reference and inflate scores. Duration is the only signal.
//
// Reference durations come from a HEAD request per reciter (Content-Length)
// combined with the bitrate encoded in everyayah folder names (e.g.
// "Alafasy_128kbps") — the files are constant-bitrate MP3s, so
// bytes*8/bitrate is a good duration estimate without downloading audio.

const PACE_MATCH_KEY = "qc_pace_match";

export function isPaceMatchEnabled() {
  try {
    return localStorage.getItem(PACE_MATCH_KEY) === "on";
  } catch {
    return false;
  }
}

export function setPaceMatchEnabled(on) {
  localStorage.setItem(PACE_MATCH_KEY, on ? "on" : "off");
}

// "Alafasy_128kbps" -> 128; null when the folder doesn't encode a bitrate.
export function folderBitrateKbps(folder) {
  const m = /(\d+)\s*kbps/i.exec(folder || "");
  return m ? parseInt(m[1], 10) : null;
}

// CBR MP3: duration ≈ bytes * 8 / bitrate. Returns seconds, or null when
// either input is unusable.
export function estimateDurationFromBytes(bytes, kbps) {
  if (!Number.isFinite(bytes) || bytes <= 0 || !Number.isFinite(kbps) || kbps <= 0) return null;
  return (bytes * 8) / (kbps * 1000);
}

// Picks the candidate whose duration is closest to the user's, measured as
// |log(candidate/user)| so "half as long" and "twice as long" are equally
// far. Ties keep the earlier candidate (stable). Returns null when there's
// nothing usable to choose from.
export function pickClosestPaceReciter(userDurationSec, candidates = []) {
  if (!Number.isFinite(userDurationSec) || userDurationSec <= 0) return null;
  let best = null;
  let bestDist = Infinity;
  for (const candidate of candidates) {
    const d = candidate?.durationSec;
    if (!Number.isFinite(d) || d <= 0) continue;
    const dist = Math.abs(Math.log(d / userDurationSec));
    if (dist < bestDist) {
      bestDist = dist;
      best = candidate;
    }
  }
  return best;
}
