// Thin I/O layer between the UI and Supabase (Auth + Postgres + Edge
// Functions). Kept separate from src/lib/entitlements.js so the actual
// entitlement rules stay pure and unit-testable — this file is the part
// that talks to the network.
//
// Subscription payments go through Stripe Checkout (LIVE since 2026-07-16
// — real cards are charged): the `checkout` Edge Function creates the
// hosted payment page, and the `stripe-webhook` function is the only thing
// that ever writes subscription state — the client only reads it. (Cash App
// remains only for voluntary donations — see src/lib/payments.js.)
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

// Step 2: exchanges the emailed code for a real session. Used ONLY by
// UpgradeModal, where the email is already guaranteed (via an emailHash
// check before the code is even sent) to match the account signed in on
// this device — so the session this establishes is the same identity,
// never a different one. Do NOT reuse this for a flow that lets the email
// differ from the signed-in account (see restoreSubscriptionByEmail below
// and its header comment for why that's a real hazard, not a style choice).
export async function verifyLoginCode(email, code) {
  requireBackend();
  const { data, error } = await supabase.auth.verifyOtp({ email, token: code, type: "email" });
  if (error) throw error;
  return data.session;
}

// "Restore purchase": verifies a subscription email that may be DIFFERENT
// from the one this device is signed in as (see RestoreSubscriptionModal.jsx
// — that's its whole point). Unlike verifyLoginCode, this never calls
// supabase.auth.verifyOtp() on the client — doing so would establish a real
// session for that other email on the app's one shared Supabase client,
// silently swapping the caller's logged-in identity (the bug found in the
// 2026-08-01 code audit; see restore-subscription Edge Function's header
// comment for the full trace). Verification happens server-side instead,
// via a throwaway client scoped to that single request; this call only ever
// gets back plan/status/renewal fields, never a token, and the caller's own
// session is untouched throughout. On success, the restored subscription's
// entitlement is transferred to the CALLER's own account server-side.
export async function restoreSubscriptionByEmail(email, code) {
  requireBackend();
  const { data, error } = await supabase.functions.invoke("restore-subscription", {
    body: { email, token: code },
  });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || "That code didn't work — check it and try again.");
  }
  return data;
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

// Permanently deletes the backend half of an account: cancels any live
// Stripe subscription and removes the Supabase row + auth user. Free users
// have no Supabase session and nothing backend-side to delete, so this
// resolves to { deleted: false } for them rather than erroring.
//
// THROWS if the deletion genuinely failed — the caller must NOT wipe the
// local account in that case, or the person is left still-subscribed, still
// being billed, and without the account that would tell them so.
export async function deleteSubscriberAccount() {
  if (!supabase) return { deleted: false, reason: "no-backend" };
  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session) return { deleted: false, reason: "no-session" };

  const { data, error } = await supabase.functions.invoke("delete-account", { body: {} });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(
      detail?.error || error.message || "Couldn't delete your subscription data — nothing was changed."
    );
  }
  // The auth user is gone server-side; drop the local session/marker too.
  await supabase.auth.signOut();
  clearSubscriberOwner();
  return { deleted: true, ...data };
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
