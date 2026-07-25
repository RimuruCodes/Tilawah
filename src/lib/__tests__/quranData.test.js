import { describe, it, expect, vi, afterEach } from "vitest";
import { stripPrependedBasmalah, fetchSurahText } from "@/lib/quranData";

// Built from verified codepoints, not hand-typed: a hand-typed Arabic string
// with the same diacritics can silently end up with combining marks in a
// different order (e.g. fatha before shadda instead of after) and LOOK
// identical while comparing unequal to the API's actual byte sequence —
// exactly the failure mode stripPrependedBasmalah's own source constant
// (BASMALAH_UTHMANI in quranData.js) is built this way to avoid.
const BASMALAH = String.fromCodePoint(
  0x628, 0x650, 0x633, 0x652, 0x645, 0x650, 0x20,
  0x671, 0x644, 0x644, 0x651, 0x64e, 0x647, 0x650, 0x20,
  0x671, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x652, 0x645, 0x64e, 0x670, 0x646, 0x650, 0x20,
  0x671, 0x644, 0x631, 0x651, 0x64e, 0x62d, 0x650, 0x64a, 0x645, 0x650
);

describe("stripPrependedBasmalah", () => {
  it("strips the prepended Basmalah from ayah 1 of an ordinary surah", () => {
    const text = `${BASMALAH} يسٓ`;
    expect(stripPrependedBasmalah(text, 36, 1)).toBe("يسٓ");
  });

  it("strips the prepended Basmalah from a multi-word ayah 1", () => {
    const text = `${BASMALAH} قُلْ هُوَ ٱللَّهُ أَحَدٌ`;
    expect(stripPrependedBasmalah(text, 112, 1)).toBe("قُلْ هُوَ ٱللَّهُ أَحَدٌ");
  });

  it("leaves Al-Fatihah's ayah 1 untouched — the Basmalah IS verse 1 there", () => {
    expect(stripPrependedBasmalah(BASMALAH, 1, 1)).toBe(BASMALAH);
  });

  it("leaves At-Tawbah's ayah 1 untouched — it has no Basmalah to strip", () => {
    const text = "لَرَآءَةٌ مِّنَ ٱللَّهِ وَرَسُولِهِۦٓ";
    expect(stripPrependedBasmalah(text, 9, 1)).toBe(text);
  });

  it("leaves ayahs other than 1 untouched, even if they happen to start with similar text", () => {
    const text = `${BASMALAH} extra`;
    expect(stripPrependedBasmalah(text, 36, 2)).toBe(text);
  });

  it("leaves ayah 1 untouched when it does not actually start with the Basmalah", () => {
    const text = "قُلْ هُوَ ٱللَّهُ أَحَدٌ";
    expect(stripPrependedBasmalah(text, 112, 1)).toBe(text);
  });
});

describe("fetchSurahText", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("strips the Basmalah prefix from ayah 1 in the fetched result, leaving other ayahs untouched", async () => {
    const mockResponse = {
      code: 200,
      data: [
        {
          ayahs: [
            { numberInSurah: 1, text: `${BASMALAH} يسٓ`, juz: 22, page: 440 },
            { numberInSurah: 2, text: "وَٱلْقُرْءَانِ ٱلْحَكِيمِ", juz: 22, page: 440 },
          ],
        },
        {
          ayahs: [
            { text: "Ya, Sin." },
            { text: "By the wise Qur'an." },
          ],
        },
      ],
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => mockResponse,
    }));

    const ayahs = await fetchSurahText(36);
    expect(ayahs[0].arabic).toBe("يسٓ");
    expect(ayahs[1].arabic).toBe("وَٱلْقُرْءَانِ ٱلْحَكِيمِ");
  });
});
