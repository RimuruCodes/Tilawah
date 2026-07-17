// Permanently deletes the caller's SUBSCRIBER account: cancels any live
// Stripe subscription, removes their subscriptions row, and deletes their
// Supabase auth user.
//
// Why this exists: local "Delete account" only ever wiped on-device data,
// so a subscriber who deleted their account kept their backend row AND kept
// being billed. The Privacy Policy promises deletion removes subscription
// data — this is what makes that true.
//
// Honest limit (mirrored in the Privacy Policy): Stripe retains the
// underlying payment/transaction records for its own accounting and legal
// compliance. We cancel the subscription and delete the customer's link to
// us; we cannot erase Stripe's financial history, and we don't claim to.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";
import { getAuthenticatedUser, getServiceRoleClient } from "../_shared/authUser.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const user = await getAuthenticatedUser(req);
    const supabase = getServiceRoleClient();

    const { data: row } = await supabase
      .from("subscriptions")
      .select("stripe_subscription_id")
      .eq("user_id", user.id)
      .maybeSingle();

    // Cancel the subscription BEFORE deleting the row — if cancellation
    // fails we must keep the row, or we'd lose the only pointer to a
    // still-billing Stripe subscription.
    let cancelled = false;
    if (row?.stripe_subscription_id) {
      const stripe = getStripeClient();
      try {
        await stripe.subscriptions.cancel(row.stripe_subscription_id);
        cancelled = true;
      } catch (err) {
        // Already-cancelled/absent subscriptions are fine to proceed past;
        // anything else must surface so the caller doesn't wipe their local
        // account while still being charged.
        const message = err instanceof Error ? err.message : String(err);
        const alreadyGone = /No such subscription|already canceled|resource_missing/i.test(message);
        if (!alreadyGone) {
          return json({ error: `Couldn't cancel your Stripe subscription: ${message}` }, 502);
        }
        cancelled = true;
      }
    }

    const { error: rowError } = await supabase.from("subscriptions").delete().eq("user_id", user.id);
    if (rowError) {
      return json({ error: `Couldn't delete your subscription record: ${rowError.message}` }, 500);
    }

    // Last: the auth user itself (this also invalidates their session).
    const { error: userError } = await supabase.auth.admin.deleteUser(user.id);
    if (userError) {
      return json({ error: `Couldn't delete your account record: ${userError.message}` }, 500);
    }

    return json({ deleted: true, subscriptionCancelled: cancelled });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = /Authorization|session/i.test(message) ? 401 : 500;
    return json({ error: message }, status);
  }
});
