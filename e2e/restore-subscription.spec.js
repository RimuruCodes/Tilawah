// Full, real end-to-end verification of the 2026-08-01 restore-purchase
// identity fix -- see restore-subscription/index.ts's header comment for
// the original bug this replaces (entering a DIFFERENT person's
// subscription email in "Restore purchase" used to silently sign the
// caller into that other person's account). This drives the ACTUAL app
// with Playwright against a real, non-production Supabase backend and
// real Stripe TEST MODE infrastructure -- never the project's live
// production Supabase project (see the note below).
//
// WHY NOT THE PROJECT'S USUAL SUPABASE PROJECT:
// This repo is normally linked to exactly one Supabase project
// (hfmyyjotththoziatilb / "Tilawah"), and it is live production -- real
// subscribers, and per supabase/functions/stripeClient.ts's own header
// comment, a LIVE Stripe secret key deployed since 2026-07-16 ("real cards
// are charged"). Deploying this function or creating accounts against the
// live project would mean real production writes and, if Stripe were
// exercised there, real money.
//
// WHAT THIS TARGETS INSTEAD (default): a separate staging Supabase project
// (org kvafktlppoyrgxzlnljh, ref icjthqonblsroqvsgkws -- "tilawah-staging"),
// created 2026-08-02 specifically so verification work never has to touch
// production. Its own migrations/functions/secrets/auth config are set up
// identically to production (see the commit that added this comment for
// the exact CLI commands used), except APP_BASE_URL is localhost -- which
// is also the actual fix for a real CORS wall hit during earlier Phase 1
// screenshot work (production's deployed functions only accept requests
// from https://tilawah1.com; staging's accept localhost by design). Being
// a real hosted project rather than local `supabase start`, it needs no
// Docker -- which matters because this sandbox doesn't have a reachable
// Docker daemon. Local `supabase start` is still supported as an
// alternative (E2E_SUPABASE_TARGET=local) for anyone who'd rather use that;
// see supabaseTestTarget.js for how the two are selected.
//
// One real design consequence of a hosted project instead of local
// `supabase start`: there's no Inbucket mail catcher to poll for the OTP
// email. fetchOtpCode below instead reads the code via the admin API's
// generateLink() (service-role only) for the staging target, and falls
// back to Inbucket-polling for the local target.
//
// PREREQUISITES:
//   Staging (default): e2e/.env.staging must exist (gitignored -- see its
//     own header comment) with the staging project's URL/anon/service-role
//     keys. Nothing else -- no Docker, no separate server process.
//   Local (E2E_SUPABASE_TARGET=local): Docker Desktop running, then
//     `npx supabase start` and `npx supabase functions serve --env-file
//     supabase/functions/.env` in a separate terminal.
//   Either way: `npm run test:e2e:restore`.
// If the target backend isn't reachable, every test below is SKIPPED with
// a clear reason (see `stackReachable`) rather than failing or being
// silently omitted from a report.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY, INBUCKET_URL, E2E_SUPABASE_TARGET } from "./supabaseTestTarget.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");

// Reads the project's own committed TEST-mode Stripe credentials. Never a
// live secret; see the header comment above. Staging and local share the
// same Stripe test-mode keys (test mode is account-scoped, not
// Supabase-project-scoped) -- the only real difference between the two
// files is APP_BASE_URL, which the Edge Functions read, not this spec.
function readFunctionsEnv() {
  const fileName = E2E_SUPABASE_TARGET === "local" ? "supabase/functions/.env" : "supabase/functions/.env.staging";
  const raw = readFileSync(path.join(REPO_ROOT, fileName), "utf8");
  const vars = {};
  for (const line of raw.split("\n")) {
    const m = line.match(/^([A-Z_]+)=(.*)$/);
    if (m) vars[m[1]] = m[2].trim();
  }
  return vars;
}

function flattenForStripe(obj, prefix = "") {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    const key = prefix ? `${prefix}[${k}]` : k;
    if (v && typeof v === "object") Object.assign(out, flattenForStripe(v, key));
    else out[key] = v;
  }
  return out;
}

