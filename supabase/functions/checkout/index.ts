// Creates a Stripe Checkout Session for a subscription plan. Called by the
// client only after the user has a Supabase session (see
// src/lib/subscriptionApi.js) — free users never hit this endpoint.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeClient, priceIdForPlan } from "../_shared/stripeClient.ts";
import { getAuthenticatedUser, getServiceRoleClient } from "../_shared/authUser.ts";

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  try {
    const user = await getAuthenticatedUser(req);
    const { plan } = await req.json();
    if (plan !== "monthly" && plan !== "yearly") {
      return new Response(JSON.stringify({ error: "plan must be 'monthly' or 'yearly'" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const stripe = getStripeClient();
    const supabase = getServiceRoleClient();

    // Reuse a Stripe customer if this user already has one on file (e.g.
    // resubscribing after a prior cancellation), instead of creating a
    // duplicate customer each time.
    const { data: existing } = await supabase
      .from("subscriptions")
      .select("stripe_customer_id")
      .eq("user_id", user.id)
      .maybeSingle();

    const customerId = existing?.stripe_customer_id ??
      (await stripe.customers.create({
        email: user.email,
        metadata: { supabase_user_id: user.id },
      })).id;

    // Stripe Tax (automatic VAT/sales-tax by customer location) is OFF by
    // default and must be turned on deliberately: setting automatic_tax on
    // the session throws unless Stripe Tax is first activated in the Stripe
    // dashboard (with tax registrations), so enabling it blindly would break
    // live checkout. Gate it on an env flag so the account holder can flip it
    // once the dashboard side is configured — see STRIPE_TAX note in the PR.
    const automaticTax = Deno.env.get("STRIPE_AUTOMATIC_TAX") === "true";

    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: priceIdForPlan(plan), quantity: 1 }],
      success_url: `${appBaseUrl}/settings?checkout=success`,
      cancel_url: `${appBaseUrl}/settings?checkout=cancelled`,
      metadata: { supabase_user_id: user.id, plan },
      subscription_data: { metadata: { supabase_user_id: user.id, plan } },
      // Tax needs the customer's location; only collected when tax is on.
      ...(automaticTax
        ? {
            automatic_tax: { enabled: true },
            billing_address_collection: "required",
            customer_update: { address: "auto" },
          }
        : {}),
    });

    return new Response(JSON.stringify({ url: session.url }), {
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
