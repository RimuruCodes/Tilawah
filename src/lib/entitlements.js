// Pure entitlement logic for the subscription system. No I/O here — the
// `subscription` argument is always the plain row already fetched from
// Supabase (see src/lib/subscriptionApi.js / SubscriptionContext.jsx), so
// this module stays trivially unit-testable and has no knowledge of how
// that row got fetched.

const GRANTED_STATUSES = new Set(["active", "trialing"]);

// The app owner's account gets every feature comped, matched by the email
// of the signed-in local account (see SubscriptionContext). Honest limit:
// local accounts aren't email-verified, so anyone who registers with this
// address on their own device would also match — like the rest of the
// client-side gating, this is a convenience, not a security boundary.
const OWNER_EMAILS = new Set(["alaminoyeyemi64@gmail.com"]);

export function isOwnerEmail(email) {
  return typeof email === "string" && OWNER_EMAILS.has(email.trim().toLowerCase());
}

// The local account no longer stores a plaintext email — only a one-way
// SHA-256 hash (see src/lib/localAuth.js hashEmail). Owner comp therefore
// matches on the hash. These MUST correspond to OWNER_EMAILS above:
//   node -e "crypto.createHash('sha256').update('EMAIL').digest('hex')"
// (an e2e guard in e2e/fixtures.js re-derives and asserts this match).
const OWNER_EMAIL_HASHES = new Set([
  "a3e61f545e3decd4fe0524ee015973b4adca78597ad07ded87480354dd694c26", // alaminoyeyemi64@gmail.com
]);

export function isOwnerEmailHash(emailHash) {
  return typeof emailHash === "string" && OWNER_EMAIL_HASHES.has(emailHash.toLowerCase());
}

// Shaped like a real subscription row so isSubscriptionActive,
// canAccessFeature and describeSubscription all treat it uniformly.
export const OWNER_SUBSCRIPTION = Object.freeze({ status: "active", plan: "owner" });

// A subscription still counts as active through the end of a period the
// user already paid for, even after they've cancelled (cancel_at_period_end)
// or Stripe has otherwise marked it non-renewing — losing access instantly
// on cancellation would be a worse product experience than most SaaS billing.
export function isSubscriptionActive(subscription, now = new Date()) {
  if (!subscription) return false;
  if (GRANTED_STATUSES.has(subscription.status)) return true;
  if (subscription.cancel_at_period_end && subscription.current_period_end) {
    return new Date(subscription.current_period_end) > now;
  }
  return false;
}

// Every feature that goes through an entitlement check — kept as named
// constants rather than bare strings so a typo'd key fails loudly instead
// of silently granting/denying access. Which of these actually require a
// subscription is decided in canAccessFeature below.
export const GATED_FEATURES = Object.freeze({
  SINGLE_AYAH_ANALYSIS: "singleAyahAnalysis",
  CONTINUOUS_RECITATION: "continuousRecitation",
  TAJWEED_CHECKS: "tajweedChecks",
  TAJWEED_TRENDS: "tajweedTrends",
});

const GATED_FEATURE_KEYS = new Set(Object.values(GATED_FEATURES));

// Single-ayah recitation analysis (and the Tajweed checks shown in its
// results) is free for everyone — the subscription unlocks "Recite all"
// continuous mode and the Tajweed Trends charts.
export const FREE_FEATURES = Object.freeze(
  new Set([GATED_FEATURES.SINGLE_AYAH_ANALYSIS, GATED_FEATURES.TAJWEED_CHECKS])
);

export function canAccessFeature(featureKey, subscription, now = new Date()) {
  if (!GATED_FEATURE_KEYS.has(featureKey)) {
    throw new Error(`Unknown gated feature: "${featureKey}"`);
  }
  if (FREE_FEATURES.has(featureKey)) return true;
  return isSubscriptionActive(subscription, now);
}

const PLAN_LABELS = { monthly: "Monthly", yearly: "Yearly", owner: "Owner" };

function formatDate(isoString) {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

// Formats plan/renewal copy for the Settings > Subscription section.
export function describeSubscription(subscription, now = new Date()) {
  if (!isSubscriptionActive(subscription, now)) {
    return { active: false, label: "Free plan", detail: null };
  }

  const label = `${PLAN_LABELS[subscription.plan] || "Subscriber"} plan`;
  const renewalDate = subscription.current_period_end ? formatDate(subscription.current_period_end) : null;

  if (subscription.cancel_at_period_end) {
    return {
      active: true,
      label,
      detail: renewalDate
        ? `Cancels on ${renewalDate} — you'll keep access until then.`
        : "Cancels at the end of the current billing period.",
    };
  }

  // Stripe subscriptions auto-renew, so this genuinely is a renewal date.
  return {
    active: true,
    label,
    detail: renewalDate ? `Renews on ${renewalDate}.` : null,
  };
}
