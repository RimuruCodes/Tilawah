import { describe, it, expect } from "vitest";
import {
  normalizeArabic,
  levenshtein,
  wordSimilarity,
  alignWords,
  analyzeTajweedFromTranscription,
  checkTajweedRules,
  summarizeTajweedChecks,
  TAJWEED_RULE_DEFINITIONS,
} from "@/lib/tajweedAnalysis";
import { TARGET_SAMPLE_RATE, buildFeatures } from "@/lib/audioAnalysis";

const sampleRate = TARGET_SAMPLE_RATE;

// Qalqalah release-bounce shape: a quiet body followed by a sharp
// dB-rising tail. Also the exact acoustic signature Idgham without
// Ghunnah's absence-of-release check looks for — just interpreted
// oppositely (a bounce here is a warn, not a pass). The 1.78x amplitude
// ratio was picked empirically (a scratch probe against the real
// energyProfileForWindow/bounceDb math) to land bounceDb comfortably
// between the reference floor (2dB) and the fixed threshold (4dB) —
// around 3.4dB; 2.5x lands around 5.3dB, comfortably above it.
function makeQalqalahShape({ bodySec = 0.35, tailSec = 0.25, bodyAmplitude = 0.1, tailAmplitude = bodyAmplitude * 1.78, freq = 150 } = {}) {
  const bodyN = Math.round(bodySec * sampleRate);
  const tailN = Math.round(tailSec * sampleRate);
  const out = new Float32Array(bodyN + tailN);
  for (let i = 0; i < bodyN; i++) out[i] = bodyAmplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  for (let i = 0; i < tailN; i++) out[bodyN + i] = tailAmplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

// A flat, sustained tone — the nasal-hold / Madd elongation shape, and
// also the "no release transient" shape for Idgham without Ghunnah.
function makeSustainedTone({ holdSec = 1.0, amplitude = 0.15, freq = 120 } = {}) {
  const n = Math.round(holdSec * sampleRate);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = amplitude * Math.sin((2 * Math.PI * freq * i) / sampleRate);
  return out;
}

// A reference identical to the user's own recording (same energy shape,
// identity time mapping) — proves "the user matched the reciter's own
// performance exactly here", regardless of what a fixed or self-relative
// baseline would say about the absolute numbers.
function makeIdentityReferenceAlignment(userSamples) {
  const { energyDb, hopSize } = buildFeatures(userSamples, sampleRate);
  return { refEnergyDb: energyDb, hopSec: hopSize / sampleRate, mapUserSecToRefSec: (sec) => sec };
}

// A reference whose TIMELINE runs at `timeScale`x the user's (e.g. 3
// means the reference reciter held this position 3x as long, in
// reference-time, as the user did) — an exact linear mapUserSecToRefSec,
// not estimated from synthesized audio.
function makeTimeScaledReferenceAlignment(userSamples, timeScale) {
  const { energyDb, hopSize } = buildFeatures(userSamples, sampleRate);
  return { refEnergyDb: energyDb, hopSec: hopSize / sampleRate, mapUserSecToRefSec: (sec) => sec * timeScale };
}

describe("normalizeArabic", () => {
  it("strips diacritics and tatweel", () => {
    expect(normalizeArabic("بِسْمِ")).toBe("بسم");
  });

  it("unifies alef/hamzah variants and ta marbuta", () => {
    expect(normalizeArabic("إِلَٰهَ")).toBe("اله");
    expect(normalizeArabic("أحمد")).toBe("احمد");
    expect(normalizeArabic("مكة")).toBe("مكه");
  });

  it("strips punctuation and latin characters that ASR might emit", () => {
    expect(normalizeArabic("الرحيم.")).toBe("الرحيم");
    expect(normalizeArabic("word123")).toBe("");
  });
});

describe("levenshtein / wordSimilarity", () => {
  it("returns 0 distance and full similarity for identical strings", () => {
    expect(levenshtein("كتاب", "كتاب")).toBe(0);
    expect(wordSimilarity("كتاب", "كتاب")).toBe(1);
  });

  it("returns partial similarity for close-but-different strings", () => {
    const sim = wordSimilarity("الرحيم", "الرحمن");
    expect(sim).toBeGreaterThan(0);
    expect(sim).toBeLessThan(1);
  });
});

describe("alignWords", () => {
  it("aligns identical word sequences 1:1", () => {
    const expected = ["بسم", "الله", "الرحمن", "الرحيم"];
    const recognized = ["بسم", "الله", "الرحمن", "الرحيم"];
    const alignment = alignWords(expected, recognized);
    alignment.forEach((a, i) => {
      expect(a.recognizedIndex).toBe(i);
      expect(a.similarity).toBe(1);
    });
  });

  it("marks a skipped word as unmatched (null) rather than misaligning the rest", () => {
    const expected = ["بسم", "الله", "الرحمن", "الرحيم"];
    const recognized = ["بسم", "الرحمن", "الرحيم"]; // "الله" skipped
    const alignment = alignWords(expected, recognized);
    const skipped = alignment.find((a) => a.expectedIndex === 1); // "الله"
    expect(skipped.recognizedIndex === null || skipped.similarity < 0.5).toBe(true);
    // The words after the skip should still align correctly.
    const last = alignment.find((a) => a.expectedIndex === 3);
    expect(last.similarity).toBeGreaterThan(0.9);
  });
});

describe("analyzeTajweedFromTranscription", () => {
  const sampleRate = TARGET_SAMPLE_RATE;

  function makeSamples(sec) {
    const n = Math.round(sec * sampleRate);
    const out = new Float32Array(n);
    for (let i = 0; i < n; i++) out[i] = 0.3 * Math.sin((2 * Math.PI * 150 * i) / sampleRate);
    return out;
  }

  it("reports every word recognized when transcription matches exactly", () => {
    const ayahArabicText = "قَدْ أَفْلَحَ";
    const asrResult = {
      text: "قد أفلح",
      chunks: [
        { text: "قد", timestamp: [0.0, 0.4] },
        { text: "أفلح", timestamp: [0.45, 1.0] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(1.0),
      sampleRate,
    });
    expect(result.wordFeedback.some((f) => /clearly recognized/i.test(f))).toBe(true);
    expect(result.ruleChecks.length).toBeGreaterThan(0); // qalqalah in قَدْ
  });

  it("flags a word as missed when it has no reasonable match in the transcription", () => {
    const ayahArabicText = "بِسْمِ اللَّهِ الرَّحْمَٰنِ الرَّحِيمِ";
    const asrResult = {
      text: "بسم الرحمن الرحيم", // "الله" missing entirely
      chunks: [
        { text: "بسم", timestamp: [0.0, 0.3] },
        { text: "الرحمن", timestamp: [0.35, 0.9] },
        { text: "الرحيم", timestamp: [0.95, 1.4] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(1.5),
      sampleRate,
    });
    expect(result.wordFeedback.some((f) => /wasn't clearly picked up/i.test(f))).toBe(true);
  });

  it("includes a glossary entry for each rule type present in the checks", () => {
    const ayahArabicText = "قَدْ أَفْلَحَ";
    const asrResult = {
      text: "قد أفلح",
      chunks: [
        { text: "قد", timestamp: [0.0, 0.4] },
        { text: "أفلح", timestamp: [0.45, 1.0] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(1.0),
      sampleRate,
    });
    expect(result.glossary.some((g) => g.type === "qalqalah")).toBe(true);
  });

  it("runs the nasal-hold acoustic check for Ikhfa (not just informational)", () => {
    // 113:2 — bare noon sakinah in مِن hidden into the ش of شَرِّ.
    const ayahArabicText = "مِن شَرِّ مَا خَلَقَ";
    const asrResult = {
      text: "من شر ما خلق",
      chunks: [
        { text: "من", timestamp: [0.0, 0.5] },
        { text: "شر", timestamp: [0.55, 1.0] },
        { text: "ما", timestamp: [1.05, 1.4] },
        { text: "خلق", timestamp: [1.45, 1.9] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(2.0),
      sampleRate,
    });
    const ikhfa = result.ruleChecks.find((c) => c.ruleType === "ikhfa");
    expect(ikhfa).toBeDefined();
    // A real verdict (pass or warn), not "unchecked" — the acoustic
    // acceptance logic actually ran on this occurrence.
    expect(["pass", "warn"]).toContain(ikhfa.verdict);
    expect(ikhfa.note.length).toBeGreaterThan(0);
    expect(result.glossary.some((g) => g.type === "ikhfa")).toBe(true);
  });

  it("runs the nasal-hold acoustic check for Idgham with Ghunnah", () => {
    // 99:7 — bare noon sakinah in فَمَن merging into the ي of يَعْمَلْ.
    const ayahArabicText = "فَمَن يَعْمَلْ";
    const asrResult = {
      text: "فمن يعمل",
      chunks: [
        { text: "فمن", timestamp: [0.0, 0.6] },
        { text: "يعمل", timestamp: [0.65, 1.3] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(1.5),
      sampleRate,
    });
    const idgham = result.ruleChecks.find((c) => c.ruleType === "idgham_ghunnah");
    expect(idgham).toBeDefined();
    expect(["pass", "warn"]).toContain(idgham.verdict);
  });

  it("treats a corrupted (end < start) ASR timestamp as unchecked, never a negative measurement", () => {
    // Whisper repetition loops emit timestamps with end < start; a verdict
    // must never be computed from a physically impossible negative window.
    const ayahArabicText = "قَدْ أَفْلَحَ";
    const asrResult = {
      text: "قد أفلح",
      chunks: [
        { text: "قد", timestamp: [1.0, 0.2] }, // corrupt: ends before it starts
        { text: "أفلح", timestamp: [0.45, 1.0] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(1.5),
      sampleRate,
    });
    const qalqalah = result.ruleChecks.find((c) => c.ruleType === "qalqalah");
    expect(qalqalah).toBeDefined();
    expect(qalqalah.verdict).toBe("unchecked");
    expect(qalqalah.note).toMatch(/inconsistent/i);
    expect(qalqalah.measured).toBeUndefined();
  });

  it("excludes zero-width and negative-width chunks from the average word duration baseline", () => {
    // Same recording, but the non-rule words carry corrupt timestamps: the
    // rule word's ratio must be scaled by the one sane duration, not an
    // average poisoned toward zero (which would inflate every ratio).
    const ayahArabicText = "مِن شَرِّ مَا خَلَقَ";
    const asrResult = {
      text: "من شر ما خلق",
      chunks: [
        { text: "من", timestamp: [0.0, 0.5] },
        { text: "شر", timestamp: [0.55, 0.55] }, // zero-width
        { text: "ما", timestamp: [1.4, 1.05] }, // negative-width
        { text: "خلق", timestamp: [1.45, 1.9] },
      ],
    };
    const result = analyzeTajweedFromTranscription({
      asrResult,
      ayahArabicText,
      userSamples: makeSamples(2.0),
      sampleRate,
    });
    const ikhfa = result.ruleChecks.find((c) => c.ruleType === "ikhfa");
    expect(ikhfa).toBeDefined();
    // The rule word (من) has a sane timestamp, so the check still runs...
    expect(["pass", "warn"]).toContain(ikhfa.verdict);
    // ...and its baseline came only from the two positive-width words
    // (0.5s and 0.45s), so the measured average must sit between them.
    expect(ikhfa.measured.avgWordDur).toBeGreaterThan(0.4);
    expect(ikhfa.measured.avgWordDur).toBeLessThan(0.6);
  });
});

describe("TAJWEED_RULE_DEFINITIONS — honesty caveats for the new rules", () => {
  it("defines idgham_ghunnah and ikhfa, each stating what the check can NOT verify", () => {
    for (const type of ["idgham_ghunnah", "ikhfa"]) {
      const def = TAJWEED_RULE_DEFINITIONS[type];
      expect(def).toBeDefined();
      expect(def.title.length).toBeGreaterThan(0);
      // The glossary must not oversell the check: it only measures the
      // nasal hold, not which consonant was produced.
      expect(def.definition).toMatch(/cannot verify|can't tell|only verifies/i);
    }
  });
});

describe("summarizeTajweedChecks", () => {
  it("groups all madd subtypes into a single 'madd' category", () => {
    const checks = [
      { ruleType: "madd_natural", verdict: "pass" },
      { ruleType: "madd_obligatory", verdict: "warn" },
      { ruleType: "qalqalah", verdict: "pass" },
    ];
    const summary = summarizeTajweedChecks(checks);
    expect(summary.madd).toEqual({ pass: 1, total: 2 });
    expect(summary.qalqalah).toEqual({ pass: 1, total: 1 });
  });

  it("excludes unchecked results from totals", () => {
    const checks = [
      { ruleType: "ghunnah", verdict: "unchecked" },
      { ruleType: "ghunnah", verdict: "pass" },
    ];
    const summary = summarizeTajweedChecks(checks);
    expect(summary.ghunnah).toEqual({ pass: 1, total: 1 });
  });

  it("returns an empty object for no checks", () => {
    expect(summarizeTajweedChecks([])).toEqual({});
  });
});

describe("reference-anchored Tajweed checks", () => {
  it("Qalqalah: passes when reference-anchored even though the fixed threshold would warn", () => {
    const userSamples = makeQalqalahShape();
    const ayahArabicText = "قَدْ أَفْلَحَ";
    const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }];
    const chunks = [{ timestamp: [0, 0.4] }, { timestamp: [0.45, 1.0] }];

    const thresholdResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });
    const qalqalahThreshold = thresholdResults.find((c) => c.ruleType === "qalqalah");
    expect(qalqalahThreshold.measured.mode).toBe("threshold");
    expect(qalqalahThreshold.verdict).toBe("warn");
    expect(qalqalahThreshold.measured.bounceDb).toBeGreaterThan(2);
    expect(qalqalahThreshold.measured.bounceDb).toBeLessThan(4);

    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const refResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const qalqalahRef = refResults.find((c) => c.ruleType === "qalqalah");
    expect(qalqalahRef.measured.mode).toBe("reference");
    expect(qalqalahRef.verdict).toBe("pass");
  });

  it("Ikhfa (nasal-hold family): passes when reference-anchored even though an inflated self-relative baseline would warn", () => {
    // Word 0 (من) carries the ikhfa hold; words 1-3 carry deliberately
    // inflated durations, poisoning the self-relative avgWordDur the
    // threshold path is scaled by — even though word 0's own hold is fine.
    const userSamples = makeSustainedTone({ holdSec: 0.7 });
    const ayahArabicText = "مِن شَرِّ مَا خَلَقَ";
    const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }, { recognizedIndex: 2 }, { recognizedIndex: 3 }];
    const chunks = [
      { timestamp: [0, 0.5] },
      { timestamp: [0.6, 5.6] }, // inflated
      { timestamp: [5.7, 10.7] }, // inflated
      { timestamp: [10.8, 15.8] }, // inflated
    ];

    const thresholdResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });
    const ikhfaThreshold = thresholdResults.find((c) => c.ruleType === "ikhfa");
    expect(ikhfaThreshold.measured.mode).toBe("threshold");
    expect(ikhfaThreshold.verdict).toBe("warn");

    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const refResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const ikhfaRef = refResults.find((c) => c.ruleType === "ikhfa");
    expect(ikhfaRef.measured.mode).toBe("reference");
    expect(ikhfaRef.verdict).toBe("pass");
  });

  it("Ikhfa (nasal-hold family), opposite direction: warns when reference-anchored even though the self-relative threshold would pass", () => {
    // Same shape as above, but this time all four words carry ordinary,
    // consistent durations (self-relative threshold passes easily) — the
    // reference reciter, however, held this exact position 3x as long in
    // its own timeline, so the user fell well short of matching it.
    const userSamples = makeSustainedTone({ holdSec: 0.7 });
    const ayahArabicText = "مِن شَرِّ مَا خَلَقَ";
    const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }, { recognizedIndex: 2 }, { recognizedIndex: 3 }];
    const chunks = [
      { timestamp: [0, 0.5] },
      { timestamp: [0.55, 1.0] },
      { timestamp: [1.05, 1.4] },
      { timestamp: [1.45, 1.9] },
    ];

    const thresholdResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });
    const ikhfaThreshold = thresholdResults.find((c) => c.ruleType === "ikhfa");
    expect(ikhfaThreshold.measured.mode).toBe("threshold");
    expect(ikhfaThreshold.verdict).toBe("pass");

    const referenceAlignment = makeTimeScaledReferenceAlignment(userSamples, 3);
    const refResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const ikhfaRef = refResults.find((c) => c.ruleType === "ikhfa");
    expect(ikhfaRef.measured.mode).toBe("reference");
    expect(ikhfaRef.verdict).toBe("warn");
  });

  it("Madd: passes when reference-anchored even though an inflated self-relative baseline would warn", () => {
    // Word 0 (قَالَ) carries the natural madd; word 1's duration is
    // deliberately inflated, poisoning avgWordDur — even though word 0's
    // own elongation matches the reference reciter's exactly.
    const userSamples = makeSustainedTone({ holdSec: 0.8 });
    const ayahArabicText = "قَالَ رَبِّ";
    const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }];
    const chunks = [
      { timestamp: [0, 0.6] },
      { timestamp: [0.75, 5.75] }, // inflated
    ];

    const thresholdResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });
    const maddThreshold = thresholdResults.find((c) => c.ruleType.startsWith("madd"));
    expect(maddThreshold.measured.mode).toBe("threshold");
    expect(maddThreshold.verdict).toBe("warn");

    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const refResults = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const maddRef = refResults.find((c) => c.ruleType.startsWith("madd"));
    expect(maddRef.measured.mode).toBe("reference");
    expect(maddRef.verdict).toBe("pass");
  });

  it("falls back to threshold verdicts exactly when the reference mapping can't locate this position", () => {
    const userSamples = makeSustainedTone({ holdSec: 0.7 });
    const ayahArabicText = "مِن شَرِّ مَا خَلَقَ";
    const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }, { recognizedIndex: 2 }, { recognizedIndex: 3 }];
    const chunks = [
      { timestamp: [0, 0.5] },
      { timestamp: [0.55, 1.0] },
      { timestamp: [1.05, 1.4] },
      { timestamp: [1.45, 1.9] },
    ];

    const withoutRef = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment: null });
    const unresolvableRef = { refEnergyDb: [0, 0, 0], hopSec: 0.012, mapUserSecToRefSec: () => null };
    const withUnresolvableRef = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment: unresolvableRef });
    expect(withUnresolvableRef).toEqual(withoutRef);
  });

  it("passing referenceAlignment: null explicitly matches omitting it (fallback is the default)", () => {
    const ayahArabicText = "قَدْ أَفْلَحَ";
    const asrResult = {
      text: "قد أفلح",
      chunks: [
        { text: "قد", timestamp: [0.0, 0.4] },
        { text: "أفلح", timestamp: [0.45, 1.0] },
      ],
    };
    const userSamples = makeQalqalahShape();
    const withDefault = analyzeTajweedFromTranscription({ asrResult, ayahArabicText, userSamples, sampleRate });
    const withExplicitNull = analyzeTajweedFromTranscription({ asrResult, ayahArabicText, userSamples, sampleRate, referenceAlignment: null });
    expect(withExplicitNull).toEqual(withDefault);
  });
});

