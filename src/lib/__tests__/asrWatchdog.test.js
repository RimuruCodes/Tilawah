import { describe, expect, it } from "vitest";
import {
  ASR_LOAD_CEILING_MS,
  ASR_SUSPEND_GAP_MS,
  inferenceCeilingMs,
  deadlineDelayForProgress,
  isSuspensionGap,
  stallReasonCode,
  IOS_ACCURATE_INFERENCE_CEILING_MS,
  isRiskyInference,
} from "@/lib/asrWatchdog";

const ACCURATE_ID = "An0xity/whisper-base-ar-quran-onnx-timestamped";
const FAST_ID = "Xenova/whisper-tiny";

describe("inferenceCeilingMs", () => {
  it("scales at 10x real-time, floored at 180s and capped at 360s", () => {
    expect(inferenceCeilingMs(5)).toBe(180_000); // 50s -> floored to 180s
    expect(inferenceCeilingMs(26.5)).toBe(265_000); // in range
    expect(inferenceCeilingMs(60)).toBe(360_000); // 600s -> capped at 360s
  });
});

describe("deadlineDelayForProgress", () => {
  it("keeps the generous inference budget while still downloading", () => {
    expect(deadlineDelayForProgress(0, 26.5)).toBe(inferenceCeilingMs(26.5));
    expect(deadlineDelayForProgress(99, 26.5)).toBe(inferenceCeilingMs(26.5));
  });

  it("tightens to the short session-creation ceiling the instant download completes", () => {
    expect(deadlineDelayForProgress(100, 26.5)).toBe(ASR_LOAD_CEILING_MS);
    expect(deadlineDelayForProgress(100, 300)).toBe(ASR_LOAD_CEILING_MS);
    // The load ceiling must actually be shorter than the inference one, or it
    // wouldn't help the observed session-creation hang.
    expect(ASR_LOAD_CEILING_MS).toBeLessThan(inferenceCeilingMs(26.5));
  });
});

describe("isSuspensionGap", () => {
  it("flags only gaps well beyond the 2s tick cadence", () => {
    expect(isSuspensionGap(2_000)).toBe(false);
    expect(isSuspensionGap(ASR_SUSPEND_GAP_MS)).toBe(false);
    expect(isSuspensionGap(ASR_SUSPEND_GAP_MS + 1)).toBe(true);
    expect(isSuspensionGap(120_000)).toBe(true); // a minutes-long freeze
  });
});

describe("stallReasonCode", () => {
  it("prefers an explicit backgrounding, then a suspension gap, then plain timeout", () => {
    expect(stallReasonCode({ wentHidden: true, wasSuspended: false })).toBe("backgrounded-during-inference");
    expect(stallReasonCode({ wentHidden: true, wasSuspended: true })).toBe("backgrounded-during-inference");
    expect(stallReasonCode({ wentHidden: false, wasSuspended: true })).toBe("suspended-during-inference");
    expect(stallReasonCode({ wentHidden: false, wasSuspended: false })).toBe("timed-out");
  });
});

describe("isRiskyInference", () => {
  it("flags only iOS + the accurate model — the one combination observed to crash", () => {
    expect(isRiskyInference({ isIos: true, modelId: ACCURATE_ID, accurateModelId: ACCURATE_ID })).toBe(true);
  });

  it("never flags the fast model, on any device", () => {
    expect(isRiskyInference({ isIos: true, modelId: FAST_ID, accurateModelId: ACCURATE_ID })).toBe(false);
  });

  it("never flags the accurate model off iOS (Android/desktop never showed this crash)", () => {
    expect(isRiskyInference({ isIos: false, modelId: ACCURATE_ID, accurateModelId: ACCURATE_ID })).toBe(false);
  });
});

describe("IOS_ACCURATE_INFERENCE_CEILING_MS", () => {
  it("is far shorter than the normal audio-scaled inference ceiling, for any realistic recording", () => {
    expect(IOS_ACCURATE_INFERENCE_CEILING_MS).toBeLessThan(inferenceCeilingMs(5)); // even the 180s floor
  });
});
