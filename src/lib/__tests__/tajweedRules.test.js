import { describe, it, expect } from "vitest";
import { findTajweedRules, splitAyahIntoWords, baseLetterCharIndexes, wordLetterClusters } from "@/lib/tajweedRules";

describe("splitAyahIntoWords", () => {
  it("splits on whitespace and drops empty tokens", () => {
    expect(splitAyahIntoWords("  بِسْمِ اللَّهِ  الرَّحْمَٰنِ ")).toEqual([
      "بِسْمِ",
      "اللَّهِ",
      "الرَّحْمَٰنِ",
    ]);
  });
});

describe("baseLetterCharIndexes", () => {
  it("returns one index per base letter, skipping attached diacritics", () => {
    // ب-kasra س-sukun م-kasra: 3 base letters at raw positions 0, 2, 4.
    expect(baseLetterCharIndexes("بِسْمِ")).toEqual([0, 2, 4]);
  });

  it("returns one index per array slot for a word with no diacritics at all", () => {
    expect(baseLetterCharIndexes("قل")).toEqual([0, 1]);
  });

  it("returns an empty array for a word that's entirely diacritics (degenerate input)", () => {
    expect(baseLetterCharIndexes("َِ")).toEqual([]);
  });
});

describe("wordLetterClusters", () => {
  it("groups each base letter with its own trailing diacritics", () => {
    expect(wordLetterClusters("بِسْمِ")).toEqual([
      { charIndex: 0, text: "بِ" },
      { charIndex: 2, text: "سْ" },
      { charIndex: 4, text: "مِ" },
    ]);
  });

  it("returns one cluster per letter for a word with no diacritics", () => {
    expect(wordLetterClusters("قل")).toEqual([
      { charIndex: 0, text: "ق" },
      { charIndex: 1, text: "ل" },
    ]);
  });

  it("returns an empty array for a word that's entirely diacritics", () => {
    expect(wordLetterClusters("َِ")).toEqual([]);
  });
});

describe("findTajweedRules", () => {
  it("detects Ghunnah on noon/meem with shaddah", () => {
    const { hits } = findTajweedRules("إِنَّا أَعْطَيْنَاكَ الْكَوْثَرَ");
    const ghunnah = hits.filter((h) => h.ruleType === "ghunnah");
    expect(ghunnah).toHaveLength(1);
    expect(ghunnah[0].wordIndex).toBe(0); // إِنَّا
  });

  it("detects Qalqalah on ق ط ب ج د with sukun", () => {
    const { hits } = findTajweedRules("قَدْ أَفْلَحَ");
    const qalqalah = hits.filter((h) => h.ruleType === "qalqalah");
    expect(qalqalah).toHaveLength(1);
    expect(qalqalah[0].wordIndex).toBe(0); // قَدْ
    expect(qalqalah[0].expectedCounts).toBe(1);
  });

  it("does not flag qalqalah letters without sukun", () => {
    // ب has fatha here, not sukun - should not be flagged
    const { hits } = findTajweedRules("بَاسِمِ");
    const qalqalah = hits.filter((h) => h.ruleType === "qalqalah");
    expect(qalqalah).toHaveLength(0);
  });

  it("classifies Madd Munfasil when the next word starts with hamzah", () => {
    // لَا إِلَٰهَ -- "لَا" ends in a bare alef, and "إِلَٰهَ" starts with hamzah
    const { hits } = findTajweedRules("لَا إِلَٰهَ إِلَّا هُوَ");
    const maddOnLaa = hits.find((h) => h.wordIndex === 0 && h.ruleType.startsWith("madd"));
    expect(maddOnLaa).toBeDefined();
    expect(maddOnLaa.ruleType).toBe("madd_extended");
  });

  it("classifies a word-final madd as natural when no next word starts with hamzah", () => {
    // إِلَّا is the last word here, so there's no next-word hamzah to extend it
    const { hits } = findTajweedRules("إِلَّا");
    const madd = hits.find((h) => h.ruleType.startsWith("madd"));
    expect(madd).toBeDefined();
    expect(madd.ruleType).toBe("madd_natural");
  });

  it("detects Madd Munfasil on a precomposed alef-madda (5:109 لَنَآ إِنَّكَ)", () => {
    // The Uthmani text writes this alef as U+0622 (آ), not alef+combining
    // maddah — it must still count as a madd letter.
    const { hits } = findTajweedRules("لَنَآ إِنَّكَ");
    const madd = hits.find((h) => h.wordIndex === 0 && h.ruleType.startsWith("madd"));
    expect(madd).toBeDefined();
    expect(madd.ruleType).toBe("madd_extended");
  });

  it("classifies Madd Lazim when followed by shaddah/sukun in the same word", () => {
    // الْحَاقَّةُ contains a madd letter (ا) immediately followed by a
    // shaddah-bearing letter (قّ) within the same word.
    const { hits } = findTajweedRules("الْحَاقَّةُ");
    const lazim = hits.find((h) => h.ruleType === "madd_obligatory");
    expect(lazim).toBeDefined();
    expect(lazim.expectedCounts).toBe(6);
  });

  it("detects Iqlab when noon sakinah is followed by ba", () => {
    const { hits } = findTajweedRules("مِنْ بَعْدِ");
    const iqlab = hits.filter((h) => h.ruleType === "iqlab");
    expect(iqlab).toHaveLength(1);
    expect(iqlab[0].expectedCounts).toBe(2);
  });

  it("detects Iqlab when tanween is followed by ba", () => {
    const { hits } = findTajweedRules("سَمِيعٌ بَصِيرٌ");
    const iqlab = hits.filter((h) => h.ruleType === "iqlab");
    expect(iqlab).toHaveLength(1);
  });

  it("does not flag Iqlab when noon sakinah is not followed by ba", () => {
    const { hits } = findTajweedRules("مِنْ رَبِّهِمْ");
    const iqlab = hits.filter((h) => h.ruleType === "iqlab");
    expect(iqlab).toHaveLength(0);
  });

  it("returns no hits for text with no relevant diacritics", () => {
    const { hits } = findTajweedRules("كتب");
    expect(hits).toHaveLength(0);
  });
});

