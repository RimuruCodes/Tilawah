// Shared CORS headers for the subscription Edge Functions. The app is a
// single-origin SPA (APP_BASE_URL), but Edge Functions run on a different
// origin than the frontend, so every response needs these.
export const corsHeaders = {
  "Access-Control-Allow-Origin": Deno.env.get("APP_BASE_URL") ?? "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  return null;
}
