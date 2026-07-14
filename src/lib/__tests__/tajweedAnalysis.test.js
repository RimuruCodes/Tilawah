import { describe, it, expect } from "vitest";
import {
  normalizeArabic,
  levenshtein,
  wordSimilarity,
  alignWords,
  analyzeTajweedFromTranscription,
  summarizeTajweedChecks,
  TAJWEED_RULE_DEFINITIONS,
} from "@/lib/tajweedAnalysis";
import { TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";

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
