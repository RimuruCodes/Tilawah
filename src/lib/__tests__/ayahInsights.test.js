import { describe, it, expect } from "vitest";
import { toWordEntries } from "@/lib/ayahInsights";

describe("word-by-word entry filtering", () => {
  it("keeps real words and drops the ayah-number glyph (char_type 'end')", () => {
    const apiWords = [
      { char_type_name: "word", text_uthmani: "ٱلْحَمْدُ", translation: { text: "All praises and thanks" }, transliteration: { text: "al-ḥamdu" } },
      { char_type_name: "word", text_uthmani: "لِلَّهِ", translation: { text: "(be) to Allah" }, transliteration: { text: "lillahi" } },
      { char_type_name: "end", text_uthmani: "٢", translation: { text: "(2)" }, transliteration: { text: null } },
    ];
    const entries = toWordEntries(apiWords);
    expect(entries).toHaveLength(2);
    expect(entries[0]).toEqual({ arabic: "ٱلْحَمْدُ", meaning: "All praises and thanks", transliteration: "al-ḥamdu" });
  });

  it("tolerates missing fields without throwing", () => {
    expect(toWordEntries(null)).toEqual([]);
    expect(toWordEntries([{ char_type_name: "word", text_uthmani: "كلمة" }])).toEqual([
      { arabic: "كلمة", meaning: "", transliteration: "" },
    ]);
  });
});
