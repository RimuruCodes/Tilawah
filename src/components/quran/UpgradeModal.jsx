import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Sparkles, Loader2, AlertTriangle, CheckCircle2, Mail, ExternalLink } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { requestLoginCode, verifyLoginCode, startCheckout } from "@/lib/subscriptionApi";
import { useSubscription } from "@/lib/SubscriptionContext";
import { isSubscriptionActive } from "@/lib/entitlements";
import { SUBSCRIPTION_PLANS } from "@/lib/payments";

// The single upgrade flow used everywhere a free user hits a gated
// feature: pick a plan, prove the email is theirs (a 6-digit code emailed
// via Supabase Auth + Brevo SMTP — this is also how an existing subscriber
// restores access on a new device, with no separate "restore purchase"
// flow needed), then either pay via Stripe Checkout (new subscriber) or
// unlock immediately (already active).
//
// Payment happens entirely on Stripe's hosted checkout page — the app
// never sees card details. Stripe's webhook activates the subscription
// within seconds of payment; the success URL returns to /settings, which
// re-reads entitlement state on load.
export default function UpgradeModal({ open, onClose, featureLabel }) {
  const { refreshSubscription } = useSubscription();
  const [step, setStep] = useState("plan"); // plan, email, code, pay, restored, error
  const [plan, setPlan] = useState("yearly");
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const selectedPlan = SUBSCRIPTION_PLANS.find((p) => p.id === plan) || SUBSCRIPTION_PLANS[0];

  const resetAndClose = () => {
    setStep("plan");
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
      setErrorMessage(err.message || "Couldn't send a code to that email — check it's correct and try again.");
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
      const subscription = await refreshSubscription();
      if (isSubscriptionActive(subscription)) {
        // Already subscribed (e.g. verifying on a second device) — nothing
        // to pay for, the feature unlocks as soon as this modal closes.
        setStep("restored");
        return;
      }
      setStep("pay");
    } catch (err) {
      setErrorMessage(err.message || "That code didn't work — check it and try again.");
      setStep("code");
    } finally {
      setBusy(false);
    }
  };

  // Hands the browser to Stripe's hosted checkout page for the chosen
  // plan. Same-tab navigation: Stripe sends the user back to /settings
  // when they finish (or cancel), and entitlement state refreshes there.
  const handleGoToCheckout = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const url = await startCheckout(plan);
      window.location.assign(url);
      // No setBusy(false): the page is navigating away.
    } catch (err) {
      setBusy(false);
      setErrorMessage(err.message || "Couldn't start checkout — try again in a moment.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={resetAndClose}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-md p-0">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
              <Sparkles className="w-6 h-6 text-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold text-white">Unlock {featureLabel}</h3>
            <p className="text-sm text-slate-400">
              A subscription unlocks reciting whole surahs with continuous analysis, plus your Tajweed trends over time. Single-ayah recitation analysis stays free for everyone.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {step === "plan" && (
              <motion.div key="plan" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  {SUBSCRIPTION_PLANS.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => setPlan(p.id)}
                      className={`relative p-3 rounded-xl border text-left transition-colors ${
                        plan === p.id ? "bg-emerald-500/10 border-emerald-500/40" : "bg-slate-800/40 border-slate-700/30 hover:border-slate-600/40"
                      }`}
                    >
                      {p.badge && (
                        <span className="absolute -top-2 right-2 text-[9px] px-1.5 py-0.5 rounded-full bg-emerald-500 text-slate-900 font-semibold">
                          {p.badge}
                        </span>
                      )}
                      <p className="text-sm font-medium text-white">{p.label}</p>
                      <p className="text-xs text-slate-400 mt-0.5">{p.price}</p>
                    </button>
                  ))}
                </div>
                <button
                  onClick={() => setStep("email")}
                  className="w-full py-2.5 rounded-xl bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400 transition-colors text-sm"
                >
                  Continue
                </button>
                <p className="text-[10px] text-slate-600 text-center">
                  Renews automatically until cancelled. By subscribing you agree to the{" "}
                  <a href="/terms" target="_blank" rel="noreferrer" className="underline hover:text-slate-400">Terms</a> and{" "}
                  <a href="/privacy" target="_blank" rel="noreferrer" className="underline hover:text-slate-400">Privacy Policy</a>.
                </p>
                <button onClick={resetAndClose} className="w-full text-xs text-slate-500 hover:text-slate-300">
                  Not now
                </button>
              </motion.div>
            )}

            {step === "email" && (
              <motion.div key="email" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <p className="text-xs text-slate-500">
                  We'll email a 6-digit code to confirm it's you — this also lets you restore your subscription on any other device later.
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
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Verify & continue"}
                </button>
                <button onClick={handleSendCode} disabled={busy} className="w-full text-xs text-slate-500 hover:text-slate-300">
                  Resend code
                </button>
              </motion.div>
            )}

            {step === "pay" && (
              <motion.div key="pay" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-3">
                <div className="bg-slate-800/50 border border-slate-700/30 rounded-xl p-3 text-center">
                  <p className="text-xs text-slate-500">{selectedPlan.label} plan</p>
                  <p className="text-lg font-semibold text-white">{selectedPlan.price}</p>
                </div>
                <p className="text-xs text-slate-500">
                  Payment happens on Stripe's secure checkout page — your card details never touch this app.
                  You'll be brought back here when you're done.
                </p>
                <button
                  onClick={handleGoToCheckout}
                  disabled={busy}
                  className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 font-semibold text-sm flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
                >
                  {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
                    <>
                      <ExternalLink className="w-4 h-4" />
                      Continue to secure checkout
                    </>
                  )}
                </button>
                {errorMessage && <p className="text-xs text-orange-400">{errorMessage}</p>}
                <button onClick={resetAndClose} className="w-full text-xs text-slate-500 hover:text-slate-300">
                  Not now
                </button>
              </motion.div>
            )}

            {step === "restored" && (
              <motion.div key="restored" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
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

            {step === "error" && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3 py-6 text-center">
                <AlertTriangle className="w-8 h-8 text-orange-400" />
                <p className="text-sm text-slate-300">{errorMessage}</p>
                <button onClick={() => setStep("plan")} className="px-5 py-2.5 rounded-xl bg-slate-700/50 text-slate-300 font-medium hover:bg-slate-700 transition-colors text-sm">
                  Try again
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
