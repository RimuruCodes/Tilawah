// Phase 1 (ASR-on-real-mistakes investigation, 2026-07): constructs
// deliberately-flawed test audio for the error categories the real labeled
// dataset (fetch-asr-error-testset.mjs) doesn't cover: a skipped word, a
// swapped word order, a shortened/dropped Madd, and an inserted hesitation
// pause. Every word segment is genuine professional-reciter audio (Husary,
// via everyayah.com — the same source Tilawah already plays); only the
// splice (cut/reorder/trim/silence-insert) is artificial. Word boundaries
// come from QUA's real, independently-validated ground-truth timestamps
// (src/lib/quaReferenceData.js) — not guessed cut points.
//
// Uses surah 112 ayah 1 (قُلْ هُوَ اللَّهُ أَحَدٌ) specifically so these
// synthetic cases are directly comparable to the real-error dataset, which
// happens to be the same ayah (Al-Ikhlas verse 1).
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { getAudioUrl } from "@/lib/quranData";
import { getQuaWordWindowsForAyah } from "@/lib/quaReferenceData";

const OUT_DIR = path.join("tools", "qdat-eval", "asr-error-audio");
const MANIFEST_FILE = path.join("tools", "qdat-eval", "asr-spliced-testset.json");
fs.mkdirSync(OUT_DIR, { recursive: true });

const RECITER_FOLDER = "Husary_128kbps";
const SURAH = 112;
const AYAH = 1;
const SR = 16000;

function mp3BufferToFloat16k(mp3Buffer) {
  const result = spawnSync(
    "ffmpeg",
    ["-hide_banner", "-loglevel", "error", "-i", "pipe:0", "-f", "s16le", "-ar", String(SR), "-ac", "1", "pipe:1"],
    { input: mp3Buffer, maxBuffer: 1024 * 1024 * 50 }
  );
  if (result.status !== 0) throw new Error(`ffmpeg decode failed: ${(result.stderr?.toString() || "").slice(0, 300)}`);
  const pcm = result.stdout;
  const n = Math.floor(pcm.length / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = pcm.readInt16LE(i * 2) / 32768;
  return out;
}

function writeWav(float32, destPath) {
  const n = float32.length;
  const buf = Buffer.alloc(44 + n * 2);
  buf.write("RIFF", 0);
  buf.writeUInt32LE(36 + n * 2, 4);
  buf.write("WAVE", 8);
  buf.write("fmt ", 12);
  buf.writeUInt32LE(16, 16);
  buf.writeUInt16LE(1, 20); // PCM
  buf.writeUInt16LE(1, 22); // mono
  buf.writeUInt32LE(SR, 24);
  buf.writeUInt32LE(SR * 2, 28);
  buf.writeUInt16LE(2, 32);
  buf.writeUInt16LE(16, 34);
  buf.write("data", 36);
  buf.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, float32[i]));
    buf.writeInt16LE(s < 0 ? s * 32768 : s * 32767, 44 + i * 2);
  }
  fs.writeFileSync(destPath, buf);
}

const slice = (audio, startSec, endSec) => audio.slice(Math.round(startSec * SR), Math.round(endSec * SR));
const silence = (durationSec) => new Float32Array(Math.round(durationSec * SR));
const concat = (...parts) => {
  const total = parts.reduce((s, p) => s + p.length, 0);
  const out = new Float32Array(total);
  let off = 0;
  for (const p of parts) {
    out.set(p, off);
    off += p.length;
  }
  return out;
};

