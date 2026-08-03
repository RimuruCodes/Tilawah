import React, { useEffect, useMemo } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import { Sparkles } from "lucide-react";

// A restrained celebration for a personal best or a streak milestone — a
// soft glow, a gentle drift of a few sparkles, and a small pill. Deliberately
// calm (this is a Quran app, not a game): no bursts, no sound, muted golds
// and greens. Non-blocking (pointer-events-none) and auto-dismisses; honours
// prefers-reduced-motion by dropping the particles and just showing the pill.
export default function CelebrationOverlay({ show, title, subtitle, onDone, duration = 2600 }) {
  const reduce = useReducedMotion();

  useEffect(() => {
    if (!show) return;
    const t = setTimeout(() => onDone?.(), duration);
    return () => clearTimeout(t);
  }, [show, duration, onDone]);

  // Stable per-appearance particle field so it doesn't reshuffle on re-render.
  const particles = useMemo(
    () =>
      Array.from({ length: 10 }, (_, i) => ({
        id: i,
        left: 8 + Math.random() * 84, // %
        delay: Math.random() * 0.5,
        drift: (Math.random() - 0.5) * 40, // px
        size: 4 + Math.random() * 5,
        gold: Math.random() > 0.5,
      })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [show]
  );

  return (
    <AnimatePresence>
      {show && (
        <motion.div
          className="pointer-events-none absolute inset-0 z-40 flex items-start justify-center overflow-hidden"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          aria-hidden="true"
        >
          {/* Soft radial glow */}
          <motion.div
            className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-ink-accent/15 to-transparent"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0.6] }}
            transition={{ duration: 1.2 }}
          />

          {/* Sparkles (skipped under reduced motion) */}
          {!reduce &&
            particles.map((p) => (
              <motion.span
                key={p.id}
                className={`absolute rounded-full ${p.gold ? "bg-ink-gold/80" : "bg-ink-accent/80"}`}
                style={{ left: `${p.left}%`, top: "18%", width: p.size, height: p.size }}
                initial={{ opacity: 0, y: 10, scale: 0.6 }}
                animate={{ opacity: [0, 1, 0], y: -70, x: p.drift, scale: 1 }}
                transition={{ duration: 1.8, delay: p.delay, ease: "easeOut" }}
              />
            ))}

          {/* The message pill */}
          <motion.div
            className="mt-10 flex items-center gap-2 rounded-full bg-ink-surface/90 border border-ink-accent/30 px-4 py-2 shadow-ink"
            initial={{ opacity: 0, y: -12, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -8 }}
            transition={{ type: "spring", stiffness: 320, damping: 22 }}
          >
            <Sparkles className="w-4 h-4 text-ink-gold flex-shrink-0" />
            <div className="text-left">
              <p className="text-sm font-semibold text-ink-text leading-tight">{title}</p>
              {subtitle && <p className="text-[11px] text-ink-text-2 leading-tight">{subtitle}</p>}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// Picks the celebration copy for a persist receipt, or null if there's
// nothing to celebrate. Streak milestones take the headline (rarer, bigger);
// a personal best that lands at the same time rides along in the subtitle.
export function celebrationFor(receipt) {
  if (!receipt) return null;
  const { personalBest, streakMilestone } = receipt;
  if (streakMilestone) {
    return {
      title: `${streakMilestone}-day streak!`,
      subtitle: personalBest ? "And a new personal best — mashaAllah." : "Keep it going, mashaAllah.",
    };
  }
  if (personalBest) {
    return { title: "New personal best!", subtitle: "Your best recitation of this ayah yet." };
  }
  return null;
}