describe("QUA ground-truth reference — scoped to Husary/Minshawi only", () => {
  const ayahArabicText = "قَدْ أَفْلَحَ";
  const alignments = [{ recognizedIndex: 0 }, { recognizedIndex: 1 }];
  const chunks = [{ timestamp: [0, 0.4] }, { timestamp: [0.45, 1.0] }];

  it("(a) uses QUA ground truth for Husary once quaContext resolves a real (surah, ayah, word)", () => {
    const userSamples = makeQalqalahShape();
    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const quaContext = { reciterFolder: "Husary_128kbps", surahNumber: 1, ayahNumber: 1 };
    const results = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment, quaContext });
    const qalqalah = results.find((c) => c.ruleType === "qalqalah");
    expect(qalqalah.measured.mode).toBe("ground-truth");
  });

  it("(a) also uses QUA ground truth for Minshawi", () => {
    // Minshawi's validated 1:1-word-1 window (~0.54s-0.97s) falls later than
    // the default shape's 0.6s length AND later than its quiet/loud
    // transition (0.35s) — lengthen the body so the transition sits inside
    // this window (a "bounce" needs the window to actually span quiet-then-
    // loud, not just sit entirely within the loud tail). The rule's own
    // window (from chunks[0], below) is unaffected by this.
    const userSamples = makeQalqalahShape({ bodySec: 0.8, tailSec: 0.4 });
    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const quaContext = { reciterFolder: "Minshawy_Murattal_128kbps", surahNumber: 1, ayahNumber: 1 };
    const results = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment, quaContext });
    const qalqalah = results.find((c) => c.ruleType === "qalqalah");
    expect(qalqalah.measured.mode).toBe("ground-truth");
  });

  it("(b) Abdul Basit and Alafasy fall through to the DTW-estimated window UNCHANGED — a real regression test on the full result, not just an absent lookup", () => {
    const userSamples = makeQalqalahShape();
    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const withoutQuaContext = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });

    for (const reciterFolder of ["Abdul_Basit_Murattal_192kbps", "Alafasy_128kbps"]) {
      // Same ayah Husary/Minshawi DO have ground truth for — proves the gate
      // is the reciter allowlist, not just "this ayah has no QUA data".
      const withQuaContext = checkTajweedRules({
        userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment,
        quaContext: { reciterFolder, surahNumber: 1, ayahNumber: 1 },
      });
      expect(withQuaContext).toEqual(withoutQuaContext);
      const qalqalah = withQuaContext.find((c) => c.ruleType === "qalqalah");
      expect(qalqalah.measured.mode).toBe("reference"); // DTW path, never "ground-truth"
    }
  });

  it("(b) with no referenceAlignment either, an unsupported reciter's quaContext still degrades to the plain threshold path unchanged", () => {
    const userSamples = makeQalqalahShape();
    const withoutAnything = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks });
    const withQuaContextOnly = checkTajweedRules({
      userSamples, sampleRate, ayahArabicText, alignments, chunks,
      quaContext: { reciterFolder: "Abdul_Basit_Murattal_192kbps", surahNumber: 1, ayahNumber: 1 },
    });
    expect(withQuaContextOnly).toEqual(withoutAnything);
  });

  it("a supported reciter's quaContext for an ayah that was never validated falls back to the DTW path exactly", () => {
    const userSamples = makeQalqalahShape();
    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const withoutQuaContext = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const withUnvalidatedAyah = checkTajweedRules({
      userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment,
      quaContext: { reciterFolder: "Husary_128kbps", surahNumber: 3, ayahNumber: 5 }, // never sampled/validated
    });
    expect(withUnvalidatedAyah).toEqual(withoutQuaContext);
  });

  it("passing quaContext: null explicitly matches omitting it (fallback is the default)", () => {
    const userSamples = makeQalqalahShape();
    const referenceAlignment = makeIdentityReferenceAlignment(userSamples);
    const withDefault = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment });
    const withExplicitNull = checkTajweedRules({ userSamples, sampleRate, ayahArabicText, alignments, chunks, referenceAlignment, quaContext: null });
    expect(withExplicitNull).toEqual(withDefault);
  });
});

