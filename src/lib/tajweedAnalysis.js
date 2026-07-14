import { findTajweedRules } from "@/lib/tajweedRules";
import { energyProfileForWindow } from "@/lib/audioAnalysis";

const DIACRITICS_RE = /[\u064B-\u0652\u0670\u0653]/g;
const TATWEEL_RE = /\u0640/g;
const NON_ARABIC_LETTER_RE = /[^\u0621-\u064A]/g; // strips punctuation, latin, digits

export function normalizeArabic(word) {
  return word
    .replace(DIACRITICS_RE, "")
    .replace(TATWEEL_RE, "")
    .replace(NON_ARABIC_LETTER_RE, "")
    .replace(/[إأآا]/g, "ا")
    .replace(/[ىي]/g, "ي")
    .replace(/ة/g, "ه")
    .trim();
}

export function levenshtein(a, b) {
  const m = a.length, n = b.length;
  if (m === 0) return n;
  if (n === 0) return m;
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

export function wordSimilarity(a, b) {
  const maxLen = Math.max(a.length, b.length) || 1;
  return 1 - levenshtein(a, b) / maxLen;
}

// Aligns expected ayah words against ASR-recognized words using edit
// distance over whole words (Needleman-Wunsch style), so we can tell which
// expected words were likely skipped/mispronounced and map the rest to
// approximate timestamps.
export function alignWords(expectedWords, recognizedWords) {
  const m = expectedWords.length;
  const n = recognizedWords.length;
  const simMatrix = [];
  for (let i = 0; i < m; i++) {
    simMatrix.push(recognizedWords.map((r) => wordSimilarity(expectedWords[i], r)));
  }

  const GAP = 0.85; // cost of leaving a word unmatched
  const dp = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i * GAP;
  for (let j = 0; j <= n; j++) dp[0][j] = j * GAP;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const subCost = 1 - simMatrix[i - 1][j - 1];
      dp[i][j] = Math.min(
        dp[i - 1][j - 1] + subCost,
        dp[i - 1][j] + GAP,
        dp[i][j - 1] + GAP
      );
    }
  }

  const alignment = new Array(m).fill(null); // expected index -> recognized index
  let i = m, j = n;
  while (i > 0 && j > 0) {
    const diag = dp[i - 1][j - 1] + (1 - simMatrix[i - 1][j - 1]);
    const up = dp[i - 1][j] + GAP;
    const left = dp[i][j - 1] + GAP;
    if (diag <= up && diag <= left) {
      alignment[i - 1] = j - 1;
      i--; j--;
    } else if (up < left) {
      i--;
    } else {
      j--;
    }
  }

  return alignment.map((recIdx, expIdx) => ({
    expectedIndex: expIdx,
    recognizedIndex: recIdx,
    similarity: recIdx == null ? 0 : simMatrix[expIdx][recIdx],
  }));
}

// Builds specific, word-referenced correctness feedback rather than just
// "3 words weren't recognized" — names the actual word, and gives a
// concrete next step (re-listen to the reference, repeat that word).
function buildWordFeedback(alignments, expectedWordsOriginal) {
  const feedback = [];
  const missed = alignments.filter((a) => a.recognizedIndex == null || a.similarity < 0.35);
  const shaky = alignments.filter((a) => a.recognizedIndex != null && a.similarity >= 0.35 && a.similarity < 0.7);

  missed.forEach((m) => {
    const word = expectedWordsOriginal[m.expectedIndex];
    feedback.push(
      `Word ${m.expectedIndex + 1} ("${word}") wasn't clearly picked up by speech recognition — you may have skipped it, paused too long around it, or pronounced it quite differently than expected. Try isolating just that word: play the reference reciter's audio for it, then repeat it a few times on its own before re-recording the full ayah.`
    );
  });

  shaky.forEach((s) => {
    const word = expectedWordsOriginal[s.expectedIndex];
    feedback.push(
      `Word ${s.expectedIndex + 1} ("${word}") was recognized, but not cleanly (rough confidence: ${Math.round(s.similarity * 100)}%). This can mean slightly unclear articulation (makhraj) of one of its letters, or that it blended into the next word without a clear stop. Worth a closer listen against the reference.`
    );
  });

  if (missed.length === 0 && shaky.length === 0) {
    feedback.push("Every word in the ayah was clearly recognized by speech recognition — good, distinct pronunciation throughout.");
  }
  return feedback;
}

