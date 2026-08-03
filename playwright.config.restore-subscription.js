import { defineConfig } from "@playwright/test";
import { SUPABASE_URL, SUPABASE_ANON_KEY, E2E_SUPABASE_TARGET } from "./e2e/supabaseTestTarget.js";

// Deliberately does NOT force PLAYWRIGHT_BROWSERS_PATH=0 the way
// playwright.config.js does (that convention expects browsers installed
// under node_modules/.local-browsers via `npm run test:e2e:install`) --
// this spec just uses whichever Chromium Playwright already resolves by
// default, which is simpler and was already confirmed working.
//
// Deliberately separate from playwright.config.js: the main e2e suite runs
// with NO Supabase configured at all (see e2e/auth-flow.spec.js's header
// comment) and shares one production-pointed build+preview server on
// :5173. This spec needs the app built against a NON-production Supabase
// backend instead -- a different env, a different build output directory,
// a different port -- so it gets its own server rather than fighting the
// main suite for :5173 or polluting its "no backend" build.
//
// Targets the separate staging project by default (E2E_SUPABASE_TARGET
// unset or "staging") -- no Docker required, see
// e2e/restore-subscription.spec.js's header comment for how it was set up.
// Set E2E_SUPABASE_TARGET=local to use a local `supabase start` stack
// instead. Run via `npm run test:e2e:restore`.
export default defineConfig({
  testDir: "./e2e",
  testMatch: "restore-subscription.spec.js",
  timeout: 60 * 1000,
  expect: { timeout: 15 * 1000 },
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5174",
    trace: "retain-on-failure",
  },
  webServer: {
    command:
      "npm run build -- --outDir dist-restore-e2e && npx vite preview --outDir dist-restore-e2e --port 5174 --strictPort",
    url: "http://localhost:5174",
    reuseExistingServer: true,
    timeout: 120 * 1000,
    env: {
      VITE_SUPABASE_URL: SUPABASE_URL || "",
      VITE_SUPABASE_ANON_KEY: SUPABASE_ANON_KEY || "",
      E2E_SUPABASE_TARGET,
    },
  },
});
