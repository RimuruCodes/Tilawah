// Picks a MediaRecorder mimeType the current browser actually supports.
// Chromium-based browsers support audio/webm;codecs=opus. Safari doesn't
// support webm at all (as either a recorder or decoder target), so we fall
// back to formats it does support to avoid silent recording/decoding
// failures.
const CANDIDATE_MIME_TYPES = [
  "audio/webm;codecs=opus",
  "audio/webm",
  "audio/mp4",
  "audio/ogg;codecs=opus",
];

export function getSupportedRecorderMimeType() {
  if (typeof MediaRecorder === "undefined" || !MediaRecorder.isTypeSupported) return "";
  for (const type of CANDIDATE_MIME_TYPES) {
    if (MediaRecorder.isTypeSupported(type)) return type;
  }
  return ""; // let the browser pick its own default
}
