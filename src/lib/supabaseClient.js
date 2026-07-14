import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// Subscriptions are an optional layer on top of the free, local-only app —
// if these env vars aren't configured (e.g. a dev checkout with no
// Supabase project set up), the rest of the app must keep working exactly
// as it does today. Every caller checks this flag rather than assuming
// `supabase` is non-null.
export const isSubscriptionBackendConfigured = Boolean(supabaseUrl && supabaseAnonKey);

export const supabase = isSubscriptionBackendConfigured ? createClient(supabaseUrl, supabaseAnonKey) : null;
