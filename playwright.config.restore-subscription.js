import { defineConfig } from "@playwright/test";
import { LOCAL_ANON_KEY } from "./e2e/localSupabaseKeys.js";

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

// Deliberately separate from playwright.config.js: the main e2e suite runs
// with NO Supabase configured at all (see e2e/auth-flow.spec.js's header
// comment) and shares one production-pointed build+preview server on
// :5173. This spec needs the app built against a LOCAL Supabase stack
// instead -- a different env, a different build output directory, a
// different port -- so it gets its own server rather than fighting the main
// suite for :5173 or polluting its "no backend" build.
//
// Prerequisites (see e2e/restore-subscription.spec.js's header comment for
// the full sequence): Docker Desktop running, `npx supabase start`, and
// `npx supabase functions serve --env-file supabase/functions/.env` all up
// first. Run via `npm run test:e2e:restore`.
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
      VITE_SUPABASE_URL: "http://127.0.0.1:54321",
      VITE_SUPABASE_ANON_KEY: LOCAL_ANON_KEY,
    },
  },
});
