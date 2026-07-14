import { createClient } from "npm:@supabase/supabase-js@2";

// Verifies the caller's Supabase JWT (passed through from the client's
// Authorization header) and returns the authenticated user. Used by
// checkout/billing-portal — both require proof of "which subscriber is
// this" before touching Stripe. Throws if the token is missing/invalid,
// which callers turn into a 401.
export async function getAuthenticatedUser(req: Request) {
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    throw new Error("Missing Authorization header");
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) {
    throw new Error("Invalid or expired session");
  }
  return data.user;
}

// A service-role client, used for reads/writes that must bypass RLS (the
// webhook handler upserting subscription rows, and looking up a
// stripe_customer_id for the billing portal regardless of RLS on that row —
// though the caller here is always looking up their own row by user_id).
export function getServiceRoleClient() {
  return createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );
}
