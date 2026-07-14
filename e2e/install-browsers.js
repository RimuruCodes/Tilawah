// Installs the Chromium build the e2e suite runs on, into node_modules
// (PLAYWRIGHT_BROWSERS_PATH=0) rather than the default per-user cache —
// keeping the ~300MB of browser binaries on the same drive as the repo.
// Must stay in sync with the same env default in playwright.config.js.
import { spawnSync } from "node:child_process";

process.env.PLAYWRIGHT_BROWSERS_PATH = process.env.PLAYWRIGHT_BROWSERS_PATH || "0";

const result = spawnSync("npx", ["playwright", "install", "chromium"], {
  stdio: "inherit",
  shell: true,
  env: process.env,
});
process.exit(result.status ?? 1);
