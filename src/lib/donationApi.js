// Client side of one-time Stripe donations. Kept separate from
// subscriptionApi.js because donations need no account, no session, and no
// entitlement — just an amount in, a Stripe Checkout URL out. The Supabase
// client's anon key authorizes the Edge Function call even for signed-out
// users.
import { supabase } from "@/lib/supabaseClient";

// Starts a one-time donation of `amountCents` (integer cents) and returns
// the Stripe-hosted Checkout URL to send the browser to.
export async function startDonation(amountCents) {
  if (!supabase) throw new Error("Donations aren't available in this build.");
  const { data, error } = await supabase.functions.invoke("donate", { body: { amountCents } });
  if (error) {
    const detail = await error.context?.json?.().catch(() => null);
    throw new Error(detail?.error || error.message || "Couldn't start the donation — try again in a moment.");
  }
  if (!data?.url) throw new Error("The donation service returned no redirect URL.");
  return data.url;
}

// Whether the Stripe-donation path is available at all (backend configured).
// The UI uses this to fall back to the Cash App link when it isn't.
export { isSubscriptionBackendConfigured as isDonationBackendConfigured } from "@/lib/supabaseClient";
