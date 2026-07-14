import { describe, it, expect } from "vitest";
import { usableHadith, getBooks, HADITH_COLLECTIONS } from "@/lib/hadithData";

describe("hadith content policy", () => {
  it("only exposes the two Sahih collections", () => {
    expect(HADITH_COLLECTIONS.map((c) => c.name)).toEqual(["Sahih al-Bukhari", "Sahih Muslim"]);
  });

  it("drops entries with empty text (chapter placeholders in the dataset)", () => {
    expect(usableHadith({ text: "", grades: [] })).toBe(false);
    expect(usableHadith({ text: "   ", grades: [] })).toBe(false);
    expect(usableHadith(null)).toBe(false);
    expect(usableHadith({ text: "Actions are by intentions.", grades: [] })).toBe(true);
  });

  it("drops any entry explicitly graded as other than sahih (safety net)", () => {
    // No such entries exist in either collection today — this pins the
    // behavior in case the dataset ever adds graded exceptions.
    expect(usableHadith({ text: "x", grades: [{ name: "Al-Albani", grade: "Da'if" }] })).toBe(false);
    expect(usableHadith({ text: "x", grades: [{ name: "Al-Albani", grade: "Hasan" }] })).toBe(false);
    expect(usableHadith({ text: "x", grades: [{ name: "Al-Albani", grade: "Sahih" }] })).toBe(true);
    expect(usableHadith({ text: "x", grades: [{ name: "Zubair Ali Zai", grade: "Sahih Lighairihi" }] })).toBe(true);
  });

  it("ships book indexes for both collections with valid ranges", () => {
    const bukhari = getBooks("bukhari");
    const muslim = getBooks("muslim");
    expect(bukhari.length).toBeGreaterThan(90);
    expect(muslim.length).toBeGreaterThan(50);
    for (const book of [...bukhari, ...muslim]) {
      expect(book.name).toBeTruthy();
      expect(book.first).toBeGreaterThanOrEqual(1);
      expect(book.last).toBeGreaterThanOrEqual(book.first);
    }
  });
});
