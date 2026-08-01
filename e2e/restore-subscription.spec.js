// Full, real end-to-end verification of the 2026-08-01 restore-purchase
// identity fix -- see restore-subscription/index.ts's header comment for
// the original bug this replaces (entering a DIFFERENT person's
// subscription email in "Restore purchase" used to silently sign the
// caller into that other person's account). This drives the ACTUAL app
// with Playwright against a LOCAL Supabase stack and real Stripe TEST MODE
// infrastructure -- never the project's deployed Supabase project, which is
// live production (see the note below).
//
// WHY THIS TARGETS LOCAL SUPABASE, NOT THE PROJECT'S USUAL ONE:
// This repo is normally linked to exactly one Supabase project
// (hfmyyjotththoziatilb / "Tilawah"), and it is live production -- real
// subscribers, and per supabase/functions/stripeClient.ts's own header
// comment, a LIVE Stripe secret key deployed since 2026-07-16 ("real cards
// are charged"). The sk_test_... key in supabase/functions/.env only
// applies when the functions run LOCALLY. Deploying this function or
// creating accounts against the live project would mean real production
// writes and, if Stripe were exercised there, real money -- neither of
// which this suite (or its "TEST MODE ONLY" requirement) can honor against
// that project. So this suite brings up its own local stack instead.
//
// PREREQUISITES (all local; nothing here ever touches the live project):
//   1. Docker Desktop running.
//   2. `npx supabase start` from the repo root -- local Postgres/GoTrue/
//      Inbucket on the CLI's fixed default ports (54321 API, 54324 mail).
//      First run also applies supabase/migrations/*.sql automatically.
//   3. In a separate terminal: `npx supabase functions serve --env-file
//      supabase/functions/.env` -- serves restore-subscription locally
//      using the sk_test_... Stripe key already committed there.
//   4. `npm run test:e2e:restore`
// If steps 1-2 haven't been done, every test below is SKIPPED with a clear
// reason (see `localStackReachable`) rather than failing or being silently
// omitted from a report.
import { test, expect } from "@playwright/test";
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LOCAL_SUPABASE_URL, LOCAL_INBUCKET_URL, LOCAL_SERVICE_ROLE_KEY } from "./localSupabaseKeys.js";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.join(HERE, "..");

// Reads the project's own committed TEST-mode Stripe credentials -- the
// same ones `supabase functions serve` uses locally. Never the deployed
// (live) secret; see the header comment above.
function readFunctionsEnv() {
  const raw = readFileSync(path.join(REPO_ROOT, "supabase/functions/.env"), "utf8");
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

async function probeLocalSupabase() {
  try {
    const res = await fetch(`${LOCAL_SUPABASE_URL}/auth/v1/health`, { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

const localStackReachable = await probeLocalSupabase();

test.describe("Restore purchase: real identity + entitlement + Stripe verification", () => {
  test.skip(
    !localStackReachable,
    `Local Supabase isn't reachable at ${LOCAL_SUPABASE_URL}. Run \`npx supabase start\` ` +
      `(Docker Desktop must be running) and \`npx supabase functions serve --env-file ` +
      `supabase/functions/.env\` first, then re-run \`npm run test:e2e:restore\`. See this ` +
      `file's header comment for the full prerequisite list.`
  );

  const admin = localStackReachable ? createClient(LOCAL_SUPABASE_URL, LOCAL_SERVICE_ROLE_KEY) : null;
  const stamp = Date.now();
  const accountA = { email: `restore-fix-a-${stamp}@example.com`, password: "TestPassw0rd!A1" };
  const accountB = { email: `restore-fix-b-${stamp}@example.com`, password: "TestPassw0rd!B1" };
  let accountAId, accountBId, stripeCustomerId, stripeSubscriptionId;
  const stripeEnv = readFunctionsEnv();

  test.beforeAll(async () => {
    if (!localStackReachable) return;

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
    if (!localStackReachable) return;
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

  // Local Supabase routes all outgoing auth email through Inbucket, a mail
  // catcher exposed as JSON at LOCAL_INBUCKET_URL -- this fetches the REAL
  // code the app sent, the same way a person would open their inbox.
  async function fetchOtpCode(email) {
    const mailbox = email.split("@")[0].toLowerCase();
    const url = `${LOCAL_INBUCKET_URL}/api/v1/mailbox/${encodeURIComponent(mailbox)}`;
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
    console.log(`[info] real OTP code fetched from local Inbucket for Account A (${accountA.email}): ${code}`);

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
