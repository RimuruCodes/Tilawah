// Creates a Stripe Checkout Session for a ONE-TIME donation. Unlike the
// subscription `checkout` function, this requires no account: donating
// grants no entitlement, so there's nothing to tie to a user and no
// webhook to process — Stripe records the payment and that's the whole
// story. Anyone (even a signed-out free user) can donate; the request is
// still gated by Supabase's anon-key gateway like every Edge Function.
import { corsHeaders, handleCorsPreflight } from "../_shared/cors.ts";
import { getStripeClient } from "../_shared/stripeClient.ts";

// $1 minimum (Stripe's floor for USD is 50c; $1 is a friendlier ceiling on
// accidental zero/penny donations), $10,000 maximum as a sanity bound.
const MIN_CENTS = 100;
const MAX_CENTS = 1_000_000;

Deno.serve(async (req: Request) => {
  const preflight = handleCorsPreflight(req);
  if (preflight) return preflight;

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  try {
    const { amountCents } = await req.json();
    if (!Number.isInteger(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
      return json({ error: `Donation amount must be a whole number of cents between ${MIN_CENTS} and ${MAX_CENTS}.` }, 400);
    }

    const stripe = getStripeClient();
    const appBaseUrl = Deno.env.get("APP_BASE_URL") ?? "";
    const session = await stripe.checkout.sessions.create({
      mode: "payment",
      submit_type: "donate", // labels the Stripe button "Donate"
      line_items: [
        {
          price_data: {
            currency: "usd",
            unit_amount: amountCents,
            product_data: {
              name: "Tilawah Donation",
              description: "One-time donation to support the project (Sadaqah Jariyah).",
            },
          },
          quantity: 1,
        },
      ],
      success_url: `${appBaseUrl}/donate?donation=success`,
      cancel_url: `${appBaseUrl}/donate?donation=cancelled`,
    });

    return json({ url: session.url });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unexpected error";
    return json({ error: message }, 500);
  }
});
