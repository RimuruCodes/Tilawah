// Covers the actual security property the 2026-08-01 restore-purchase fix
// depends on: restoreSubscriptionByEmail (used by RestoreSubscriptionModal,
// where the entered email may legitimately differ from the signed-in
// account) must NEVER call the client-side supabase.auth.verifyOtp -- that
// call is what silently swapped the caller's identity before this fix (see
// restore-subscription/index.ts's header comment for the full trace).
// verifyLoginCode (used only by UpgradeModal, which enforces an emailHash
// match first) is untouched and still uses verifyOtp directly -- kept here
// as a contrast case, not a regression risk.
import { beforeEach, describe, expect, it, vi } from "vitest";

const mockAuth = {
  verifyOtp: vi.fn(),
  getSession: vi.fn(async () => ({ data: { session: null } })),
  signOut: vi.fn(async () => {}),
};
const mockFunctions = { invoke: vi.fn() };
const mockSupabase = { auth: mockAuth, functions: mockFunctions, from: vi.fn() };

vi.mock("@/lib/supabaseClient", () => ({
  supabase: mockSupabase,
  isSubscriptionBackendConfigured: true,
}));

const { restoreSubscriptionByEmail, verifyLoginCode } = await import("@/lib/subscriptionApi");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("restoreSubscriptionByEmail", () => {
  it("verifies via the restore-subscription Edge Function, not the client-side verifyOtp", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: { plan: "yearly", status: "active", currentPeriodEnd: "2027-01-01T00:00:00.000Z", cancelAtPeriodEnd: false },
      error: null,
    });

    const result = await restoreSubscriptionByEmail("other-persons-subscription@example.com", "123456");

    expect(mockFunctions.invoke).toHaveBeenCalledWith("restore-subscription", {
      body: { email: "other-persons-subscription@example.com", token: "123456" },
    });
    // The property that matters: this call path must never establish a
    // session for the entered email on the shared client.
    expect(mockAuth.verifyOtp).not.toHaveBeenCalled();
    expect(result).toEqual({ plan: "yearly", status: "active", currentPeriodEnd: "2027-01-01T00:00:00.000Z", cancelAtPeriodEnd: false });
  });

  it("surfaces the Edge Function's own error message (e.g. no active subscription for that email)", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: null,
      error: {
        message: "Edge Function returned a non-2xx status code",
        context: { json: async () => ({ error: "No active subscription was found for that email. If you subscribed with a different address, try that one." }) },
      },
    });

    await expect(restoreSubscriptionByEmail("nobody@example.com", "000000")).rejects.toThrow(
      "No active subscription was found for that email."
    );
    expect(mockAuth.verifyOtp).not.toHaveBeenCalled();
  });

  it("falls back to a generic message when the Edge Function's error has no parseable body", async () => {
    mockFunctions.invoke.mockResolvedValue({
      data: null,
      error: { message: "network error", context: undefined },
    });

    await expect(restoreSubscriptionByEmail("x@example.com", "111111")).rejects.toThrow("network error");
  });
});

describe("verifyLoginCode (UpgradeModal's guarded path — untouched by this fix)", () => {
  it("still calls the client-side verifyOtp directly", async () => {
    mockAuth.verifyOtp.mockResolvedValue({ data: { session: { user: { id: "u1" } } }, error: null });

    await verifyLoginCode("same-as-signed-in@example.com", "123456");

    expect(mockAuth.verifyOtp).toHaveBeenCalledWith({
      email: "same-as-signed-in@example.com",
      token: "123456",
      type: "email",
    });
    expect(mockFunctions.invoke).not.toHaveBeenCalled();
  });
});
