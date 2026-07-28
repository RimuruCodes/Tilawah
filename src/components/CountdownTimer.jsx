import React, { useState, useEffect } from "react";
import { Calendar, Sparkles } from "lucide-react";
import { getCountdown, APP_STORE_RELEASE_DATE } from "@/lib/countdown";

// Filled in once the app actually ships and a real listing exists — a
// fabricated or placeholder App Store URL would be worse than no link at
// all. Until then the "we're live" state below reads fine with no link.
const APP_STORE_URL = null;

// Supporting detail on the Landing page (Phase 1, 2026-07): calm, plainly
// informative, deliberately NOT the most visually dominant element on the
// page (see Landing.jsx — the hero headline and "Get Started free" CTA
// stay the most prominent things). No urgency/scarcity language by
// design — this is a Quran recitation app, not a flash sale.
export default function CountdownTimer() {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, []);

  const countdown = getCountdown(APP_STORE_RELEASE_DATE, now);

  if (countdown.isPast) {
    return (
      <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-700/20 text-center space-y-3">
        <div className="inline-flex items-center justify-center w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20">
          <Sparkles className="w-5 h-5 text-emerald-400" />
        </div>
        <div>
          <p className="text-sm font-semibold text-white">We're live on the App Store</p>
          <p className="text-xs text-slate-500 mt-1">Quran Companion is now available to download.</p>
        </div>
        {APP_STORE_URL && (
          <a
            href={APP_STORE_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center px-5 py-2 rounded-xl bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 transition-colors"
          >
            Open the App Store
          </a>
        )}
      </div>
    );
  }

  const units = [
    { label: "Days", value: countdown.days, pad: false },
    { label: "Hours", value: countdown.hours, pad: true },
    { label: "Minutes", value: countdown.minutes, pad: true },
    { label: "Seconds", value: countdown.seconds, pad: true },
  ];

  return (
    <div className="p-5 rounded-2xl bg-slate-900/50 border border-slate-700/20">
      <div className="flex items-center justify-center gap-1.5 mb-3">
        <Calendar className="w-3.5 h-3.5 text-slate-500" />
        <p className="text-xs text-slate-500">Coming to the App Store</p>
      </div>
      <div className="flex items-center justify-center gap-3 sm:gap-5">
        {units.map((u) => (
          <div key={u.label} className="text-center min-w-[2.5rem]">
            <p className="text-2xl font-bold text-white tabular-nums">
              {u.pad ? String(u.value).padStart(2, "0") : u.value}
            </p>
            <p className="text-[10px] text-slate-500 uppercase tracking-wide mt-0.5">{u.label}</p>
          </div>
        ))}
      </div>
    </div>
  );
}
