// End-to-end tests for the recitation recording flows.
//
// What these verify: the technical plumbing — UI state transitions
// (idle -> recording -> analyzing -> transcribing -> result/error), that a
// result screen renders with a numeric score, that bad input surfaces the
// error state instead of crashing, and that no uncaught exceptions occur.
//
// What these deliberately do NOT verify: scoring/Tajweed accuracy. The
// "recitation" fed to the fake microphone is synthetic speech-like audio,
// so any score it earns is meaningless — validating that scores are *right*
// still requires real human recitation and human judgment (see README).
//
// Tests run serially in one shared browser profile (e2e/fixtures.js): the
// first test to reach the transcribing stage downloads the ~40MB fast ASR
// model, everything after reuses the cache. Needs internet (Quran text API,
// reciter audio, Hugging Face) on first run.
import { test, expect, pageErrors } from "./fixtures.js";
import { fixturePath } from "./generate-audio.js";

// Generous: the first run downloads the ASR model and in-browser Whisper
// inference on this class of hardware is slow.
const RESULT_TIMEOUT = 8 * 60 * 1000;

async function openSurah(page, number = 1) {
  await page.goto(`/surah/${number}`);
  // Ayah text comes from api.alquran.cloud — give the network room.
  await expect(page.locator("#ayah-1")).toBeVisible({ timeout: 60_000 });
}

async function openRecordingModal(page) {
  await page.locator('button[title="Record your recitation"]').first().click();
  await expect(page.getByRole("heading", { name: "Voice Comparison" })).toBeVisible();
}

async function openContinuousModal(page) {
  await page.getByRole("button", { name: "Recite All" }).click();
  await expect(page.getByRole("heading", { name: "Continuous Recitation" })).toBeVisible();
}

async function uploadIntoModal(page, fixtureName) {
  await page.locator('input[type="file"]').setInputFiles(fixturePath(fixtureName));
}

// Waits for the result screen and returns the rendered score as a number,
// failing if what rendered isn't a plain integer (e.g. "NaN").
async function expectNumericScore(page) {
  const score = page.getByTestId("recitation-score");
  await expect(score).toBeVisible({ timeout: RESULT_TIMEOUT });
  const text = (await score.innerText()).trim();
  expect(text).toMatch(/^\d+$/);
  const value = parseInt(text, 10);
  expect(value).toBeGreaterThanOrEqual(0);
  expect(value).toBeLessThanOrEqual(100);
  return value;
}

