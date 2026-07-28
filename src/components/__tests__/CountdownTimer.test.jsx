import React from "react";
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import CountdownTimer from "@/components/CountdownTimer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("CountdownTimer", () => {
  it("shows a live countdown before the release date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-20T00:00:00Z")); // 5 days before release
    const { container } = render(<CountdownTimer />);
    expect(container.textContent).toContain("Coming to the App Store");
    expect(container.textContent).toContain("Days");
    expect(container.textContent).not.toContain("We're live");
  });

  // The specific edge case this project has learned to test explicitly for
  // (see the Ghunnah/Ikhfa spectral research and the Qalqalah refinement
  // this session): correct "today" behavior silently breaking on the one
  // day it actually matters. Faking the system clock to a date AFTER the
  // release, rather than just trusting the countdown math tests alone,
  // proves the component itself switches states -- not just that the pure
  // function returns the right numbers.
  it("shows the 'we're live' state, not a negative or frozen-zero countdown, once the release date has passed", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-01T00:00:00Z")); // well after release
    const { container } = render(<CountdownTimer />);
    expect(container.textContent).toContain("We're live on the App Store");
    expect(container.textContent).not.toContain("Coming to the App Store");
    // Never a negative number or a frozen "0" countdown anywhere in the DOM.
    expect(container.textContent).not.toMatch(/-\d+/);
    expect(container.textContent).not.toContain("Days");
  });

  it("switches from counting down to 'we're live' as the system clock crosses the release date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-08-24T23:59:58Z")); // 2 seconds before release
    const { container, rerender } = render(<CountdownTimer />);
    expect(container.textContent).toContain("Coming to the App Store");

    // Advance the fake clock past the release instant and let the
    // component's own 1s interval tick pick it up.
    vi.setSystemTime(new Date("2026-08-25T00:00:01Z"));
    vi.advanceTimersByTime(1000);
    rerender(<CountdownTimer />);
    expect(container.textContent).toContain("We're live on the App Store");
  });
});