async function main() {
  const url = getAudioUrl(RECITER_FOLDER, SURAH, AYAH);
  console.log("Fetching reference audio:", url);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`audio fetch failed: HTTP ${res.status}`);
  const mp3Buf = Buffer.from(await res.arrayBuffer());
  const audio = mp3BufferToFloat16k(mp3Buf);
  console.log(`Decoded ${(audio.length / SR).toFixed(2)}s of audio.`);

  const windows = getQuaWordWindowsForAyah(RECITER_FOLDER, SURAH, AYAH);
  if (!windows) throw new Error("No QUA ground-truth windows for this reciter/ayah");
  const byIndex = new Map(windows.map((w) => [w.wordIndex, w]));
  const words = ["قُلْ", "هُوَ", "اللَّهُ", "أَحَدٌ"]; // wordIndex 0..3
  console.log("QUA word windows (sec):", windows.map((w) => `[${w.wordIndex}] ${w.startSec.toFixed(3)}-${w.endSec.toFixed(3)}`).join("  "));

  const w0 = byIndex.get(0), w1 = byIndex.get(1), w2 = byIndex.get(2), w3 = byIndex.get(3);
  const manifest = [];

  // --- 1. Skipped word: cut out word 2 ("هُوَ") entirely ---
  {
    const spliced = concat(
      slice(audio, 0, w0.endSec),
      slice(audio, w2.startSec, w3.endSec)
    );
    const filename = "spliced_skip_word2.wav";
    writeWav(spliced, path.join(OUT_DIR, filename));
    manifest.push({
      filename, kind: "spliced-skip-word", why: "word 2 (هُوَ) cut out entirely",
      verseText: "قُلْ هُوَ اللَّهُ أَحَدٌ", actuallySaid: "قُلْ اللَّهُ أَحَدٌ (هُوَ omitted)",
    });
  }

  // --- 2. Swapped word order: word 3 and word 4 reordered ---
  {
    const spliced = concat(
      slice(audio, 0, w1.endSec),
      slice(audio, w3.startSec, w3.endSec),
      slice(audio, w2.startSec, w2.endSec)
    );
    const filename = "spliced_swap_words_3_4.wav";
    writeWav(spliced, path.join(OUT_DIR, filename));
    manifest.push({
      filename, kind: "spliced-swap-words", why: "words 3 and 4 (اللَّهُ / أَحَدٌ) reordered",
      verseText: "قُلْ هُوَ اللَّهُ أَحَدٌ", actuallySaid: "قُلْ هُوَ أَحَدٌ اللَّهُ (order swapped)",
    });
  }

  // --- 3. Dropped/shortened Madd: word 4 ("أَحَدٌ") trimmed to its first 55% ---
  // (its natural closing vowel/tanween release cut short, simulating rushing
  // through the ending instead of holding it).
  {
    const fullDur = w3.endSec - w3.startSec;
    const shortEnd = w3.startSec + fullDur * 0.55;
    const spliced = concat(
      slice(audio, 0, w2.endSec),
      slice(audio, w3.startSec, shortEnd)
    );
    const filename = "spliced_dropped_madd_word4.wav";
    writeWav(spliced, path.join(OUT_DIR, filename));
    manifest.push({
      filename, kind: "spliced-dropped-madd", why: "word 4 (أَحَدٌ) cut to 55% of its natural duration",
      verseText: "قُلْ هُوَ اللَّهُ أَحَدٌ", actuallySaid: "قُلْ هُوَ اللَّهُ أَحَدْ (final word rushed/truncated, not fully released)",
    });
  }

  // --- 4. Hesitation: a real 700ms silence gap inserted mid-ayah ---
  {
    const spliced = concat(
      slice(audio, 0, w1.endSec),
      silence(0.7),
      slice(audio, w2.startSec, w3.endSec)
    );
    const filename = "spliced_hesitation_pause.wav";
    writeWav(spliced, path.join(OUT_DIR, filename));
    manifest.push({
      filename, kind: "spliced-hesitation", why: "700ms silence gap inserted after word 2 (هُوَ), before word 3",
      verseText: "قُلْ هُوَ اللَّهُ أَحَدٌ", actuallySaid: "قُلْ هُوَ ... (long pause) ... اللَّهُ أَحَدٌ (words unchanged, real hesitation-length pause)",
    });
  }

  // --- 5. Filler sound: a real captured lead-in room-tone/breath segment
  // (the ~0.3s before this same file's own verse start, genuine recorded
  // audio, not synthesized) spliced in between words 2 and 3. Labeled
  // "real-but-repurposed" — not a synthetic noise burst, but also not an
  // authentic filler utterance (um/uh), which needs a real human recording
  // this project doesn't have. Reported honestly as the weakest category.
  {
    const leadIn = audio.slice(0, Math.round(0.3 * SR));
    const spliced = concat(
      slice(audio, 0, w1.endSec),
      leadIn,
      slice(audio, w2.startSec, w3.endSec)
    );
    const filename = "spliced_filler_leadin.wav";
    writeWav(spliced, path.join(OUT_DIR, filename));
    manifest.push({
      filename, kind: "spliced-filler-weak-proxy", why: "0.3s of this file's own real lead-in room tone/breath spliced in after word 2 — NOT a genuine 'um' filler utterance (no real source available), reported as the weakest constructed category",
      verseText: "قُلْ هُوَ اللَّهُ أَحَدٌ", actuallySaid: "قُلْ هُوَ [non-speech sound] اللَّهُ أَحَدٌ",
    });
  }

  fs.writeFileSync(MANIFEST_FILE, JSON.stringify(manifest, null, 1));
  console.log(`\nWrote ${manifest.length} spliced test files + manifest: ${MANIFEST_FILE}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