// For a given rule occurrence, estimates a [startSec, endSec] window in the
// user's audio using the matched ASR word's timestamp (with small padding).
function timeWindowForRule(rule, alignments, chunks) {
  const align = alignments[rule.wordIndex];
  if (!align || align.recognizedIndex == null) return null;
  const chunk = chunks[align.recognizedIndex];
  if (!chunk?.timestamp) return null;
  const [start, end] = chunk.timestamp;
  if (start == null || end == null) return null;
  return { startSec: Math.max(0, start - 0.05), endSec: end + 0.1 };
}

function averageWordDuration(alignments, chunks) {
  const durations = alignments
    .map((a) => (a.recognizedIndex != null ? chunks[a.recognizedIndex]?.timestamp : null))
    // Only positive-width timestamps: ASR repetition loops emit zero-width
    // and even end<start chunks, which would poison the baseline every
    // other check is scaled by.
    .filter((t) => t && t[0] != null && t[1] != null && t[1] > t[0])
    .map(([s, e]) => e - s);
  if (durations.length === 0) return null;
  return durations.reduce((a, b) => a + b, 0) / durations.length;
}

// Plain-language explanation of each rule, shown once per rule type so
// people understand *what* is being checked, not just pass/warn.
export const TAJWEED_RULE_DEFINITIONS = {
  qalqalah: {
    title: "Qalqalah (bounce)",
    definition: "A slight bouncing echo produced on the letters ق ط ب ج د when they carry a sukoon (no vowel) — instead of stopping the sound flatly, you release it with an audible little bounce.",
  },
  ghunnah: {
    title: "Ghunnah (nasal hold)",
    definition: "A nasal hum held for about 2 counts on ن or م when they carry a shaddah (doubling mark) — the sound resonates through the nose while the mouth stays closed/blocked.",
  },
  iqlab: {
    title: "Iqlab (noon → meem sound)",
    definition: "When a noon sakinah or tanween is followed by ب, it's converted into a hidden م sound with a nasal hum held for about 2 counts — the lips close as if saying \"m\" instead of \"n\".",
  },
  idgham_ghunnah: {
    title: "Idgham with Ghunnah (merging with nasal hold)",
    definition: "When a noon sakinah or tanween is followed by ي ن م و at the start of the next word, the noon sound merges into that letter, carried on a nasal hum held for about 2 counts. Honest limit: the audio check only verifies that a sustained nasal hold happened at the right spot and lasted long enough — it cannot verify the merge itself (it can't tell proper merging apart from clearly pronouncing the noon with an added hum).",
  },
  ikhfa: {
    title: "Ikhfa (hiding the noon)",
    definition: "When a noon sakinah or tanween is followed by one of the 15 Ikhfa letters (ت ث ج د ذ ز س ش ص ض ط ظ ف ق ك), the noon is \"hidden\": pronounced as a light nasal hum held for about 2 counts while the mouth prepares for the next letter. Honest limit: the audio check only verifies a sustained nasal hold at the right position — it cannot verify the noon was actually hidden rather than pronounced clearly with a hum added.",
  },
  madd_natural: {
    title: "Madd Tabi'i (natural elongation)",
    definition: "A natural elongation of about 2 counts on ا, و, or ي acting as a long vowel — roughly the time it takes to pronounce a single extra beat.",
  },
  madd_extended: {
    title: "Madd Muttasil / Munfasil (extended elongation)",
    definition: "The vowel is held for about 4-5 counts because a hamzah (ء) follows — either later in the same word (Muttasil) or at the start of the next word (Munfasil).",
  },
  madd_obligatory: {
    title: "Madd Lazim (obligatory elongation)",
    definition: "The longest elongation, held for 6 counts, required when the vowel letter is followed by a shaddah or sukoon within the same word.",
  },
};

// The rules that share one acoustic signature — a nasal hum sustained for
// ~2 counts — and therefore one acceptance check. For idgham_ghunnah and
// ikhfa this is explicitly a partial check: it verifies the hold's position
// and length, never which consonant was actually produced.
const NASAL_HOLD_RULE_TYPES = new Set(["ghunnah", "iqlab", "idgham_ghunnah", "ikhfa"]);

