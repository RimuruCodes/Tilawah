import { defineConfig } from "@playwright/test";

// Browsers live inside node_modules (E: has the space; C: is nearly full on
// the dev machine) — must match how `npm run test:e2e:install` installs them.
process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.js",
  // The recording flow runs a real in-browser Whisper model; the first run
  // also downloads it (~40MB). Generous timeouts are the honest choice here.
  timeout: 10 * 60 * 1000,
  expect: { timeout: 30 * 1000 },
  // One worker, serially: tests share a persistent browser profile (see
  // e2e/fixtures.js) so the ASR model downloads once, and the dev machine's
  // memory can't take parallel Whisper inference anyway.
  workers: 1,
  fullyParallel: false,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL: "http://localhost:5173",
    trace: "retain-on-failure",
  },
  webServer: {
    // Production build + preview, not the dev server: Vite's on-demand
    // dependency optimization can trigger a full page reload the first time
    // the ASR worker loads @huggingface/transformers, which would kill a
    // recording mid-test. The preview server serves a static build.
    command: "npm run build && npm run preview -- --port 5173 --strictPort",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 180 * 1000,
  },
});
