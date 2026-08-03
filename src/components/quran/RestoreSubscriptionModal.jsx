import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Loader2, CheckCircle2, Mail } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { requestLoginCode, restoreSubscriptionByEmail } from "@/lib/subscriptionApi";
import { useSubscription } from "@/lib/SubscriptionContext";
import { isSubscriptionActive } from "@/lib/entitlements";

// "Restore purchase": for an existing subscriber on a NEW device/browser.
//
// This is deliberately independent of the local-account email. A returning
// subscriber first creates a local account (any email) to get past the app's
// login wall — that local email need NOT be their subscription email. Here
// they verify their actual SUBSCRIPTION email via a 6-digit code.
//
// Why this is separate from UpgradeModal's OTP (which forces an email
// match): letting this flow accept a mismatched email is the whole point,
// which means it CANNOT verify that code the same way UpgradeModal does.
// UpgradeModal's supabase.auth.verifyOtp() establishes a real session for
// whatever email is entered — safe there only because the emailHash guard
// already forces it to match the signed-in account. This flow has no such
// guard, so verifying the same way would silently sign the caller into a
// DIFFERENT person's account (a real bug found in the 2026-08-01 code
// audit — the "reconcile" mechanism this comment used to claim protected
// against that had zero call sites anywhere in the app). Fixed by moving
// verification server-side (restoreSubscriptionByEmail -> the
// restore-subscription Edge Function): the code is checked against the
// restored email without ever creating a session for it, and that
// subscription's entitlement is transferred to the CALLER's own account
// instead. The caller's own session never changes throughout this flow.
export default function RestoreSubscriptionModal({ open, onClose }) {
  const { refreshSubscription } = useSubscription();
  const [step, setStep] = useState("email"); // email, code, done
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const resetAndClose = () => {
    setStep("email");
    setEmail("");
    setCode("");
    setBusy(false);
    setErrorMessage("");
    onClose();
  };

  const handleSendCode = async () => {
    if (!email.trim()) return;
    setBusy(true);
    setErrorMessage("");
    try {
      await requestLoginCode(email.trim());
      setStep("code");
    } catch (err) {
      setErrorMessage(err.message || "Couldn't send a code to that email — check it and try again.");
    } finally {
      setBusy(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!code.trim()) return;
    setBusy(true);
    setErrorMessage("");
    try {
      // Verifies the code and transfers that email's subscription to the
      // caller's own account entirely server-side — no session for the
      // restored email is ever created on this device, so there's nothing
      // to sign back out on the "no active subscription" path below.
      await restoreSubscriptionByEmail(email.trim(), code.trim());
      const subscription = await refreshSubscription();
      if (isSubscriptionActive(subscription)) {
        setStep("done");
        return;
      }
      setErrorMessage("No active subscription was found for that email. If you subscribed with a different address, try that one.");
      setStep("email");
    } catch (err) {
      setErrorMessage(err.message || "That code didn't work — check it and try again.");
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-ink-surface border-ink-border max-w-md p-0">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-ink-accent-soft border border-ink-accent/20">
              <RotateCcw className="w-6 h-6 text-ink-accent" />
            </div>
            <h3 className="text-lg font-semibold text-ink-text">Restore purchase</h3>
            <p className="text-sm text-ink-text-2">
              Already subscribed on another device? Confirm your subscription email to unlock everything here — no need to pay again.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === "email" && (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-xs text-ink-text-3">
                  Enter the email you subscribed with. We'll send a 6-digit code to confirm it's you. This can be different from the email you use to sign in on this device.
                </p>
                <div className="flex items-center gap-2 bg-ink-surface-2/50 border border-ink-border/60 rounded-xl px-3 py-2.5">
                  <Mail className="w-4 h-4 text-ink-text-3 flex-shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm text-ink-text placeholder:text-ink-text-3 outline-none"
                  />
                </div>
                {errorMessage && <p className="text-xs text-ink-danger">{errorMessage}</p>}
                <button
                  onClick={handleSendCode}
                  disabled={busy || !email.trim()}
                  className="w-full py-2.5 rounded-xl bg-ink-accent text-ink-bg font-medium hover:brightness-110 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
                </button>
                <button onClick={resetAndClose} className="w-full text-xs text-ink-text-3 hover:text-ink-text-2">
                  Cancel
                </button>
              </motion.div>
            )}

            {step === "code" && (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-xs text-ink-text-3">Enter the 6-digit code sent to {email}.</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center tracking-[0.3em] bg-ink-surface-2/50 border border-ink-border/60 rounded-xl px-3 py-2.5 text-lg text-ink-text placeholder:text-ink-text-3 outline-none"
                />
                {errorMessage && <p className="text-xs text-ink-danger">{errorMessage}</p>}
                <button
                  onClick={handleVerifyCode}
                  disabled={busy || !code.trim()}
                  className="w-full py-2.5 rounded-xl bg-ink-accent text-ink-bg font-medium hover:brightness-110 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & restore"}
                </button>
                <button onClick={handleSendCode} disabled={busy} className="w-full text-xs text-ink-text-3 hover:text-ink-text-2">
                  Resend code
                </button>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-ink-success" />
                <p className="text-sm text-ink-text-2">Your subscription is active — everything is unlocked on this device.</p>
                <button
                  onClick={resetAndClose}
                  className="px-5 py-2.5 rounded-xl bg-ink-success/20 text-ink-success font-medium hover:bg-ink-success/30 transition-colors text-sm"
                >
                  Continue
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