// Every tunable acceptance threshold in one place, exported so the offline
// evaluation harness (tools/qdat-eval/) can tune them against labeled real
// recordings instead of these staying hand-picked estimates.
//
// Validated against QDAT (~1,400 expert-labeled recordings of 5:109;
// half-split tune/holdout; see tools/qdat-eval/README.md for the method
// and full numbers, 2026-07):
//  - maddMinRatioFactor 0.7 -> 0.925 raised holdout agreement with the
//    expert Madd labels from 63.8% to 69.4% (always-pass baseline 58.4%).
//  - The nasal-hold thresholds were left as-is: on QDAT, duration/energy
//    spread barely discriminates Ghunnah/Ikhfa correctness beyond the
//    label base rates (Ghunnah 79.9% vs 81.1% always-pass; Ikhfa 54.0% vs
//    51.5%), and grid-searched "improvements" didn't survive the holdout.
//    Genuinely better Ghunnah/Ikhfa verdicts need spectral features (see
//    the Phase-2 classifier plan), not different duration cutoffs.
//  - Iqlab coupling: nasalHoldCountWordFraction/nasalSpikeMaxDb are ONE
//    shared pair for the whole NASAL_HOLD_RULE_TYPES family (ghunnah, iqlab,
//    idgham_ghunnah, ikhfa), so any "tune for Ghunnah" moves Iqlab too.
//    QDAT has no Iqlab labels (verse 5:109 has no Iqlab), so Ikhfa is its
//    closest labeled analog. Verified (tune-thresholds.mjs, Iqlab coupling
//    check): the Ghunnah-only optimum {0.1, 11} leaves Ghunnah flat on
//    holdout (79.9%) AND drops Ikhfa 54.0% -> 53.2% — i.e. chasing Ghunnah
//    would REGRESS the Iqlab side. That's the concrete reason the shared
//    pair is judged jointly and left unchanged: it protects Iqlab.
//  - QDAT has no Qalqalah labels, so qalqalahBounceDb stays hand-picked.
export const TAJWEED_THRESHOLDS = {
  // dB the window's tail peak must rise above its mean energy to count as
  // an audible Qalqalah bounce.
  qalqalahBounceDb: 4,
  // Seconds of nasal hold required per "count", expressed as a fraction of
  // the reciter's own average word duration in this recording.
  nasalHoldCountWordFraction: 0.5,
  // Max dB spread (window max minus mean) for a nasal hold to read as
  // sustained rather than a spike.
  nasalSpikeMaxDb: 10,
  // Fraction of the expected elongation ratio a Madd must reach to pass.
  maddMinRatioFactor: 0.925,
};

// Builds a specific, actionable note for one rule occurrence, naming the
// actual word/letter and — on a "warn" verdict — a concrete correction tip
// rather than just flagging that something's off.
function buildRuleNote(rule, verdict, { word, letter, actualCounts, expectedCounts }) {
  const w = `"${word}"`;

  if (rule.ruleType === "qalqalah") {
    return verdict === "pass"
      ? `Good — a clear bounce came through on the ${letter} in ${w}.`
      : `The bounce on ${letter} in ${w} wasn't clearly audible. Try releasing that letter with a light, audible "pop" — press the articulation point closed, then let go with a small echo, rather than cutting the sound off flatly or adding an extra vowel after it.`;
  }

  if (NASAL_HOLD_RULE_TYPES.has(rule.ruleType)) {
    const label =
      rule.ruleType === "iqlab" ? "the hidden م sound"
      : rule.ruleType === "idgham_ghunnah" ? "the merged nasal sound"
      : rule.ruleType === "ikhfa" ? "the hidden noon's nasal hum"
      : "the nasal hold";
    // For Idgham/Ikhfa, the measurement genuinely can't see whether the
    // noon was merged/hidden — only that a nasal hold of about the right
    // length happened there. Say so, even on a pass.
    const caveat =
      rule.ruleType === "idgham_ghunnah"
        ? " (Note: this only measures the nasal hold's timing — it can't confirm the noon actually merged into the next letter rather than being pronounced clearly with a hum.)"
        : rule.ruleType === "ikhfa"
        ? " (Note: this only measures the nasal hold's timing — it can't confirm the noon was truly hidden rather than pronounced clearly with a hum.)"
        : "";
    return verdict === "pass"
      ? `${label[0].toUpperCase()}${label.slice(1)} on ${letter} in ${w} was sustained well.${caveat}`
      : `${label[0].toUpperCase()}${label.slice(1)} on ${letter} in ${w} seemed short or spiky rather than sustained. This should ring through your nose for about 2 counts — try humming through that transition rather than passing over it quickly.${caveat}`;
  }

  // Madd family
  const countsNote = expectedCounts ? ` (aim for about ${expectedCounts} counts)` : "";
  if (verdict === "pass") {
    return `The elongation in ${w}${countsNote} held up well relative to your pace.`;
  }
  const ratioNote = actualCounts != null ? ` It came out closer to ${actualCounts.toFixed(1)} counts.` : "";
  return `The elongation in ${w} sounded shorter than expected${countsNote}.${ratioNote} Try holding the vowel sound noticeably longer — for Madd, think of it as adding extra beats to the vowel rather than letting it clip short.`;
}

