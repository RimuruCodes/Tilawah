import React, { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { Heart, ExternalLink, Loader2 } from "lucide-react";
import { CASH_APP_CASHTAG, cashAppUrl } from "@/lib/payments";
import { startDonation, isDonationBackendConfigured } from "@/lib/donationApi";

export default function DonationCard() {
  const [amount, setAmount] = useState(10);
  const [thanked, setThanked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  const amounts = [5, 10, 25, 50, 100];

  // Returning from Stripe Checkout (success_url/cancel_url land here).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const donation = params.get("donation");
    if (!donation) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (donation === "success") setThanked(true);
    else if (donation === "cancelled") setErrorMessage("Donation cancelled — nothing was charged.");
  }, []);

  const handleStripeDonate = async () => {
    setBusy(true);
    setErrorMessage("");
    try {
      const url = await startDonation(amount * 100);
      window.location.assign(url); // navigating away — leave busy=true
    } catch (err) {
      setBusy(false);
      setErrorMessage(err.message || "Couldn't start the donation — try again in a moment.");
    }
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="relative overflow-hidden rounded-2xl border border-emerald-500/20 bg-gradient-to-br from-emerald-900/20 to-slate-900/80 p-6"
    >
      <div className="absolute top-0 right-0 w-40 h-40 bg-emerald-500/5 rounded-full -translate-y-1/2 translate-x-1/2" />
      <div className="absolute bottom-0 left-0 w-32 h-32 bg-emerald-500/5 rounded-full translate-y-1/2 -translate-x-1/2" />

      <div className="relative space-y-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/20 flex items-center justify-center">
            <Heart className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h3 className="text-lg font-semibold text-white">Support This Project</h3>
            <p className="text-xs text-slate-400">Help keep Quran learning free for everyone</p>
          </div>
        </div>

        <div className="flex gap-2 flex-wrap">
          {amounts.map(a => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${
                amount === a
                  ? 'bg-emerald-500 text-slate-900 shadow-lg shadow-emerald-500/20'
                  : 'bg-slate-800/50 text-slate-300 hover:bg-slate-700/50 border border-slate-700/50'
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
            className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 font-semibold flex items-center justify-center gap-2 hover:bg-emerald-400 disabled:opacity-50 transition-colors shadow-lg shadow-emerald-500/20"
          >
            {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : (
              <>
                <Heart className="w-4 h-4" />
                Donate ${amount}
              </>
            )}
          </button>
        ) : (
          <a
            href={cashAppUrl(amount)}
            target="_blank"
            rel="noopener noreferrer"
            onClick={() => setThanked(true)}
            className="w-full py-3 rounded-xl bg-[#00D632] text-white font-semibold flex items-center justify-center gap-2 hover:bg-[#00B82B] transition-colors shadow-lg shadow-[#00D632]/30"
          >
            <ExternalLink className="w-4 h-4" />
            Donate ${amount} via Cash App
          </a>
        )}

        {errorMessage && <p className="text-xs text-orange-400 text-center">{errorMessage}</p>}

        {thanked && (
          <p className="text-xs text-emerald-300 text-center">
            Jazakallah Khair! May Allah reward your generosity.
          </p>
        )}

        <p className="text-[10px] text-slate-600 text-center">
          {isDonationBackendConfigured
            ? "Secure one-time payment via Stripe. Your card details never touch this app."
            : `Donations go to ${CASH_APP_CASHTAG} via Cash App, opened in a new tab.`}
        </p>
      </div>
    </motion.div>
  );
}
