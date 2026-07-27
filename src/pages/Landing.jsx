import React from "react";
import { Link } from "react-router-dom";
import { BookOpen, Mic, ShieldCheck, ScrollText, Sparkles, LogIn } from "lucide-react";
import { motion } from "framer-motion";

// Shown at "/" to anyone not signed in (see RootRoute in App.jsx) — the
// entry point people actually land on before this existed, they were
// redirected straight to /login with no idea what the app does (2026-07,
// real user report: "felt pushed into signing up"). Same visual language as
// About.jsx (the closest existing precedent for a full informational page)
// rather than the AuthLayout/shadcn style used by the Login/Register forms
// themselves — this is a page about the app, not a form.
export default function Landing() {
  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-10 pb-[calc(2rem+env(safe-area-inset-bottom))] space-y-10">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-5"
        >
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <BookOpen className="w-8 h-8 text-emerald-400" />
          </div>
          <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight leading-tight">
            Read, listen, and recite the Quran —{" "}
            <span className="bg-gradient-to-r from-emerald-400 to-emerald-200 bg-clip-text text-transparent">
              with real feedback on your Tajweed
            </span>
          </h1>
          <p className="text-slate-400 leading-relaxed max-w-md mx-auto">
            Quran Companion pairs full Uthmani text and reciter audio with genuine, on-device AI
            recitation analysis — so you can see exactly where to improve.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <Link
              to="/register"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2"
            >
              <Sparkles className="w-4 h-4" />
              Get Started free
            </Link>
            <Link
              to="/login"
              className="w-full sm:w-auto px-6 py-3 rounded-xl bg-slate-900/50 text-slate-300 text-sm font-medium hover:bg-slate-800 transition-colors flex items-center justify-center gap-2 border border-slate-700/40"
            >
              <LogIn className="w-4 h-4" />
              Log in
            </Link>
          </div>
        </motion.div>

        {/* Feature grid */}
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            {
              icon: <BookOpen className="w-5 h-5" />,
              title: "Read & Listen",
              desc: "Full Uthmani text with translations and tafsir, plus audio from renowned reciters.",
            },
            {
              icon: <ScrollText className="w-5 h-5" />,
              title: "Authentic Hadith",
              desc: "A browsable collection alongside your Quran reading.",
            },
            {
              icon: <Mic className="w-5 h-5" />,
              title: "AI Recitation Analysis",
              desc: "Record yourself and get real feedback: acoustic comparison against a reciter of your choice (pacing, pitch, rhythm), plus checks for specific Tajweed rules like Qalqalah, Ghunnah, and Madd. Genuine on-device analysis — a helpful guide alongside a real teacher, not a replacement for one.",
            },
            {
              icon: <ShieldCheck className="w-5 h-5" />,
              title: "Private by Design",
              desc: "Your voice never leaves your device. Recordings are analyzed locally and are never uploaded, stored, or shared.",
            },
          ].map((item, i) => (
            <motion.div
              key={item.title}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
              className="p-4 rounded-2xl bg-slate-900/50 border border-slate-700/20"
            >
              <div className="text-emerald-400 mb-2">{item.icon}</div>
              <h3 className="text-sm font-semibold text-white mb-1">{item.title}</h3>
              <p className="text-xs text-slate-500 leading-relaxed">{item.desc}</p>
            </motion.div>
          ))}
        </div>

        {/* Closing CTA */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.3 }}
          className="text-center space-y-3 pt-2"
        >
          <Link
            to="/register"
            className="inline-flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-500 text-slate-900 text-sm font-semibold hover:bg-emerald-400 transition-colors"
          >
            <Sparkles className="w-4 h-4" />
            Get Started free
          </Link>
          <p className="text-xs text-slate-600">No credit card required.</p>
        </motion.div>

        {/* Footer links */}
        <div className="flex items-center justify-center gap-4 flex-wrap text-xs text-slate-600 pt-4 border-t border-slate-800/60">
          <Link to="/about" className="hover:text-slate-400 transition-colors">About</Link>
          <Link to="/contact" className="hover:text-slate-400 transition-colors">Contact</Link>
          <Link to="/privacy" className="hover:text-slate-400 transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-slate-400 transition-colors">Terms</Link>
        </div>
      </div>
    </div>
  );
}
