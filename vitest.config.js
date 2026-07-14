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
    include: ["src/**/*.test.js"],
  },
});