test.describe("single-ayah recording flow", () => {
  test("mic recording walks idle -> recording -> analyzing/transcribing -> scored result", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openRecordingModal(page);
    await expect(page.getByText("Tap to start recording")).toBeVisible();

    await page.getByRole("button", { name: "Start recording" }).click();
    await expect(page.getByText("Recording... tap to stop")).toBeVisible();
    // Record a few seconds of the fake mic's 12s fixture, stopping well
    // before the file ends (Chromium ends the fake audio track at EOF,
    // which auto-stops MediaRecorder — a fake-device artifact, not a user
    // scenario, so the test tolerates having already landed in "recorded").
    await page.waitForTimeout(4500);
    const stopButton = page.getByRole("button", { name: "Stop recording" });
    if (await stopButton.isVisible()) await stopButton.click();

    const analyzeButton = page.getByRole("button", { name: "Analyze My Recitation" });
    await expect(analyzeButton).toBeVisible();
    await analyzeButton.click();

    // The analyzing spinner can flash by in well under a frame now that
    // Tajweed runs in the background — accept the spinner OR the result
    // itself as evidence the pipeline progressed.
    await expect(
      page.getByText(/Listening to your recording|speech recognition/).or(page.getByTestId("recitation-score"))
    ).toBeVisible();

    await expectNumericScore(page);
    await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("file-upload path reaches a scored result", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openRecordingModal(page);

    await uploadIntoModal(page, "recitation.wav");
    await page.getByRole("button", { name: "Analyze My Recitation" }).click();

    await expectNumericScore(page);
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("continuous recitation flow", () => {
  test("mic recording with Next Ayah taps reaches a scored result", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openContinuousModal(page);

    await page.getByRole("button", { name: "Start continuous recording" }).click();
    const nextAyah = page.getByRole("button", { name: "Next Ayah" });
    await expect(nextAyah).toBeVisible();

    // "Recite" across three ayahs while the fake mic plays the fixture.
    await page.waitForTimeout(2500);
    await nextAyah.click();
    await page.waitForTimeout(2500);
    await nextAyah.click();
    await page.waitForTimeout(1500);
    await page.getByRole("button", { name: "Finish & Analyze" }).click();

    await expect(
      page.getByText(/Comparing your recitation|speech recognition/).or(page.getByTestId("recitation-score"))
    ).toBeVisible();

    await expectNumericScore(page);
    await expect(page.getByText(/Recited \d+ ayahs/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("file-upload path with an ayah count reaches a scored result", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openContinuousModal(page);

    await page.getByLabel(/How many ayahs does the recording contain/).fill("2");
    await uploadIntoModal(page, "recitation.wav");

    await expectNumericScore(page);
    await expect(page.getByText(/Recited \d+ ayahs/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("Recalculate re-scores with a corrected ayah count (crashed phones via OOM before)", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openContinuousModal(page);

    await page.getByLabel(/How many ayahs does the recording contain/).fill("2");
    await uploadIntoModal(page, "recitation.wav");
    await expectNumericScore(page);

    // Let the background ASR/Tajweed pass settle first — this mirrors the
    // on-device crash sequence (first pass fully completes, then the
    // Recalculate re-analysis ran on top of the still-resident model).
    await expect(
      page.getByText(/still running in the background|Downloading speech recognition model/)
    ).toBeHidden({ timeout: RESULT_TIMEOUT });

    await page.getByPlaceholder(/^\d+$/).fill("3");
    await page.getByRole("button", { name: "Recalculate" }).click();

    await expectNumericScore(page);
    await expect(page.getByText(/Recalculated using your correction/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });
});

test.describe("edge cases", () => {
  test("silent audio produces a zero score with honest feedback, not a crash", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openRecordingModal(page);

    await uploadIntoModal(page, "silence.wav");
    await page.getByRole("button", { name: "Analyze My Recitation" }).click();

    const score = await expectNumericScore(page);
    expect(score).toBe(0);
    await expect(page.getByText(/No speech was detected/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("a too-short recording produces a zero score, not a crash", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openRecordingModal(page);

    await uploadIntoModal(page, "too-short.wav");
    await page.getByRole("button", { name: "Analyze My Recitation" }).click();

    const score = await expectNumericScore(page);
    expect(score).toBe(0);
    await expect(page.getByText(/No speech was detected/)).toBeVisible();
    expect(consoleErrors).toEqual([]);
  });

  test("a corrupted file shows the error state and Try Again recovers (single ayah)", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openRecordingModal(page);

    await uploadIntoModal(page, "corrupted.wav");
    await page.getByRole("button", { name: "Analyze My Recitation" }).click();

    await expect(page.getByText("Something went wrong analyzing your recording. Please try again.")).toBeVisible();
    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(page.getByText("Tap to start recording")).toBeVisible();

    // The app logs the decode failure to the console by design; what must
    // never happen is an uncaught exception.
    expect(pageErrors(consoleErrors)).toEqual([]);
  });

  test("a corrupted file shows the error state and Try Again recovers (continuous)", async ({ page, consoleErrors }) => {
    await openSurah(page);
    await openContinuousModal(page);

    await uploadIntoModal(page, "corrupted.wav");

    await expect(page.getByText("Something went wrong analyzing your recording. Please try again.")).toBeVisible();
    await page.getByRole("button", { name: "Try Again" }).click();
    await expect(page.getByText("Tap to start continuous recording")).toBeVisible();

    expect(pageErrors(consoleErrors)).toEqual([]);
  });
});
