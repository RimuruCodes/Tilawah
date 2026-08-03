// Picks which Supabase backend restore-subscription.spec.js runs against:
// the separate staging project (default — a real cloud project, no Docker
// needed) or a local `supabase start` stack (opt-in via
// E2E_SUPABASE_TARGET=local, for anyone who'd rather use that). Neither is
// ever the live production project — see restore-subscription.spec.js's
// header comment for why that's a hard rule, not a preference.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_SUPABASE_URL, LOCAL_INBUCKET_URL, LOCAL_ANON_KEY, LOCAL_SERVICE_ROLE_KEY } from "./localSupabaseKeys.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));

export const E2E_SUPABASE_TARGET = process.env.E2E_SUPABASE_TARGET === "local" ? "local" : "staging";

function readStagingEnvFile() {
  const filePath = path.join(HERE, ".env.staging");
  let raw;
  try {
    raw = readFileSync(filePath, "utf8");
  } catch {
    return {};
  }
  const vars = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

const stagingEnv = readStagingEnvFile();

export const SUPABASE_URL =
  E2E_SUPABASE_TARGET === "local" ? LOCAL_SUPABASE_URL : stagingEnv.E2E_STAGING_SUPABASE_URL;
export const SUPABASE_ANON_KEY =
  E2E_SUPABASE_TARGET === "local" ? LOCAL_ANON_KEY : stagingEnv.E2E_STAGING_SUPABASE_ANON_KEY;
export const SUPABASE_SERVICE_ROLE_KEY =
  E2E_SUPABASE_TARGET === "local" ? LOCAL_SERVICE_ROLE_KEY : stagingEnv.E2E_STAGING_SUPABASE_SERVICE_ROLE_KEY;
// Only local `supabase start` has an Inbucket mail catcher; a real cloud
// project (staging included) doesn't, so OTP codes there are fetched via
// the admin API's generateLink() instead — see fetchOtpCode in the spec.
export const INBUCKET_URL = E2E_SUPABASE_TARGET === "local" ? LOCAL_INBUCKET_URL : null;