// The Uthmani strings below are copied verbatim from the quran-uthmani
// edition served by api.alquran.cloud (the text the app actually analyzes),
// including its sequential-tanween marks (U+06E2/U+06ED) and its convention
// of writing an assimilated noon sakinah bare (no sukun). Each example's
// expected ruling is standard Hafs Tajweed, not inferred from the code.
describe("findTajweedRules — Idgham with Ghunnah", () => {
  const idghamOf = (text) => findTajweedRules(text).hits.filter((h) => h.ruleType === "idgham_ghunnah");

  it("detects bare noon sakinah before ya across words (99:7 فَمَن يَعْمَلْ)", () => {
    const hits = idghamOf("فَمَن يَعْمَلْ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
    expect(hits[0].expectedCounts).toBe(2);
  });

  it("detects bare noon sakinah before meem across words (111:5 مِّن مَّسَدٍۭ)", () => {
    const hits = idghamOf("مِّن مَّسَدٍۭ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });

  it("detects tanween before waw across words (2:163 إِلَٰهٌۭ وَٰحِدٌۭ)", () => {
    const hits = idghamOf("إِلَٰهٌۭ وَٰحِدٌۭ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });

  it("skips the fathatan's silent carrier alef to find the follower (99:7 خَيْرًۭا يَرَهُۥ)", () => {
    const hits = idghamOf("خَيْرًۭا يَرَهُۥ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });

  it("does not flag noon before waw within one word — Izhar Mutlaq (6:99 قِنْوَانٌۭ)", () => {
    expect(idghamOf("قِنْوَانٌۭ دَانِيَةٌۭ")).toHaveLength(0);
  });

  it("classifies Idgham WITHOUT ghunnah (before ل or ر) as its own rule type, not idgham_ghunnah or ikhfa (2:26, 107:4)", () => {
    expect(idghamOf("مِن رَّبِّهِمْ")).toHaveLength(0);
    expect(idghamOf("فَوَيْلٌۭ لِّلْمُصَلِّينَ")).toHaveLength(0);
    const { hits } = findTajweedRules("مِن رَّبِّهِمْ");
    expect(hits.filter((h) => h.ruleType === "ikhfa")).toHaveLength(0);
    expect(hits.filter((h) => h.ruleType === "idgham_no_ghunnah")).toHaveLength(1);
  });

  it("does not flag Izhar (noon sakinah with explicit sukun before hamza, 6:99 مِّنْ أَعْنَابٍۢ)", () => {
    const { hits } = findTajweedRules("مِّنْ أَعْنَابٍۢ");
    const family = hits.filter((h) => ["idgham_ghunnah", "ikhfa", "iqlab"].includes(h.ruleType));
    expect(family).toHaveLength(0);
  });
});

describe("findTajweedRules — Idgham without Ghunnah", () => {
  const idghamNoGhunnahOf = (text) => findTajweedRules(text).hits.filter((h) => h.ruleType === "idgham_no_ghunnah");

  it("detects bare noon sakinah before ra across words (2:5 هُدًى مِّن رَّبِّهِمْ)", () => {
    const hits = idghamNoGhunnahOf("مِن رَّبِّهِمْ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
    expect(hits[0].expectedCounts).toBe(0);
  });

  it("detects tanween before lam across words (2:2 هُدًى لِّلْمُتَّقِينَ)", () => {
    const hits = idghamNoGhunnahOf("هُدًى لِّلْمُتَّقِينَ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });

  it("does not flag noon sakinah before ل/ر within a single word", () => {
    // No real Izhar-Mutlaq-style exception is needed here since bare
    // noon-sakinah-before-ل/ر doesn't occur word-internally in practice,
    // but the across-word requirement itself must still hold: a lone,
    // single-word text can never trigger this rule.
    expect(idghamNoGhunnahOf("مِنْ")).toHaveLength(0);
  });

  it("does not flag Izhar (noon sakinah with explicit sukun before hamza, 6:99 مِّنْ أَعْنَابٍۢ)", () => {
    expect(idghamNoGhunnahOf("مِّنْ أَعْنَابٍۢ")).toHaveLength(0);
  });
});

describe("findTajweedRules — Ikhfa", () => {
  const ikhfaOf = (text) => findTajweedRules(text).hits.filter((h) => h.ruleType === "ikhfa");

  it("detects bare noon sakinah before fa within one word (2:3 يُنفِقُونَ)", () => {
    const hits = ikhfaOf("يُنفِقُونَ");
    expect(hits).toHaveLength(1);
    expect(hits[0].expectedCounts).toBe(2);
  });

  it("detects bare noon sakinah before ta within one word (2:33 كُنتُمْ)", () => {
    expect(ikhfaOf("كُنتُمْ")).toHaveLength(1);
  });

  it("detects bare noon sakinah before sheen across words (113:2 مِن شَرِّ مَا خَلَقَ)", () => {
    const hits = ikhfaOf("مِن شَرِّ مَا خَلَقَ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });

  it("also accepts a plain-script noon with explicit sukun (مِنْ شَرِّ)", () => {
    expect(ikhfaOf("مِنْ شَرِّ")).toHaveLength(1);
  });

  it("detects tanween before dal across words (6:99 قِنْوَانٌۭ دَانِيَةٌۭ)", () => {
    const hits = ikhfaOf("قِنْوَانٌۭ دَانِيَةٌۭ");
    expect(hits).toHaveLength(1);
    expect(hits[0].wordIndex).toBe(0);
  });
});

describe("findTajweedRules — Iqlab on real Uthmani encoding", () => {
  const iqlabOf = (text) => findTajweedRules(text).hits.filter((h) => h.ruleType === "iqlab");

  it("detects the bare noon carrying the small high meem (2:27 مِنۢ بَعْدِ)", () => {
    expect(iqlabOf("مِنۢ بَعْدِ")).toHaveLength(1);
  });

  it("detects tanween followed by ba (2:10 أَلِيمٌۢ بِمَا)", () => {
    expect(iqlabOf("أَلِيمٌۢ بِمَا")).toHaveLength(1);
  });

  it("does not misread a sequential-tanween meem mark as Iqlab when ب doesn't follow (6:99 شَىْءٍۢ فَأَخْرَجْنَا is Ikhfa)", () => {
    expect(iqlabOf("شَىْءٍۢ فَأَخْرَجْنَا")).toHaveLength(0);
    const { hits } = findTajweedRules("شَىْءٍۢ فَأَخْرَجْنَا");
    expect(hits.filter((h) => h.ruleType === "ikhfa")).toHaveLength(1);
  });
});
