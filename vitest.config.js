import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "jsdom",
    // Only this app's tests — tools/ holds offline eval harnesses and a
    // cloned third-party repo whose own test suites must not run here.
    // .test.jsx (2026-07): actual React component render tests, not just
    // pure-logic ones — see CountdownTimer.test.jsx, the first of these.
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
  },
});
