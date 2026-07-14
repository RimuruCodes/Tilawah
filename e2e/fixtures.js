// Shared Playwright test setup for the recitation e2e suite.
//
// One persistent Chromium profile (e2e/.browser-profile, gitignored) is
// reused across all tests and runs so the ~40MB ASR model and the reciter
// reference audio are downloaded once and then served from the browser
// cache — without it every single test would re-download the model.
// Chromium's fake media device is pointed at a synthetic speech-like WAV,
// so "recording with the microphone" plays that file instead of live audio.
import { test as base, chromium, expect } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { isOwnerEmail } from "../src/lib/entitlements.js";
import { fixturePath } from "./generate-audio.js";

// Browsers are installed inside node_modules (see README) — keep runtime
// resolution consistent with how `npm run test:e2e:install` installs them.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROFILE_DIR = path.join(HERE, ".browser-profile");

export const BASE_URL = "http://localhost:5173";

// The e2e session signs in as the app owner's local account, which is
// comped every feature (src/lib/entitlements.js) — that's what lets the
// paywalled "Recite All" flow run without any subscription backend. The
// assertion fails the whole suite loudly if the owner email ever changes.
export const E2E_EMAIL = "alaminoyeyemi64@gmail.com";
if (!isOwnerEmail(E2E_EMAIL)) {
  throw new Error(
    `e2e login email "${E2E_EMAIL}" is no longer an owner email — update E2E_EMAIL in e2e/fixtures.js to match OWNER_EMAILS in src/lib/entitlements.js`
  );
}

export const test = base.extend({
  // Worker-scoped persistent context (all tests run in one browser profile).
  persistentContext: [
    async ({}, use) => {
      const context = await chromium.launchPersistentContext(PROFILE_DIR, {
        headless: true,
        baseURL: BASE_URL,
        permissions: ["microphone"],
        // The app is a PWA; without this, the service worker registered on
        // a previous run keeps serving that run's precached bundle from the
        // shared profile — tests would silently run stale code.
        serviceWorkers: "block",
        args: [
          "--use-fake-ui-for-media-stream",
          "--use-fake-device-for-media-stream",
          `--use-file-for-fake-audio-capture=${fixturePath("recitation.wav")}`,
          "--autoplay-policy=no-user-gesture-required",
        ],
      });
      // Seeded before any app code runs on every navigation: a logged-in
      // local session (owner account) and the small/fast ASR model so the
      // first-run download is as light as possible.
      await context.addInitScript(
        ([email]) => {
          const user = {
            id: "e2e-owner",
            email,
            full_name: "E2E Owner",
            role: "user",
            created_date: new Date().toISOString(),
          };
          localStorage.setItem("qc_users", JSON.stringify([user]));
          localStorage.setItem("qc_session", JSON.stringify({ userId: user.id, token: "e2e" }));
          localStorage.setItem("qc_asr_model_pref", "fast");
        },
        [E2E_EMAIL]
      );
      await use(context);
      await context.close();
    },
    { scope: "worker" },
  ],

  context: async ({ persistentContext }, use) => {
    await use(persistentContext);
  },

  page: async ({ context }, use) => {
    const page = await context.newPage();
    await use(page);
    await page.close();
  },

  // Collects console errors + uncaught exceptions for the test to assert on.
  // Uncaught page exceptions ("pageerror:" entries) always indicate a crash
  // and should fail every test; plain console errors are asserted only where
  // the flow is expected to stay clean (error-state tests legitimately log).
  consoleErrors: async ({ page }, use) => {
    const errors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error") errors.push(msg.text());
    });
    page.on("pageerror", (err) => errors.push(`pageerror: ${err.message}`));
    await use(errors);
  },
});

export { expect };

export function pageErrors(consoleErrors) {
  return consoleErrors.filter((e) => e.startsWith("pageerror:"));
}
