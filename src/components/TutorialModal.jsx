import React, { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Mic, Waves, ListChecks, ShieldCheck, HardDrive, ArrowRight, ArrowLeft, X, Languages } from "lucide-react";
import { ARABIC_COMFORT_LEVELS, getArabicComfort, setArabicComfort } from "@/lib/arabicComfort";

const SLIDES = [
  {
    icon: Mic,
    title: "Welcome to Quran Companion",
    body: "This app listens to your actual recitation and gives you real, measured feedback — not a guess. Here's exactly what it does and doesn't do, in plain terms.",
  },
  {
    icon: Waves,
    title: "Your score is a real audio comparison",
    body: "When you record an ayah, the app decodes your recording and the reference reciter's actual audio for that verse, then compares them: pacing, loudness pattern, and pitch contour. The score comes from that comparison — it's signal analysis, not an AI making up a number.",
  },
  {
    icon: ListChecks,
    title: "Speech recognition & Tajweed checks",
    body: "For single-ayah practice, the app also runs real speech recognition (in your browser) to check whether your words matched the ayah, and checks the timing of 4 specific Tajweed rules where they occur in the text:",
    list: [
      { label: "Qalqalah", desc: "a little bounce on ق ط ب ج د with sukoon" },
      { label: "Ghunnah", desc: "a nasal hold on ن/م with shaddah" },
      { label: "Iqlab", desc: "noon/tanween before ب becomes a hidden م" },
      { label: "Madd", desc: "elongating a vowel for the right length" },
    ],
  },
  {
    icon: ShieldCheck,
    title: "Be aware of the honest limits",
    body: "This is heuristic acoustic analysis, not a certified Tajweed teacher and not a religious ruling. The speech recognition model is general-purpose Arabic (or a Quran-tuned variant if configured) — it can misread words, especially unusual pronunciations. Treat every result as a helpful pointer to double-check, not a verdict.",
  },
  {
    icon: HardDrive,
    title: "Everything stays on your device",
    body: "There's no server. Your account, recordings' results, and progress are stored only in this browser. You can back them up anytime from Settings \u2192 Data if you want a copy.",
  },
  {
    icon: Languages,
    title: "How comfortable are you reading Arabic script?",
    body: "This just picks friendlier defaults \u2014 translation visibility, and which reading aids we point you to. You can change it anytime in Settings.",
    comfortPicker: true,
  },
];

const SEEN_KEY_PREFIX = "qc_tutorial_seen_";

export function hasSeenTutorial(userId) {
  return localStorage.getItem(SEEN_KEY_PREFIX + (userId || "anon")) === "1";
}

export function markTutorialSeen(userId) {
  localStorage.setItem(SEEN_KEY_PREFIX + (userId || "anon"), "1");
}

export default function TutorialModal({ open, onClose, userId }) {
  const [step, setStep] = useState(0);
  const [comfort, setComfort] = useState(getArabicComfort());
  const isLast = step === SLIDES.length - 1;
  const slide = SLIDES[step];

  const pickComfort = (level) => {
    setArabicComfort(level);
    setComfort(level);
  };

  const finish = () => {
    markTutorialSeen(userId);
    setStep(0);
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={finish}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-md p-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <button onClick={finish} className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-500 hover:text-white hover:bg-slate-800 transition-colors">
            <X className="w-4 h-4" />
          </button>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 12 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -12 }}
              transition={{ duration: 0.2 }}
              className="space-y-4"
            >
              <div className="w-12 h-12 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
                <slide.icon className="w-6 h-6 text-emerald-400" />
              </div>
              <h3 className="text-lg font-semibold text-white">{slide.title}</h3>
              <p className="text-sm text-slate-400 leading-relaxed">{slide.body}</p>
              {slide.list && (
                <div className="space-y-1.5 pt-1">
                  {slide.list.map((item) => (
                    <div key={item.label} className="flex items-start gap-2 bg-slate-800/40 rounded-lg p-2.5">
                      <span className="text-xs font-semibold text-emerald-400 w-16 flex-shrink-0">{item.label}</span>
                      <span className="text-xs text-slate-400">{item.desc}</span>
                    </div>
                  ))}
                </div>
              )}
              {slide.comfortPicker && (
                <div className="space-y-2 pt-1">
                  {ARABIC_COMFORT_LEVELS.map((level) => (
                    <button
                      key={level.id}
                      onClick={() => pickComfort(level.id)}
                      className={`w-full text-left p-3 rounded-xl border transition-all ${
                        comfort === level.id
                          ? "bg-emerald-500/10 border-emerald-500/40"
                          : "bg-slate-800/40 border-slate-700/30 hover:border-slate-600/40"
                      }`}
                    >
                      <p className="text-sm font-medium text-white">{level.label}</p>
                      <p className="text-xs text-slate-500">{level.description}</p>
                    </button>
                  ))}
                  {comfort === "beginner" && (
                    <p className="text-[11px] text-slate-500">
                      Tip: in the reader, open an ayah's <span className="text-emerald-400">Words</span> panel for
                      per-word meanings and transliteration — and a quick mic calibration in Settings makes your
                      first scores more reliable.
                    </p>
                  )}
                </div>
              )}
            </motion.div>
          </AnimatePresence>

          <div className="flex items-center justify-between pt-2">
            <div className="flex gap-1.5">
              {SLIDES.map((_, i) => (
                <span key={i} className={`w-1.5 h-1.5 rounded-full transition-colors ${i === step ? "bg-emerald-400" : "bg-slate-700"}`} />
              ))}
            </div>
            <div className="flex gap-2">
              {step > 0 && (
                <button
                  onClick={() => setStep((s) => s - 1)}
                  className="px-3 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors flex items-center gap-1"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Back
                </button>
              )}
              <button
                onClick={() => (isLast ? finish() : setStep((s) => s + 1))}
                className="px-4 py-2 rounded-xl bg-emerald-500 text-white text-sm font-medium hover:bg-emerald-400 transition-colors flex items-center gap-1"
              >
                {isLast ? "Got it" : "Next"}
                {!isLast && <ArrowRight className="w-3.5 h-3.5" />}
              </button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
