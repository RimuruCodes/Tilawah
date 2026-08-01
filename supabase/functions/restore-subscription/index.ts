// "Restore purchase" for a returning subscriber whose subscription email
// differs from the email they're signed into on this device — the primary,
// intended use case for this feature (see RestoreSubscriptionModal.jsx).
//
// SECURITY-CRITICAL (2026-08-01 code audit): the OLD client-side flow called
// supabase.auth.verifyOtp() directly in the browser. verifyOtp is a real
// sign-in — on success it establishes a Supabase session for whichever
// account owns that email, on the app's ONE shared Supabase client
// (src/lib/supabaseClient.js). Since AuthContext.jsx adopts any session that
// fires unconditionally, entering a DIFFERENT person's subscription email —
// exactly what this form asks for — silently logged the caller into that
// other account, swapping their entire identity (their own recitation
// history, streaks, progress all became unreachable, scoped by the new
// activeUser.id). The code's own comment claimed a reconcile mechanism
// protected against this; that mechanism (reconcileSubscriberSession) turned
// out to have zero call sites anywhere in the app.
//
// Fix: OTP verification now happens HERE, server-side, using a throwaway
// Supabase client scoped to this single function invocation only
// (persistSession/autoRefreshToken both off — nothing about it survives past
// this request). Verifying proves the caller knows that email's code without
// ever creating a durable session for it, and this response NEVER contains a
// session/access/refresh token — only plan/status/renewal-date fields. The
// caller's own session (verified via the real Authorization header, same as
// checkout/billing-portal/delete-account) is never touched. If the verified
// email's account has an active subscription, its `subscriptions` row (and
// the Stripe subscription's own metadata, so future webhook events keep
// routing correctly) is TRANSFERRED to the caller's own user_id — the
// entitlement moves to the account the caller is actually using, rather than
// requiring them to use the other account's identity at all.
import { createClient } from "npm:@supabase/supabase-js@2";
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";
import { getAuthenticatedUser, getServiceRoleClient } from "../_shared/authUser.ts";

// Mirrors src/lib/entitlements.js's isSubscriptionActive. Duplicated (not
// imported) because this Deno Edge Function isolate has no access to the
// Vite app's src/ tree — keep these two in sync by hand if the grace-period
// rule ever changes.
function isActiveish(row: { status?: string; cancel_at_period_end?: boolean; current_period_end?: string | null } | null, now = new Date()) {
  if (!row) return false;
  if (row.status === "active" || row.status === "trialing") return true;
  if (row.cancel_at_period_end && row.current_period_end) {
    return new Date(row.current_period_end) > now;
  }
  return false;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const caller = await getAuthenticatedUser(req);
    const { email, token } = await req.json();
    if (typeof email !== "string" || !email.trim() || typeof token !== "string" || !token.trim()) {
      return json({ error: "email and token are required" }, 400);
    }

    // Throwaway client: verifies the code without ever persisting or
    // returning the resulting session. Discarded when this invocation ends.
    const verifyClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
    );
    const { data: verifyData, error: verifyError } = await verifyClient.auth.verifyOtp({
      email: email.trim(),
      token: token.trim(),
      type: "email",
    });
    if (verifyError || !verifyData.user) {
      return json({ error: "That code didn't work — check it and try again." }, 400);
    }
    const restoredUserId = verifyData.user.id;

    const supabase = getServiceRoleClient();

    // Restoring the email already signed in here is a no-op — just report
    // the caller's own current entitlement.
    if (restoredUserId === caller.id) {
      const { data: ownRow } = await supabase.from("subscriptions").select("*").eq("user_id", caller.id).maybeSingle();
      return json({
        plan: ownRow?.plan ?? null,
        status: ownRow?.status ?? "none",
        currentPeriodEnd: ownRow?.current_period_end ?? null,
        cancelAtPeriodEnd: ownRow?.cancel_at_period_end ?? false,
      });
    }

    const { data: restoredRow } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", restoredUserId)
      .maybeSingle();
    if (!isActiveish(restoredRow)) {
      return json(
        { error: "No active subscription was found for that email. If you subscribed with a different address, try that one." },
        404
      );
    }

    const { data: callerRow } = await supabase.from("subscriptions").select("*").eq("user_id", caller.id).maybeSingle();
    if (isActiveish(callerRow)) {
      return json(
        { error: "This account already has its own active subscription — restoring a different one would replace it. Contact support if you need help merging subscriptions." },
        409
      );
    }

    // Repoint the Stripe subscription's own metadata FIRST: customer.subscription.updated
    // webhooks key off metadata.supabase_user_id to find the row to update
    // (see stripe-webhook/index.ts). If this step fails, abort before
    // touching Postgres — a transferred DB row whose Stripe metadata still
    // points at the old user_id would silently stop receiving renewal/
    // cancellation updates from Stripe with no visible error.
    if (restoredRow!.stripe_subscription_id) {
      try {
        const stripe = getStripeClient();
        await stripe.subscriptions.update(restoredRow!.stripe_subscription_id, {
          metadata: { supabase_user_id: caller.id, plan: restoredRow!.plan ?? "monthly" },
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return json({ error: `Couldn't transfer the subscription — try again in a moment. (${message})` }, 502);
      }
    }

    // Same primary-key value can't exist twice: clear the caller's own row
    // first (already confirmed non-active above) so the transfer below
    // doesn't collide with it.
    if (callerRow) {
      await supabase.from("subscriptions").delete().eq("user_id", caller.id);
    }
    const { error: transferError } = await supabase
      .from("subscriptions")
      .update({ user_id: caller.id })
      .eq("user_id", restoredUserId);
    if (transferError) {
      // Stripe metadata now points at caller.id but the DB row didn't move —
      // the next webhook event will find no matching row until this is
      // manually reconciled. Rare (only on an infra-level UPDATE failure
      // immediately after successful validation), but flagged honestly
      // rather than silently claimed as fixed.
      return json({ error: `Subscription transfer partially failed: ${transferError.message}. Contact support.` }, 500);
    }

    const { data: finalRow } = await supabase.from("subscriptions").select("*").eq("user_id", caller.id).maybeSingle();
    return json({
      plan: finalRow?.plan ?? null,
      status: finalRow?.status ?? "none",
      currentPeriodEnd: finalRow?.current_period_end ?? null,
      cancelAtPeriodEnd: finalRow?.cancel_at_period_end ?? false,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = /Authorization|session/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
