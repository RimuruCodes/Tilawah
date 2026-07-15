import React from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";

// One warm, consistent "nothing here yet" block for the whole app, so empty
// screens share a tone (encouraging, always with a clear next step) and the
// app's slate-card styling — instead of the ad-hoc one-liners each screen
// used to grow on its own.
//
// Pass an action as either a route (actionTo -> Link) or a handler
// (onAction -> button); both render the same emerald pill.
const PILL =
  "inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 transition-colors";

export default function EmptyState({ icon: Icon, title, message, actionLabel, actionTo, onAction, className = "" }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`text-center py-12 px-6 bg-slate-900/30 rounded-2xl border border-slate-700/20 ${className}`}
    >
      {Icon && (
        <div className="w-12 h-12 rounded-2xl bg-slate-800/60 border border-slate-700/30 flex items-center justify-center mx-auto mb-4">
          <Icon className="w-6 h-6 text-emerald-400/70" aria-hidden="true" />
        </div>
      )}
      {title && <p className="text-sm font-medium text-white">{title}</p>}
      {message && (
        <p className="text-xs text-slate-500 mt-1.5 max-w-xs mx-auto leading-relaxed">{message}</p>
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
