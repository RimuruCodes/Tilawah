import { describe, it, expect } from "vitest";
import {
  isSubscriptionActive,
  canAccessFeature,
  describeSubscription,
  GATED_FEATURES,
  isOwnerEmail,
  OWNER_SUBSCRIPTION,
} from "@/lib/entitlements";

const NOW = new Date("2026-06-15T00:00:00Z");
const FUTURE = "2026-07-01T00:00:00Z";
const PAST = "2026-05-01T00:00:00Z";

describe("isSubscriptionActive", () => {
  it("is false when there is no subscription", () => {
    expect(isSubscriptionActive(null, NOW)).toBe(false);
    expect(isSubscriptionActive(undefined, NOW)).toBe(false);
  });

  it("is true for active and trialing statuses", () => {
    expect(isSubscriptionActive({ status: "active" }, NOW)).toBe(true);
    expect(isSubscriptionActive({ status: "trialing" }, NOW)).toBe(true);
  });

  it("is false for past_due or canceled without a grace period", () => {
    expect(isSubscriptionActive({ status: "past_due" }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: "canceled", cancel_at_period_end: false }, NOW)).toBe(false);
  });

  it("stays true through the paid period after cancellation (grace period)", () => {
    const subscription = { status: "canceled", cancel_at_period_end: true, current_period_end: FUTURE };
    expect(isSubscriptionActive(subscription, NOW)).toBe(true);
  });

  it("is false once the grace period's paid-through date has passed", () => {
    const subscription = { status: "canceled", cancel_at_period_end: true, current_period_end: PAST };
    expect(isSubscriptionActive(subscription, NOW)).toBe(false);
  });

  it("an active subscription flagged to cancel later is still active now", () => {
    const subscription = { status: "active", cancel_at_period_end: true, current_period_end: FUTURE };
    expect(isSubscriptionActive(subscription, NOW)).toBe(true);
  });
});

describe("canAccessFeature", () => {
  const active = { status: "active" };

  it("grants access to every known feature when the subscription is active", () => {
    Object.values(GATED_FEATURES).forEach((featureKey) => {
      expect(canAccessFeature(featureKey, active, NOW)).toBe(true);
    });
  });

  it("single-ayah analysis and its Tajweed checks are free — no subscription needed", () => {
    expect(canAccessFeature(GATED_FEATURES.SINGLE_AYAH_ANALYSIS, null, NOW)).toBe(true);
    expect(canAccessFeature(GATED_FEATURES.TAJWEED_CHECKS, null, NOW)).toBe(true);
  });

  it("continuous recitation and Tajweed Trends still require a subscription", () => {
    expect(canAccessFeature(GATED_FEATURES.CONTINUOUS_RECITATION, null, NOW)).toBe(false);
    expect(canAccessFeature(GATED_FEATURES.TAJWEED_TRENDS, null, NOW)).toBe(false);
  });

  it("throws on an unknown feature key rather than silently granting/denying access", () => {
    expect(() => canAccessFeature("someTypoedFeature", active, NOW)).toThrow(/Unknown gated feature/);
  });
});

describe("owner account", () => {
  it("matches the owner email case-insensitively and with surrounding whitespace", () => {
    expect(isOwnerEmail("alaminoyeyemi64@gmail.com")).toBe(true);
    expect(isOwnerEmail("AlAminOyeyemi64@Gmail.com")).toBe(true);
    expect(isOwnerEmail("  alaminoyeyemi64@gmail.com  ")).toBe(true);
  });

  it("does not match other emails or missing values", () => {
    expect(isOwnerEmail("alaminoyeyemi63@gmail.com")).toBe(false);
    expect(isOwnerEmail("someone@example.com")).toBe(false);
    expect(isOwnerEmail(null)).toBe(false);
    expect(isOwnerEmail(undefined)).toBe(false);
  });

  it("the synthetic owner subscription unlocks every feature", () => {
    Object.values(GATED_FEATURES).forEach((featureKey) => {
      expect(canAccessFeature(featureKey, OWNER_SUBSCRIPTION, NOW)).toBe(true);
    });
  });

  it("describes the owner subscription as an active Owner plan", () => {
    expect(describeSubscription(OWNER_SUBSCRIPTION, NOW)).toEqual({
      active: true,
      label: "Owner plan",
      detail: null,
    });
  });
});

describe("describeSubscription", () => {
  it("describes a free user", () => {
    expect(describeSubscription(null, NOW)).toEqual({ active: false, label: "Free plan", detail: null });
  });

  it("describes an active monthly subscription with its renewal date", () => {
    const result = describeSubscription({ status: "active", plan: "monthly", current_period_end: FUTURE }, NOW);
    expect(result.active).toBe(true);
    expect(result.label).toBe("Monthly plan");
    // Stripe subscriptions auto-renew, so the date shown is a renewal date.
    expect(result.detail).toMatch(/^Renews on/);
  });

  it("Stripe lifecycle statuses map to the right entitlement", () => {
    // What the webhook writes is Stripe's own status strings — the pure
    // logic must interpret each of them the way the UI promises.
    expect(isSubscriptionActive({ status: "trialing", plan: "monthly" }, NOW)).toBe(true);
    expect(isSubscriptionActive({ status: "incomplete", plan: "monthly" }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: "incomplete_expired", plan: "monthly" }, NOW)).toBe(false);
    expect(isSubscriptionActive({ status: "unpaid", plan: "monthly" }, NOW)).toBe(false);
    // past_due with a still-future period end but NOT flagged to cancel:
    // no grace — access follows successful payment, not optimism.
    expect(isSubscriptionActive({ status: "past_due", current_period_end: FUTURE }, NOW)).toBe(false);
  });

  it("describes a yearly subscription set to cancel", () => {
    const result = describeSubscription(
      { status: "active", plan: "yearly", cancel_at_period_end: true, current_period_end: FUTURE },
      NOW
    );
    expect(result.active).toBe(true);
    expect(result.label).toBe("Yearly plan");
    expect(result.detail).toMatch(/^Cancels on/);
  });

  it("describes an expired subscription as the free plan", () => {
    const result = describeSubscription(
      { status: "canceled", cancel_at_period_end: true, current_period_end: PAST },
      NOW
    );
    expect(result).toEqual({ active: false, label: "Free plan", detail: null });
  });
});