// Runs the acoustically-checkable Tajweed rules — Qalqalah, Madd, and the
// nasal-hold family (Ghunnah, Iqlab, Idgham with Ghunnah, Ikhfa) — against
// the user's actual recorded audio, using ASR word timestamps to locate
// each rule in time. This is heuristic — real timing varies by reciter and
// pace — so checks are relative to the user's own average word duration in
// this recording, not fixed absolute thresholds.
export function checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks }) {
  const { hits, words } = findTajweedRules(ayahArabicText);
  const avgWordDur = averageWordDuration(alignments, chunks);
  const results = [];

  for (const rule of hits) {
    const word = words[rule.wordIndex];
    const letter = Array.from(word)[rule.charIndex];

    const window = timeWindowForRule(rule, alignments, chunks);
    if (!window || !avgWordDur) {
      results.push({
        ...rule,
        word,
        letter,
        verdict: "unchecked",
        note: `Couldn't align "${word}" precisely enough in your recording to check its timing — this doesn't mean it was wrong, just that it couldn't be measured.`,
      });
      continue;
    }

    const segmentDurationSec = window.endSec - window.startSec;
    if (segmentDurationSec <= 0) {
      // A non-positive window means the ASR word timestamp had end <= start
      // — physically impossible, and in practice a symptom of a Whisper
      // repetition loop corrupting the timestamp alignment. Never compute a
      // (negative) ratio from it; treat the rule as unmeasurable.
      const chunk = chunks[alignments[rule.wordIndex]?.recognizedIndex];
      console.warn(
        `Tajweed check skipped for "${word}": non-positive time window (${segmentDurationSec.toFixed(3)}s) from ASR timestamp [${chunk?.timestamp?.join(", ")}] — likely a transcription repetition loop corrupting timestamps.`
      );
      results.push({
        ...rule,
        word,
        letter,
        verdict: "unchecked",
        note: `Couldn't measure timing around "${word}" — the speech recognizer's timestamps for it were inconsistent, so this rule was skipped rather than guessed.`,
      });
      continue;
    }

    const { energyDb } = energyProfileForWindow(userSamples, sampleRate, window.startSec, window.endSec);
    if (energyDb.length < 2) {
      results.push({
        ...rule,
        word,
        letter,
        verdict: "unchecked",
        note: `Not enough audio detail around "${word}" to check this rule.`,
      });
      continue;
    }
    const maxDb = Math.max(...energyDb);
    const meanDb = energyDb.reduce((a, b) => a + b, 0) / energyDb.length;

    // Each branch also records the raw values (`measured`) behind its
    // verdict, so the offline eval harness can re-derive verdicts under
    // candidate thresholds without re-running ASR.
    if (rule.ruleType === "qalqalah") {
      const tailStart = Math.floor(energyDb.length * 0.6);
      const tailMax = Math.max(...energyDb.slice(tailStart));
      const bounceDb = tailMax - meanDb;
      const hasBounce = bounceDb > TAJWEED_THRESHOLDS.qalqalahBounceDb;
      const verdict = hasBounce ? "pass" : "warn";
      results.push({ ...rule, word, letter, verdict, ...window, measured: { bounceDb }, note: buildRuleNote(rule, verdict, { word, letter }) });
    } else if (NASAL_HOLD_RULE_TYPES.has(rule.ruleType)) {
      const expectedMinSec = (rule.expectedCounts / 2) * (avgWordDur * TAJWEED_THRESHOLDS.nasalHoldCountWordFraction);
      const energySpreadDb = maxDb - meanDb;
      const holdsUp = segmentDurationSec >= expectedMinSec && energySpreadDb < TAJWEED_THRESHOLDS.nasalSpikeMaxDb; // sustained, not a spike
      const verdict = holdsUp ? "pass" : "warn";
      results.push({
        ...rule,
        word,
        letter,
        verdict,
        ...window,
        measured: { segmentDurationSec, avgWordDur, energySpreadDb, expectedCounts: rule.expectedCounts },
        note: buildRuleNote(rule, verdict, { word, letter }),
      });
    } else {
      // Madd family: compare this word's duration to the user's own
      // average word duration, scaled by how many counts are expected.
      const expectedRatio = rule.expectedCounts / 2; // natural madd ~ baseline
      const actualRatio = segmentDurationSec / avgWordDur;
      const holdsUp = actualRatio >= expectedRatio * TAJWEED_THRESHOLDS.maddMinRatioFactor;
      const verdict = holdsUp ? "pass" : "warn";
      const actualCounts = actualRatio * 2; // rough counts estimate, same scale as expectedCounts
      results.push({
        ...rule,
        word,
        letter,
        verdict,
        ...window,
        measured: { actualRatio, expectedRatio },
        note: buildRuleNote(rule, verdict, { word, letter, actualCounts, expectedCounts: rule.expectedCounts }),
      });
    }
  }

  return results;
}

