import { describe, expect, it } from "vitest";
import {
  MINIMUM_AGE,
  validateBirthYear,
  validateTermsAccepted,
  validateSubscriptionSignup,
  validateLocalRegistration,
  validateCheckoutConsent,
} from "@/lib/signupValidation";

// Fixed "now" so year math is deterministic.
const NOW = new Date("2026-07-16T00:00:00Z");

describe("validateBirthYear (COPPA age gate)", () => {
  it("accepts an adult / clearly-old-enough year", () => {
    expect(validateBirthYear("1990", NOW)).toBeNull();
    expect(validateBirthYear(2000, NOW)).toBeNull();
  });

  it("accepts exactly the minimum age", () => {
    expect(validateBirthYear(String(2026 - MINIMUM_AGE), NOW)).toBeNull(); // turns 13 in 2026
  });

  it("blocks under-13 with a clear message", () => {
    const err = validateBirthYear(String(2026 - (MINIMUM_AGE - 1)), NOW);
    expect(err).toMatch(/at least 13/);
  });

  it("requires a year and rejects non-numeric / out-of-range input", () => {
    expect(validateBirthYear("", NOW)).toMatch(/enter your birth year/i);
    expect(validateBirthYear(null, NOW)).toMatch(/enter your birth year/i);
    expect(validateBirthYear("abcd", NOW)).toMatch(/enter your birth year/i);
    expect(validateBirthYear("1850", NOW)).toMatch(/valid birth year/i);
    expect(validateBirthYear("2100", NOW)).toMatch(/valid birth year/i); // future
  });
});

describe("validateTermsAccepted (clickwrap)", () => {
  it("passes only when actively accepted", () => {
    expect(validateTermsAccepted(true)).toBeNull();
    expect(validateTermsAccepted(false)).toMatch(/agree to the Terms/i);
    expect(validateTermsAccepted(undefined)).toMatch(/agree to the Terms/i);
  });
});

describe("validateSubscriptionSignup (age + clickwrap)", () => {
  it("passes when old enough AND accepted", () => {
    expect(validateSubscriptionSignup({ birthYear: "1995", agreedToTerms: true }, NOW)).toBeNull();
  });

  it("reports the age problem before the checkbox", () => {
    const err = validateSubscriptionSignup({ birthYear: "2020", agreedToTerms: false }, NOW);
    expect(err).toMatch(/at least 13/);
  });

  it("blocks when old enough but terms not accepted", () => {
    expect(validateSubscriptionSignup({ birthYear: "1995", agreedToTerms: false }, NOW)).toMatch(
      /agree to the Terms/i
    );
  });
});

describe("validateLocalRegistration (password + clickwrap, no age gate)", () => {
  it("passes with matching 6+ char password and accepted terms", () => {
    expect(
      validateLocalRegistration({ password: "secret1", confirmPassword: "secret1", agreedToTerms: true })
    ).toBeNull();
  });

  it("enforces password match, length, then clickwrap in that order", () => {
    expect(
      validateLocalRegistration({ password: "a", confirmPassword: "b", agreedToTerms: true })
    ).toMatch(/do not match/i);
    expect(
      validateLocalRegistration({ password: "12345", confirmPassword: "12345", agreedToTerms: true })
    ).toMatch(/at least 6/i);
    expect(
      validateLocalRegistration({ password: "secret1", confirmPassword: "secret1", agreedToTerms: false })
    ).toMatch(/agree to the Terms/i);
  });
});

describe("validateCheckoutConsent (immediate delivery / withdrawal waiver)", () => {
  it("passes only when the consent is checked", () => {
    expect(validateCheckoutConsent({ immediateDeliveryConsent: true })).toBeNull();
    expect(validateCheckoutConsent({ immediateDeliveryConsent: false })).toMatch(/immediate access/i);
  });
});
