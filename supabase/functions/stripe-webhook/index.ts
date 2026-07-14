// Handles Stripe subscription lifecycle webhooks and is the *only* writer
// to the `subscriptions` table — the client never writes its own
// entitlement state, only reads it (see supabase/migrations/0001_subscriptions.sql).
import Stripe from "npm:stripe@17";
import { getStripeClient } from "../_shared/stripeClient.ts";
import { getServiceRoleClient } from "../_shared/authUser.ts";

const cryptoProvider = Stripe.createSubtleCryptoProvider();

function subscriptionFields(subscription: Stripe.Subscription) {
  const item = subscription.items.data[0];
  return {
    stripe_subscription_id: subscription.id,
    plan: subscription.metadata?.plan === "yearly" ? "yearly" : "monthly",
    status: subscription.status,
    current_period_end: item ? new Date(item.current_period_end * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
    updated_at: new Date().toISOString(),
  };
}

// First time we see this user subscribe: creates the row, so email must be
// known (from the Checkout Session's customer details).
async function insertFromCheckout(
  supabase: ReturnType<typeof getServiceRoleClient>,
  { userId, email, customerId, subscription }: { userId: string; email: string; customerId: string; subscription: Stripe.Subscription }
) {
  await supabase.from("subscriptions").upsert(
    { user_id: userId, email, stripe_customer_id: customerId, ...subscriptionFields(subscription) },
    { onConflict: "user_id" }
  );
}

// Later lifecycle events (renewed, past_due, cancelled) update an
// already-existing row — deliberately does NOT touch `email`, since these
// events don't carry a reliable email and the row is guaranteed to already
// exist (created by checkout.session.completed).
async function updateFromSubscription(
  supabase: ReturnType<typeof getServiceRoleClient>,
  { userId, subscription }: { userId: string; subscription: Stripe.Subscription }
) {
  await supabase.from("subscriptions").update(subscriptionFields(subscription)).eq("user_id", userId);
}

Deno.serve(async (req: Request) => {
  const signature = req.headers.get("Stripe-Signature");
  const webhookSecret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  if (!signature || !webhookSecret) {
    return new Response("Missing signature or webhook secret", { status: 400 });
  }

  // Signature verification needs the raw, unparsed body.
  const body = await req.text();
  const stripe = getStripeClient();

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(body, signature, webhookSecret, undefined, cryptoProvider);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Invalid signature";
    return new Response(`Webhook signature verification failed: ${message}`, { status: 400 });
  }

  const supabase = getServiceRoleClient();

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.client_reference_id;
        const email = session.customer_details?.email;
        if (!userId || !email || !session.subscription || !session.customer) break;

        const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
        await insertFromCheckout(supabase, {
          userId,
          email,
          customerId: session.customer as string,
          subscription,
        });
        break;
      }

      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.supabase_user_id;
        if (!userId) break;

        await updateFromSubscription(supabase, { userId, subscription });
        break;
      }

      default:
        // Ignore anything we don't act on (invoices, payment methods, etc).
        break;
    }
  } catch (err) {
    // Returning 500 tells Stripe to retry the webhook delivery rather than
    // silently losing the state change.
    const message = err instanceof Error ? err.message : "Unexpected error handling webhook";
    return new Response(message, { status: 500 });
  }

  return new Response(JSON.stringify({ received: true }), {
    headers: { "Content-Type": "application/json" },
  });
});
