import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Heart, Sparkles, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { cashAppUrl } from "@/lib/payments";
import { startDonation, isDonationBackendConfigured } from "@/lib/donationApi";

const AMOUNTS = [5, 10, 25, 50];

export default function SupportModal({ open, onClose }) {
  const [stage, setStage] = useState("appeal");
  const [amount, setAmount] = useState(10);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    if (open) {
      setStage("appeal");
      setAmount(10);
      setBusy(false);
      setErrorMessage("");
    }
  }, [open]);

  // Stripe path: redirect to Checkout (the thank-you dua appears on the
  // /donate page when Stripe sends them back with ?donation=success).
  const handleStripeDonate = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const url = await startDonation(amount * 100);
      window.location.assign(url);
    } catch (err) {
      setBusy(false);
      setErrorMessage(err.message || "Couldn't start the donation — try again in a moment.");
    }
  };

  // Cash App fallback (no backend): opens Cash App in a new tab, so the
  // modal stays and we can show the dua inline.
  const handleCashAppClick = () => setStage("dua");

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-md p-0 overflow-hidden">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 z-10 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        <AnimatePresence mode="wait">
          {stage === "appeal" ? (
            <motion.div
              key="appeal"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="p-8 space-y-5"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/20 flex items-center justify-center">
                  <Heart className="w-7 h-7 text-amber-400" />
                </div>
                <h2 className="text-xl font-bold text-white tracking-tight">
                  Share in the Reward <span className="text-amber-400">(Sadaqah Jariyah)</span>
                </h2>
                <p className="text-sm text-slate-400 leading-relaxed">
                  This app is built and maintained independently. By supporting this project, you help keep it ad-free and available for thousands of Muslims to memorize the Quran. Every letter they read becomes a reward in your scale of good deeds.
                </p>
              </div>

              <div className="flex gap-2 justify-center flex-wrap">
                {AMOUNTS.map((a) => (
                  <button
                    key={a}
                    onClick={() => setAmount(a)}
                    className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                      amount === a
                        ? "bg-amber-500 text-slate-900 shadow-lg shadow-amber-500/20"
                        : "bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50"
                    }`}
                  >
                    ${a}
                  </button>
                ))}
              </div>

              {isDonationBackendConfigured ? (
                <button
                  onClick={handleStripeDonate}
                  disabled={busy}
                  className="w-full py-4 rounded-xl bg-amber-500 text-slate-900 font-semibold text-base flex items-center justify-center gap-2 hover:bg-amber-400 disabled:opacity-50 transition-colors shadow-lg shadow-amber-500/30"
                >
                  {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : (
                    <>
                      <Heart className="w-5 h-5" />
                      Donate ${amount}
                    </>
                  )}
                </button>
              ) : (
                <a
                  href={cashAppUrl(amount)}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handleCashAppClick}
                  className="w-full py-4 rounded-xl bg-[#00D632] text-white font-semibold text-base flex items-center justify-center gap-2 hover:bg-[#00B82B] transition-colors shadow-lg shadow-[#00D632]/30"
                >
                  <Heart className="w-5 h-5" />
                  Donate ${amount} via Cash App
                </a>
              )}

              {errorMessage && <p className="text-xs text-orange-400 text-center">{errorMessage}</p>}

              <p className="text-[10px] text-slate-600 text-center">
                {isDonationBackendConfigured
                  ? "Secure one-time payment via Stripe. Your card details never touch this app."
                  : "You will be redirected to Cash App in a new tab."}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="dua"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -12 }}
              transition={{ duration: 0.3 }}
              className="p-8 space-y-5"
            >
              <div className="flex flex-col items-center text-center space-y-4">
                <motion.div
                  initial={{ scale: 0.6, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ delay: 0.1, type: "spring", stiffness: 200 }}
                  className="w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center"
                >
                  <Sparkles className="w-7 h-7 text-emerald-400" />
                </motion.div>
                <h2 className="text-2xl font-bold text-white tracking-tight">
                  Jazakallah Khair!
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed">
                  My personal Dua to you: May Allah accept your charity, bless your wealth, and make this a continuous source of reward (Sadaqah Jariyah) for you and your loved ones in this life and the next. Ameen.
                </p>
              </div>

              <button
                onClick={onClose}
                className="w-full py-3 rounded-xl bg-slate-800 text-slate-300 font-medium hover:bg-slate-700 transition-colors"
              >
                Close
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </DialogContent>
    </Dialog>
  );
}
