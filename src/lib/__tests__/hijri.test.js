import { describe, it, expect } from "vitest";
import { getHijriDate } from "@/lib/hijri";

// Reference dates from the official Umm al-Qura calendar. Noon UTC avoids
// timezone edge-of-day ambiguity in the test environment.
const at = (iso) => new Date(`${iso}T12:00:00Z`);

describe("hijri date conversion (islamic-umalqura)", () => {
  it("matches Ramadan 1, 1445 (2024-03-11)", () => {
    const h = getHijriDate(at("2024-03-11"));
    expect([h.day, h.month, h.year]).toEqual([1, 9, 1445]);
    expect(h.isRamadan).toBe(true);
  });

  it("matches Ramadan 1, 1446 (2025-03-01)", () => {
    const h = getHijriDate(at("2025-03-01"));
    expect([h.day, h.month, h.year]).toEqual([1, 9, 1446]);
    expect(h.isRamadan).toBe(true);
  });

  it("matches Eid al-Adha 1445 (Dhul-Hijjah 10 = 2024-06-16) and is not Ramadan", () => {
    const h = getHijriDate(at("2024-06-16"));
    expect([h.day, h.month, h.year]).toEqual([10, 12, 1445]);
    expect(h.isRamadan).toBe(false);
  });

  it("formats a display string with month name and AH", () => {
    const h = getHijriDate(at("2024-03-11"));
    expect(h.formatted).toMatch(/Ramadan 1, 1445 AH/);
  });
});
