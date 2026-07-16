import Stripe from "npm:stripe@17";

// TEST MODE LOCK: while this is false, every function refuses to start with
// anything but a Stripe TEST key (sk_test_...). Going live is a deliberate
// code change here — flipped together with swapping in live keys — never an
// accident of which key happened to be in the environment.
//
// LIVE since 2026-07-16: the live secret key, live webhook signing secret,
// and live price IDs were all set in the Supabase function secrets first;
// this flag was flipped last, so the lock only ever opened onto a fully
// live-configured environment. Flip back to false to return to test mode
// (and swap the secrets back — the flag alone doesn't do it).
const ALLOW_LIVE_STRIPE_KEYS = true;

// One Stripe client per function invocation (Edge Functions are short-lived
// isolates, so there's no long-running process to leak connections from).
export function getStripeClient(): Stripe {
  const secretKey = Deno.env.get("STRIPE_SECRET_KEY");
  if (!secretKey) {
    throw new Error("STRIPE_SECRET_KEY is not configured");
  }
  if (!ALLOW_LIVE_STRIPE_KEYS && !secretKey.startsWith("sk_test_")) {
    throw new Error(
      "Refusing to start: STRIPE_SECRET_KEY is not a test key (sk_test_...) and live mode hasn't been enabled in stripeClient.ts"
    );
  }
  return new Stripe(secretKey, {
    apiVersion: "2024-06-20",
    httpClient: Stripe.createFetchHttpClient(),
  });
}

export function priceIdForPlan(plan: string): string {
  const key = plan === "yearly" ? "STRIPE_PRICE_ID_YEARLY" : "STRIPE_PRICE_ID_MONTHLY";
  const priceId = Deno.env.get(key);
  if (!priceId) {
    throw new Error(`${key} is not configured`);
  }
  return priceId;
}