// Groups individual rule checks into broad categories (qalqalah, ghunnah,
// madd) with pass/total counts, for tracking trends over time. "unchecked"
// results are excluded from totals since they weren't actually evaluated.
export function summarizeTajweedChecks(ruleChecks = []) {
  const categoryFor = (ruleType) => (ruleType.startsWith("madd") ? "madd" : ruleType);
  const summary = {};
  for (const check of ruleChecks) {
    if (check.verdict === "unchecked") continue;
    const cat = categoryFor(check.ruleType);
    if (!summary[cat]) summary[cat] = { pass: 0, total: 0 };
    summary[cat].total += 1;
    if (check.verdict === "pass") summary[cat].pass += 1;
  }
  return summary;
}

// Full pipeline: ASR transcription result + expected ayah text -> word word
// alignment, word-correctness feedback, and Tajweed rule checks.
export function analyzeTajweedFromTranscription({ asrResult, ayahArabicText, userSamples, sampleRate }) {
  const expectedWordsOriginal = ayahArabicText.trim().split(/\s+/).filter(Boolean);
  const expectedWords = expectedWordsOriginal.map(normalizeArabic);
  const chunks = asrResult?.chunks || [];
  const recognizedWords = chunks.map((c) => normalizeArabic((c.text || "").trim()));

  const alignments = alignWords(expectedWords, recognizedWords);
  const wordFeedback = buildWordFeedback(alignments, expectedWordsOriginal);
  const ruleChecks = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });

  const ruleTypesPresent = [...new Set(ruleChecks.map((r) => r.ruleType))];
  const glossary = ruleTypesPresent.map((type) => ({ type, ...TAJWEED_RULE_DEFINITIONS[type] }));

  // Coarse stats on how much of the ayah ASR actually recognized, used as a
  // signal (alongside the DSP comparison) for whether the overall score is
  // trustworthy or should be flagged low-confidence.
  const missedWords = alignments.filter((a) => a.recognizedIndex == null || a.similarity < 0.35).length;
  const alignmentStats = {
    totalWords: expectedWordsOriginal.length,
    missedWords,
    recognizedRatio: expectedWordsOriginal.length ? 1 - missedWords / expectedWordsOriginal.length : null,
  };

  return {
    recognizedText: asrResult?.text?.trim() || "",
    wordFeedback,
    ruleChecks,
    glossary,
    alignmentStats,
  };
}
