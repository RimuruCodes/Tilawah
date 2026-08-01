// Shared by playwright.config.restore-subscription.js and
// restore-subscription.spec.js: the fixed, publicly documented JWT secret
// `supabase start` uses for every local dev project (unless a project
// explicitly overrides it, which this repo's supabase/config.toml does
// not). Signing our own anon/service_role tokens from this secret at
// runtime avoids hardcoding token strings that could silently drift from
// whatever Supabase CLI version is installed -- and makes explicit that
// this NEVER applies to the hosted project, which has its own real secret
// nobody outside the Supabase dashboard can read.
import { createHmac } from "node:crypto";

export const LOCAL_SUPABASE_URL = process.env.E2E_LOCAL_SUPABASE_URL || "http://127.0.0.1:54321";
export const LOCAL_INBUCKET_URL = process.env.E2E_LOCAL_INBUCKET_URL || "http://127.0.0.1:54324";
export const LOCAL_JWT_SECRET =
  process.env.E2E_LOCAL_SUPABASE_JWT_SECRET || "super-secret-jwt-token-with-at-least-32-characters-long";

export function signLocalJwt(role) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const payload = { role, iss: "supabase-demo", iat: now, exp: now + 60 * 60 * 24 };
  const b64url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");
  const signingInput = `${b64url(header)}.${b64url(payload)}`;
  const signature = createHmac("sha256", LOCAL_JWT_SECRET).update(signingInput).digest("base64url");
  return `${signingInput}.${signature}`;
}

export const LOCAL_ANON_KEY = process.env.E2E_LOCAL_SUPABASE_ANON_KEY || signLocalJwt("anon");
export const LOCAL_SERVICE_ROLE_KEY = process.env.E2E_LOCAL_SUPABASE_SERVICE_ROLE_KEY || signLocalJwt("service_role");
