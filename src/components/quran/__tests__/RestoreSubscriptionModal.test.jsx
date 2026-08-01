// The actual security property from the 2026-08-01 restore-purchase fix:
// entering a DIFFERENT person's subscription email in "Restore purchase"
// must transfer that subscription's entitlement to the caller's own
// account WITHOUT ever changing which account is actually signed in on
// this device (see restore-subscription/index.ts's header comment for the
// full trace of the bug this replaces). Verified here at the component
// level by asserting getActiveUserId() -- the app-wide "who is signed in"
// pointer every cloud read/write is scoped by (src/lib/activeUser.js,
// src/lib/dataSync.js) -- is bit-for-bit identical before and after both a
// successful and a failed restore attempt.
import React from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import RestoreSubscriptionModal from "@/components/quran/RestoreSubscriptionModal";
import { setActiveUser, getActiveUserId } from "@/lib/activeUser";

const requestLoginCode = vi.fn();
const restoreSubscriptionByEmail = vi.fn();
vi.mock("@/lib/subscriptionApi", () => ({
  requestLoginCode: (...args) => requestLoginCode(...args),
  restoreSubscriptionByEmail: (...args) => restoreSubscriptionByEmail(...args),
}));

const refreshSubscription = vi.fn();
vi.mock("@/lib/SubscriptionContext", () => ({
  useSubscription: () => ({ refreshSubscription }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  setActiveUser({ id: "caller-account-1" });
});

async function goToCodeStep(email = "someone-elses-subscription@example.com") {
  fireEvent.change(screen.getByPlaceholderText("you@example.com"), { target: { value: email } });
  fireEvent.click(screen.getByText("Send code"));
  await waitFor(() => expect(requestLoginCode).toHaveBeenCalledWith(email));
  await screen.findByPlaceholderText("123456");
}

describe("RestoreSubscriptionModal", () => {
  it("transfers entitlement on a successful restore without changing the caller's own active user id", async () => {
    const idBefore = getActiveUserId();
    expect(idBefore).toBe("caller-account-1");

    restoreSubscriptionByEmail.mockResolvedValue({ plan: "yearly", status: "active" });
    refreshSubscription.mockResolvedValue({ status: "active", plan: "yearly" });

    render(<RestoreSubscriptionModal open onClose={() => {}} />);
    await goToCodeStep();

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "654321" } });
    fireEvent.click(screen.getByText("Verify & restore"));

    await screen.findByText(/subscription is active/i);

    expect(restoreSubscriptionByEmail).toHaveBeenCalledWith("someone-elses-subscription@example.com", "654321");
    // The property that matters: the caller's own identity never moved.
    expect(getActiveUserId()).toBe(idBefore);
    expect(getActiveUserId()).toBe("caller-account-1");
  });

  it("leaves the caller's active user id unchanged when the restored email has no active subscription", async () => {
    const idBefore = getActiveUserId();

    restoreSubscriptionByEmail.mockResolvedValue({ plan: null, status: "none" });
    refreshSubscription.mockResolvedValue({ status: "none", plan: null });

    render(<RestoreSubscriptionModal open onClose={() => {}} />);
    await goToCodeStep("no-subscription@example.com");

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "111111" } });
    fireEvent.click(screen.getByText("Verify & restore"));

    await screen.findByText(/No active subscription was found for that email/i);
    expect(getActiveUserId()).toBe(idBefore);
  });

  it("surfaces the server's error message when the code is wrong, without touching the active user id", async () => {
    const idBefore = getActiveUserId();
    restoreSubscriptionByEmail.mockRejectedValue(new Error("That code didn't work — check it and try again."));

    render(<RestoreSubscriptionModal open onClose={() => {}} />);
    await goToCodeStep();

    fireEvent.change(screen.getByPlaceholderText("123456"), { target: { value: "000000" } });
    fireEvent.click(screen.getByText("Verify & restore"));

    await screen.findByText("That code didn't work — check it and try again.");
    expect(refreshSubscription).not.toHaveBeenCalled();
    expect(getActiveUserId()).toBe(idBefore);
  });
});