async function stripeRequest(method, url, key, body) {
  const params = body ? new URLSearchParams(flattenForStripe(body)) : undefined;
  const res = await fetch(`https://api.stripe.com/v1/${url}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString("base64")}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params,
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Stripe ${method} ${url} failed: ${JSON.stringify(data)}`);
  return data;
}

async function probeSupabase() {
  if (!SUPABASE_URL) return false;
  try {
    // A real hosted project's GoTrue rejects even the health check without
    // an apikey header ("No API key found in request") -- local
    // `supabase start` is more lenient, but sending it either way is
    // harmless and correct (real clients always send it).
    const res = await fetch(`${SUPABASE_URL}/auth/v1/health`, {
      signal: AbortSignal.timeout(4000),
      headers: SUPABASE_ANON_KEY ? { apikey: SUPABASE_ANON_KEY } : {},
    });
    return res.ok;
  } catch {
    return false;
  }
}

const stackReachable = await probeSupabase();

test.describe("Restore purchase: real identity + entitlement + Stripe verification", () => {
  test.skip(
    !stackReachable,
    E2E_SUPABASE_TARGET === "local"
      ? `Local Supabase isn't reachable at ${SUPABASE_URL}. Run \`npx supabase start\` ` +
          `(Docker Desktop must be running) and \`npx supabase functions serve --env-file ` +
          `supabase/functions/.env\` first, then re-run \`npm run test:e2e:restore\`.`
      : `The staging Supabase project isn't reachable${SUPABASE_URL ? ` at ${SUPABASE_URL}` : ""}. ` +
          `Check e2e/.env.staging exists and has real values (gitignored -- not present in a fresh ` +
          `checkout), or set E2E_SUPABASE_TARGET=local to use a local Docker stack instead.`
  );

  const admin = stackReachable ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY) : null;
  const stamp = Date.now();
  // NOT @example.com: confirmed empirically that the staging project's
  // default (no custom SMTP) mailer rejects it outright with
  // email_address_invalid at the /auth/v1/otp endpoint -- and so does
  // @gmail.com and other real providers. Only @tilawah1.com (the real
  // product domain, already administered for this project) passed. Real
  // delivery is never needed either way -- fetchOtpCode below reads the
  // code via the admin API's generateLink(), not an actual inbox -- so
  // this is safe, just an unexpected platform restriction to route around.
  const accountA = { email: `restore-fix-a-${stamp}@tilawah1.com`, password: "TestPassw0rd!A1" };
  const accountB = { email: `restore-fix-b-${stamp}@tilawah1.com`, password: "TestPassw0rd!B1" };
  let accountAId, accountBId, stripeCustomerId, stripeSubscriptionId;
  const stripeEnv = stackReachable ? readFunctionsEnv() : {};

  test.beforeAll(async () => {
    if (!stackReachable) return;

    // 1. Two genuinely disposable accounts, created via Supabase's admin
    // API (not the app's own signup UI), each auto-confirmed so they can
    // log in immediately.
    const { data: userA, error: errA } = await admin.auth.admin.createUser({
      email: accountA.email,
      password: accountA.password,
      email_confirm: true,
    });
    if (errA) throw new Error(`Failed to create disposable Account A: ${errA.message}`);
    accountAId = userA.user.id;

    const { data: userB, error: errB } = await admin.auth.admin.createUser({
      email: accountB.email,
      password: accountB.password,
      email_confirm: true,
    });
    if (errB) throw new Error(`Failed to create disposable Account B: ${errB.message}`);
    accountBId = userB.user.id;

    // 2. A real Stripe TEST MODE subscription for Account A, via Stripe's
    // API directly (not the checkout UI), on the project's actual monthly
    // price ID.
    const customer = await stripeRequest("POST", "customers", stripeEnv.STRIPE_SECRET_KEY, {
      email: accountA.email,
      metadata: { purpose: "restore-purchase-e2e" },
    });
    stripeCustomerId = customer.id;
    const pm = await stripeRequest("POST", "payment_methods/pm_card_visa/attach", stripeEnv.STRIPE_SECRET_KEY, {
      customer: stripeCustomerId,
    });
    await stripeRequest("POST", `customers/${stripeCustomerId}`, stripeEnv.STRIPE_SECRET_KEY, {
      invoice_settings: { default_payment_method: pm.id },
    });
    const subscription = await stripeRequest("POST", "subscriptions", stripeEnv.STRIPE_SECRET_KEY, {
      customer: stripeCustomerId,
      items: [{ price: stripeEnv.STRIPE_PRICE_ID_MONTHLY }],
      metadata: { supabase_user_id: accountAId, plan: "monthly" },
    });
    stripeSubscriptionId = subscription.id;

    // Mirrors exactly what stripe-webhook's insertFromCheckout writes on a
    // real checkout.session.completed event. This suite doesn't re-drive
    // the webhook itself (that's stripe-webhook's own concern) -- only
    // restore-subscription, the function actually under test here.
    const item = subscription.items.data[0];
    const { error: rowError } = await admin.from("subscriptions").insert({
      user_id: accountAId,
      email: accountA.email,
      stripe_customer_id: stripeCustomerId,
      stripe_subscription_id: stripeSubscriptionId,
      plan: "monthly",
      status: subscription.status,
      current_period_end: new Date(item.current_period_end * 1000).toISOString(),
      cancel_at_period_end: false,
    });
    if (rowError) throw new Error(`Failed to seed Account A's subscription row: ${rowError.message}`);
  });

  test.afterAll(async () => {
    if (!stackReachable) return;
    if (stripeSubscriptionId) {
      await stripeRequest("DELETE", `subscriptions/${stripeSubscriptionId}`, stripeEnv.STRIPE_SECRET_KEY).catch(() => {});
    }
    if (stripeCustomerId) {
      await stripeRequest("DELETE", `customers/${stripeCustomerId}`, stripeEnv.STRIPE_SECRET_KEY).catch(() => {});
    }
    // subscriptions rows cascade-delete with their auth.users row (see
    // migrations/0001_subscriptions.sql: `references auth.users (id) on
    // delete cascade`), so deleting the two users is the only DB cleanup
    // needed.
    if (accountAId) await admin.auth.admin.deleteUser(accountAId).catch(() => {});
    if (accountBId) await admin.auth.admin.deleteUser(accountBId).catch(() => {});
  });

  // Local `supabase start` routes all outgoing auth email through Inbucket,
  // a mail catcher exposed as JSON -- the same way a person would open
  // their inbox. A real hosted project (staging included) has no Inbucket,
  // so the code is fetched via the admin API's generateLink() instead,
  // which returns the raw OTP directly (data.properties.email_otp -- see
  // @supabase/auth-js's GoTrueAdminApi.generateLink() docs) without ever
  // needing the email to actually be delivered.
  async function fetchOtpCode(email) {
    if (E2E_SUPABASE_TARGET === "local") {
      const mailbox = email.split("@")[0].toLowerCase();
      const url = `${INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`;
      for (let attempt = 0; attempt < 20; attempt++) {
        const res = await fetch(url);
        if (res.ok) {
          const messages = await res.json();
          if (messages.length > 0) {
            const latest = messages[messages.length - 1];
            const full = await (await fetch(`${url}/${latest.id}`)).json();
            const body = full.body?.text || full.body?.html || "";
            // supabase/templates/magic_link.html renders the code as
            // {{ .Token }} inside a <strong> -- a bare 6-digit run.
            const match = body.match(/\b(\d{6})\b/);
            if (match) return match[1];
          }
        }
        await new Promise((r) => setTimeout(r, 500));
      }
      throw new Error(`No OTP email arrived for ${email} within 10s (Inbucket mailbox "${mailbox}")`);
    }

    const { data, error } = await admin.auth.admin.generateLink({ type: "magiclink", email });
    if (error) throw new Error(`generateLink failed for ${email}: ${error.message}`);
    const code = data?.properties?.email_otp;
    if (!code) throw new Error(`generateLink for ${email} returned no email_otp -- response shape: ${JSON.stringify(data)}`);
    return code;
  }

  // Reads the REAL, actual Supabase session persisted in the browser --
  // supabase-js stores the full session (including the user object) under
  // a "...-auth-token" localStorage key. This is the app-wide ground truth
  // for "who is signed in" (src/lib/activeUser.js mirrors this same
  // session, just cached in memory for synchronous reads).
  function readSupabaseSessionUserId(page) {
    return page.evaluate(() => {
      const key = Object.keys(localStorage).find((k) => k.includes("-auth-token"));
      if (!key) return null;
      try {
        return JSON.parse(localStorage.getItem(key))?.user?.id || null;
      } catch {
        return null;
      }
    });
  }

  test("restoring a DIFFERENT person's subscription email transfers entitlement without ever changing the caller's own session", async ({ page }) => {
    // Log in as Account B -- the account actually using this device.
    await page.goto("/login");
    await page.getByLabel("Email").fill(accountB.email);
    await page.getByLabel("Password", { exact: true }).fill(accountB.password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL("**/");

    const sessionIdAtLogin = await readSupabaseSessionUserId(page);
    console.log(`[assert] session user id right after login: ${sessionIdAtLogin} (expected Account B: ${accountBId})`);
    expect(sessionIdAtLogin).toBe(accountBId);

    // Open Restore Purchase and request a code for Account A's email -- the
    // mismatched-email case that was the actual bug.
    await page.goto("/settings");
    await page.getByRole("button", { name: /Already subscribed on another device\? Restore purchase/i }).click();
    await page.getByPlaceholder("you@example.com").fill(accountA.email);
    await page.getByText("Send code", { exact: true }).click();
    await page.getByPlaceholder("123456").waitFor();

    const sessionIdAfterSendCode = await readSupabaseSessionUserId(page);
    console.log(`[assert] session user id after requesting the code for Account A's email: ${sessionIdAfterSendCode}`);
    expect(sessionIdAfterSendCode).toBe(accountBId);

    const code = await fetchOtpCode(accountA.email);
    console.log(`[info] real OTP code fetched for Account A (${accountA.email}) via ${E2E_SUPABASE_TARGET === "local" ? "Inbucket" : "generateLink"}: ${code}`);

    await page.getByPlaceholder("123456").fill(code);
    await page.getByText("Verify & restore", { exact: true }).click();
    await page.getByText(/subscription is active/i).waitFor();

    // 5a. The actual active Supabase session in the browser context --
    // must be Account B's at every point, never Account A's.
    const sessionIdAfterRestore = await readSupabaseSessionUserId(page);
    console.log(`[assert] session user id after restore completes: ${sessionIdAfterRestore}`);
    expect(sessionIdAfterRestore).toBe(accountBId);
    expect(sessionIdAfterRestore).not.toBe(accountAId);

    // 5b. Entitlement, read the same way the app itself reads it -- the
    // rendered Settings page (RLS-scoped by the caller's own session), not
    // a direct database query.
    await page.reload();
    const planLabel = page.getByText("Monthly plan", { exact: true });
    await expect(planLabel).toBeVisible();
    const planText = await planLabel.textContent();
    console.log(`[assert] Settings page plan label after restore+reload: "${planText}"`);
    await expect(page.getByText("Active", { exact: true })).toBeVisible();

    // 5c. Stripe's own copy of the subscription -- the renewal-desync
    // check. Independently re-fetched (not trusting any earlier response
    // from setup), exactly as the earlier standalone Stripe-only proof did.
    const refetched = await stripeRequest("GET", `subscriptions/${stripeSubscriptionId}`, stripeEnv.STRIPE_SECRET_KEY);
    console.log(`[assert] Stripe subscription metadata after restore: ${JSON.stringify(refetched.metadata)}`);
    expect(refetched.metadata.supabase_user_id).toBe(accountBId);
    expect(refetched.metadata.supabase_user_id).not.toBe(accountAId);

    // The DB row itself now belongs to Account B, and no longer exists
    // under Account A's id (transferred, not duplicated).
    const { data: ownRow } = await admin.from("subscriptions").select("*").eq("user_id", accountBId).maybeSingle();
    console.log(`[assert] subscriptions row after transfer: user_id=${ownRow?.user_id} plan=${ownRow?.plan} status=${ownRow?.status}`);
    expect(ownRow?.user_id).toBe(accountBId);
    expect(ownRow?.plan).toBe("monthly");

    const { data: oldRow } = await admin.from("subscriptions").select("*").eq("user_id", accountAId).maybeSingle();
    console.log(`[assert] Account A's own row after transfer: ${oldRow ? JSON.stringify(oldRow) : "null (moved away, as expected)"}`);
    expect(oldRow).toBeNull();
  });
});
