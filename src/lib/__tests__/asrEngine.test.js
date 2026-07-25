import { describe, it, expect } from "vitest";
import {
  defaultAsrModelPreference,
  getAsrModelPreference,
  setAsrModelPreference,
  defaultAsrEnabled,
  isAsrEnabled,
  setAsrEnabled,
  isIosWebKit,
  isAsrBusy,
  setAsrBusy,
  ASR_CRASH_SUSPECT_KEY,
} from "@/lib/asrEngine";

// This flag now gates the ASR execution provider: on iOS the worker must
// never be allowed to pick webgpu (transformers.js loads FP32 weights
// there — ~150MB for "tiny" — and a session-creation OOM kills the tab
// uncatchably). Getting this wrong reintroduces the iPhone crash.
describe("isIosWebKit", () => {
  it("detects iPhone/iPad user agents", () => {
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)" })).toBe(true);
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X)" })).toBe(true);
  });

  it("does not flag desktop or Android user agents", () => {
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0" })).toBe(false);
    expect(isIosWebKit({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36" })).toBe(false);
  });
});

// Mobile Chrome tabs get OOM-killed loading the base model (confirmed
// on-device) — these pin the device-aware default that avoids that.
describe("defaultAsrModelPreference", () => {
  const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/126.0 Safari/537.36";

  it("picks the small model on mobile user agents", () => {
    expect(
      defaultAsrModelPreference({ userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 7) Mobile Safari/537.36", deviceMemory: 8 })
    ).toBe("fast");
    expect(
      defaultAsrModelPreference({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", deviceMemory: 6 })
    ).toBe("fast");
  });

  it("picks the small model on low-memory devices regardless of form factor", () => {
    expect(defaultAsrModelPreference({ userAgent: DESKTOP_UA, deviceMemory: 4 })).toBe("fast");
    expect(defaultAsrModelPreference({ userAgent: DESKTOP_UA, deviceMemory: 2 })).toBe("fast");
  });

  it("keeps the accurate model on desktops with enough (or unreported) memory", () => {
    expect(defaultAsrModelPreference({ userAgent: DESKTOP_UA, deviceMemory: 8 })).toBe("accurate");
    // deviceMemory unreported (non-Chrome browsers): not treated as low.
    expect(defaultAsrModelPreference({ userAgent: DESKTOP_UA, deviceMemory: undefined })).toBe("accurate");
  });

  it("an explicit saved preference always wins over the device default", () => {
    localStorage.setItem("qc_asr_model_pref", "accurate");
    expect(getAsrModelPreference()).toBe("accurate");
    setAsrModelPreference("fast");
    expect(getAsrModelPreference()).toBe("fast");
    localStorage.removeItem("qc_asr_model_pref");
  });
});

// The crash-proof safety net: ASR must not even start on devices where the
// model load is known to kill the tab — a dead tab can't catch its own error.
describe("defaultAsrEnabled / isAsrEnabled", () => {
  const DESKTOP_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/126.0";

  it("defaults off when a previous session died during an ASR stage", () => {
    expect(defaultAsrEnabled({ userAgent: DESKTOP_UA, crashSuspected: true })).toBe(false);
  });

  it("defaults off on iOS user agents (tighter wasm memory limits)", () => {
    expect(defaultAsrEnabled({ userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)", crashSuspected: false })).toBe(false);
  });

  it("defaults on elsewhere", () => {
    expect(defaultAsrEnabled({ userAgent: DESKTOP_UA, crashSuspected: false })).toBe(true);
  });

  it("an explicit Settings choice overrides the crash-suspect default in both directions", () => {
    localStorage.setItem(ASR_CRASH_SUSPECT_KEY, "asr-load-start at test");
    expect(isAsrEnabled()).toBe(false); // suspect flag suppresses ASR by default
    setAsrEnabled(true); // the person explicitly re-enables it
    expect(isAsrEnabled()).toBe(true);
    setAsrEnabled(false);
    expect(isAsrEnabled()).toBe(false);
    localStorage.removeItem(ASR_CRASH_SUSPECT_KEY);
    localStorage.removeItem("qc_asr_enabled");
  });
});

// The concurrency guard between recorded-audio transcription and reference-
// audio follow-along estimation — two overlapping ASR flows would each
// hold their own decoded audio buffer alongside the model, stacking memory
// the way that's crashed mobile tabs before.
describe("isAsrBusy / setAsrBusy", () => {
  it("defaults to not busy", () => {
    expect(isAsrBusy()).toBe(false);
  });

  it("reflects whatever was last set, coerced to a real boolean", () => {
    setAsrBusy(true);
    expect(isAsrBusy()).toBe(true);
    setAsrBusy(false);
    expect(isAsrBusy()).toBe(false);
    setAsrBusy(1); // truthy, non-boolean input
    expect(isAsrBusy()).toBe(true);
    setAsrBusy(0);
    expect(isAsrBusy()).toBe(false);
  });
});
