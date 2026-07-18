// Real local-auth flow, exercised against a CLEAN browser context with NO
// session seeding — deliberately NOT using e2e/fixtures.js, whose
// addInitScript re-injects qc_session on every navigation and therefore
// structurally hides any "login doesn't persist / account switch leaks"
// bug. If login persistence ever regresses, these fail.
//
// Supabase isn't configured in the CI/preview build, so the subscriber
// identity reconcile logic can't be driven end-to-end here — that decision
// is covered as a pure unit test (src/lib/__tests__/subscriberIdentity.test.js).
// These specs cover the local half: registration, session persistence
// across reload, and clean switching between two local accounts.
import { test, expect } from "@playwright/test";

// Fresh, empty storage per test (no owner seeding, no service worker).
test.use({ serviceWorkers: "block", storageState: { cookies: [], origins: [] } });

async function register(page, { email, displayName, password }) {
  await page.goto("/register");
  await page.getByLabel("Email").fill(email);
  if (displayName !== undefined) {
    await page.getByLabel(/Display name/i).fill(displayName);
  }
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByLabel("Confirm Password").fill(password);
  // Clickwrap: the account button stays disabled until Terms/Privacy is accepted.
  await expect(page.getByRole("button", { name: "Create account" })).toBeDisabled();
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL("**/");
  await expect(page).toHaveURL(/\/$/);
}

async function logout(page) {
  await page.goto("/settings");
  await page.getByRole("button", { name: "Log Out" }).click();
  await page.waitForURL("**/login");
}

async function login(page, { email, password }) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Log in" }).click();
  await page.waitForURL("**/");
  await expect(page).toHaveURL(/\/$/);
}

test("register -> logout -> login -> reload keeps the session (and greets the display name)", async ({ page }) => {
  const consoleErrors = [];
  page.on("pageerror", (e) => consoleErrors.push(`pageerror: ${e.message}`));

  const creds = { email: `a+${Date.now()}@example.com`, displayName: "Aisha", password: "secret123" };

  await register(page, creds);
  // No plaintext email is ever written to storage — only its hash.
  const usersJson = await page.evaluate(() => localStorage.getItem("qc_users"));
  expect(usersJson).not.toContain(creds.email);
  expect(usersJson).toContain("emailHash");
  // Home greets the chosen display name, not any part of the email.
  await expect(page.getByText(/Assalamu Alaikum, Aisha/)).toBeVisible();

  await logout(page);
  await login(page, creds);

  await page.reload();
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Welcome back" })).toHaveCount(0);
  await expect(page.getByText(/Assalamu Alaikum, Aisha/)).toBeVisible();

  expect(consoleErrors).toEqual([]);
});

test("switching local accounts doesn't carry the previous identity over", async ({ page }) => {
  const a = { email: `first+${Date.now()}@example.com`, displayName: "PersonA", password: "passA123" };
  const b = { email: `second+${Date.now()}@example.com`, displayName: "PersonB", password: "passB123" };

  await register(page, a);
  await expect(page.getByText(/Assalamu Alaikum, PersonA/)).toBeVisible();

  await logout(page);
  await register(page, b);

  // After a reload, the app must reflect B — not a stale A identity.
  await page.reload();
  await expect(page.getByText(/Assalamu Alaikum, PersonB/)).toBeVisible();
  await expect(page.getByText(/PersonA/)).toHaveCount(0);
});
