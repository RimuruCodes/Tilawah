import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Loader2, CheckCircle2, Mail } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import {
  requestLoginCode,
  verifyLoginCode,
  subscriberSignOut,
  claimSubscriberSession,
} from "@/lib/subscriptionApi";
import { useSubscription } from "@/lib/SubscriptionContext";
import { useAuth } from "@/lib/AuthContext";
import { isSubscriptionActive } from "@/lib/entitlements";

// "Restore purchase": for an existing subscriber on a NEW device/browser.
//
// This is deliberately independent of the local-account email. A returning
// subscriber first creates a local account (any email) to get past the app's
// login wall — that local email need NOT be their subscription email. Here
// they verify their actual SUBSCRIPTION email via a 6-digit code, which
// re-establishes the Supabase session and unlocks paid features on this
// device.
//
// Why this is separate from UpgradeModal's OTP (which forces an email match):
// letting the *subscribe* flow accept a mismatched email would re-open the
// identity-desync bug — a Supabase session for one email attached to a local
// account for another. Restore instead ties the restored session to whoever
// is signed in locally right now (claimSubscriberSession), so the reconcile
// logic still signs it out cleanly on logout or an account switch.
export default function RestoreSubscriptionModal({ open, onClose }) {
  const { refreshSubscription } = useSubscription();
  const { user } = useAuth();
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
      await verifyLoginCode(email.trim(), code.trim());
      // Tie the restored session to the local account active on this device
      // so it reconciles away cleanly on logout / account switch.
      claimSubscriberSession(user?.id);
      const subscription = await refreshSubscription();
      if (isSubscriptionActive(subscription)) {
        setStep("done");
        return;
      }
      // Verified an email that has no active subscription — don't leave a
      // dangling Supabase session behind; sign it straight back out.
      await subscriberSignOut();
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
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-md p-0">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <RotateCcw className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Restore purchase</h3>
            <p className="text-sm text-slate-400">
              Already subscribed on another device? Confirm your subscription email to unlock everything here — no need to pay again.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === "email" && (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-xs text-slate-500">
                  Enter the email you subscribed with. We'll send a 6-digit code to confirm it's you. This can be different from the email you use to sign in on this device.
                </p>
                <div className="flex items-center gap-2 bg-slate-800/50 border border-slate-700/30 rounded-xl px-3 py-2.5">
                  <Mail className="w-4 h-4 text-slate-500 flex-shrink-0" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="you@example.com"
                    className="w-full bg-transparent text-sm text-white placeholder:text-slate-600 outline-none"
                  />
                </div>
                {errorMessage && <p className="text-xs text-orange-400">{errorMessage}</p>}
                <button
                  onClick={handleSendCode}
                  disabled={busy || !email.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Send code"}
                </button>
                <button onClick={resetAndClose} className="w-full text-xs text-slate-500 hover:text-slate-300">
                  Cancel
                </button>
              </motion.div>
            )}

            {step === "code" && (
              <motion.div key="code" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-xs text-slate-500">Enter the 6-digit code sent to {email}.</p>
                <input
                  type="text"
                  inputMode="numeric"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                  placeholder="123456"
                  className="w-full text-center tracking-[0.3em] bg-slate-800/50 border border-slate-700/30 rounded-xl px-3 py-2.5 text-lg text-white placeholder:text-slate-600 outline-none"
                />
                {errorMessage && <p className="text-xs text-orange-400">{errorMessage}</p>}
                <button
                  onClick={handleVerifyCode}
                  disabled={busy || !code.trim()}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400 disabled:opacity-50 transition-colors text-sm flex items-center justify-center gap-2"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & restore"}
                </button>
                <button onClick={handleSendCode} disabled={busy} className="w-full text-xs text-slate-500 hover:text-slate-300">
                  Resend code
                </button>
              </motion.div>
            )}

            {step === "done" && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
                <CheckCircle2 className="w-10 h-10 text-emerald-400" />
                <p className="text-sm text-slate-300">Your subscription is active — everything is unlocked on this device.</p>
                <button
                  onClick={resetAndClose}
                  className="px-5 py-2.5 rounded-xl bg-emerald-500/20 text-emerald-400 font-medium hover:bg-emerald-500/30 transition-colors text-sm"
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
