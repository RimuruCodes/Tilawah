import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// One warm, consistent "nothing here yet" block for the whole app, so empty
// screens share a tone (encouraging, always with a clear next step) and the
// app's card styling — instead of the ad-hoc one-liners each screen
// used to grow on its own.
//
// Pass an action as either a route (actionTo -> Link) or a handler
// (onAction -> button); both render the same accent pill.
const PILL =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-ink-accent text-ink-bg text-sm font-medium hover:brightness-110 transition-colors";

export default function EmptyState({ icon: Icon, title, message, actionLabel, actionTo, onAction, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-12 px-6 bg-ink-surface/30 rounded-2xl border border-ink-border/40 ${className}`}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-ink-surface-2/60 border border-ink-border/50 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-ink-accent/70" aria-hidden="true" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-ink-text">{title}</p>}
      {message && (
        <p className="text-xs text-ink-text-3 mt-1.5 max-w-xs mx-auto leading-relaxed">{message}</p>
      )}
      {actionLabel && (actionTo || onAction) && (
        <div className="mt-4">
          {actionTo ? (
            <Link to={actionTo} className={PILL}>
              {actionLabel}
            </Link>
          ) : (
            <button type="button" onClick={onAction} className={PILL}>
              {actionLabel}
            </button>
          )}
        </div>
      )}
    </motion.div>
  );
}
