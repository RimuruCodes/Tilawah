// Creates a Stripe Billing Portal session for the caller's existing
// subscription, so they can update payment method, change plan, or cancel
// without us building any of that UI ourselves.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";
import { getAuthenticatedUser, getServiceRoleClient } from "../_shared/authUser.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const user = await getAuthenticatedUser(req);
    const supabase = getServiceRoleClient();

    const { data } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!data?.stripe_customer_id) {
      return new Response(JSON.stringify({ error: "No subscription found for this account" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = getStripeClient();
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";
    const portalSession = await stripe.billingPortal.sessions.create({
      customer: data.stripe_customer_id,
      return_url: `${appBaseUrl}/settings`,
    });

    return new Response(JSON.stringify({ url: portalSession.url }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    const status = message.includes("Authorization") || message.includes("session") ? 401 : 500;
    return new Response(JSON.stringify({ error: message }), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
