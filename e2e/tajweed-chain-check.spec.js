// TEMPORARY diagnostic spec (Tajweed-unavailable investigation): runs the
// continuous flow on desktop and waits for the ENTIRE background ASR ->
// Tajweed chain to finish, printing every persisted lifecycle event. This
// answers "does the ASR/Tajweed layer complete on desktop?" with the same
// instrumentation the phone test will use. Not part of the regular suite —
// delete once the investigation closes.
import { test, expect } from "./fixtures.js";

const CHAIN_TIMEOUT = 8 * 60 * 1000;

test("desktop: background ASR -> Tajweed chain completes and is fully logged", async ({ page }) => {
  const lifecycleLines = [];
  page.on("console", (msg) => {
    const text = msg.text();
    if (/\[lifecycle\]|\[tilawah\]/.test(text)) lifecycleLines.push(text);
  });

  await page.goto("/surah/1");
  await expect(page.locator("#ayah-1")).toBeVisible({ timeout: 60_000 });
  await page.getByRole("button", { name: "Recite All" }).click();
  await expect(page.getByRole("heading", { name: "Continuous Recitation" })).toBeVisible();

  await page.getByRole("button", { name: "Start continuous recording" }).click();
  const nextAyah = page.getByRole("button", { name: "Next Ayah" });
  await expect(nextAyah).toBeVisible();
  await page.waitForTimeout(2500);
  await nextAyah.click();
  await page.waitForTimeout(2500);
  await page.getByRole("button", { name: "Finish & Analyze" }).click();

  await expect(page.getByTestId("recitation-score")).toBeVisible({ timeout: CHAIN_TIMEOUT });

  // Now wait for the background chain to close: a tajweed-result event is
  // recorded whether Tajweed succeeded or degraded — the point is that the
  // log must SAY which.
  await expect
    .poll(() => lifecycleLines.some((l) => l.includes("tajweed-result")), { timeout: CHAIN_TIMEOUT })
    .toBe(true);

  console.log("\n===== lifecycle chain (desktop) =====");
  for (const line of lifecycleLines) console.log(line);

  const gateLine = lifecycleLines.find((l) => l.includes("asr-gate"));
  expect(gateLine, "asr-gate event must be recorded").toBeTruthy();
  const resultLine = lifecycleLines.find((l) => l.includes("tajweed-result"));
  expect(resultLine, "tajweed-result event must be recorded").toBeTruthy();
});
