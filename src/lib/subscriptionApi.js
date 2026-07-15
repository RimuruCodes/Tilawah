// Thin I/O layer between the UI and Supabase (Auth + Postgres + Edge
// Functions). Kept separate from src/lib/entitlements.js so the actual
// entitlement rules stay pure and unit-testable — this file is the part
// that talks to the network.
//
// Subscription payments go through Stripe Checkout (TEST MODE until
// launch): the `checkout` Edge Function creates the hosted payment page,
// and the `stripe-webhook` function is the only thing that ever writes
// subscription state — the client only reads it. (Cash App remains only
// for voluntary donations — see src/lib/payments.js.)
import { supabase } from "@/lib/supabaseClient";
import {
  clearSubscriberOwner,
  getSubscriberOwner,
  setSubscriberOwner,
  shouldSignOutSubscriber,
} from "@/lib/subscriberIdentity";

function requireBackend() {
  if (!supabase) throw new Error("Subscriptions aren't available in this build.");
}

// Records that the Supabase subscriber session now belongs to this local
// account — called right after a successful OTP verify (subscribing or
// restoring). See src/lib/subscriberIdentity.js for why this linkage
// exists.
export function claimSubscriberSession(localUserId) {
  setSubscriberOwner(localUserId);
}

// Reconciles the Supabase subscriber session against the currently
// signed-in local account, signing it out if it doesn't belong to them.
// Safe to call with a null id (logged-out state) and safe when the backend
// isn't configured (no-op). See shouldSignOutSubscriber for the rules.
export async function reconcileSubscriberSession(currentLocalId) {
  if (!supabase) return;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  const signOut = shouldSignOutSubscriber({
    hasSubscriberSession: !!session,
    ownerLocalId: getSubscriberOwner(),
    currentLocalId: currentLocalId ?? null,
  });
  if (signOut) {
    await supabase.auth.signOut();
    clearSubscriberOwner();
  }
}

// Step 1 of proving email ownership: Supabase emails a 6-digit code
// (custom Brevo SMTP + the code template in supabase/config.toml).
// `shouldCreateUser: true` means the very first time someone subscribes,
// this transparently creates their Supabase Auth user — no separate signup.
export async function requestLoginCode(email) {
  requireBackend();
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });
  if (error) throw error;
}

// Step 2: exchanges the emailed code for a real session.
export async function verifyLoginCode(email, code) {
  requireBackend();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw error;
  return data.session;
}

// Returns the caller's subscription row, or null if they've never
// subscribed (or aren't signed in at all) — both are the same "free tier"
// state from the UI's perspective.
export async function getSubscriptionStatus() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return null;

  const { data, error } = await supabase.from("subscriptions").select("*").maybeSingle();
  if (error) throw error;
  return data;
}

export async function subscriberSignOut() {
  clearSubscriberOwner();
  if (!supabase) return;
  await supabase.auth.signOut();
}

// Shared shape for the two Edge Function calls below: both return a URL to
// send the browser to (Stripe-hosted pages — the app never sees card data).
async function invokeForUrl(functionName, body) {
  requireBackend();
  const { data, error } = await supabase.functions.invoke(functionName, { body });
  if (error) {
    // supabase-js wraps non-2xx responses; surface the function's own
    // error message when it sent one.
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || "The subscription service is unavailable right now.");
  }
  if (!data?.url) throw new Error("The subscription service returned no redirect URL.");
  return data.url;
}

// Creates a Stripe Checkout session for the signed-in user and returns the
// hosted payment page URL. `plan` is "monthly" or "yearly".
export async function startCheckout(plan) {
  return invokeForUrl("checkout", { plan });
}

// Returns the Stripe Billing Portal URL, where an existing subscriber can
// change plan, update card, or cancel — all Stripe-hosted.
export async function openBillingPortalUrl() {
  return invokeForUrl("billing-portal", {});
}
