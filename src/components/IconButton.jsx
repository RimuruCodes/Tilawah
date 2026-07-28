const VARIANTS = {
  neutral: "bg-slate-800/50 text-slate-400 hover:text-white hover:bg-slate-800 border border-slate-700/30",
  accent: "bg-amber-500/10 text-amber-400 hover:bg-amber-500/20 border border-amber-500/20",
  ghost: "text-slate-400 hover:text-white",
};

const ACTIVE_COLORS = {
  emerald: "bg-emerald-500/20 text-emerald-400 border border-emerald-500/20",
  amber: "bg-amber-500/20 text-amber-400 border border-amber-500/20",
};

// For icon-only actions (help, back, toggles). Labeled action buttons like
// "Recite All" or the Donate/Support ask are out of scope — see SupportButton.
export default function IconButton({
  icon: Icon,
  label,
  onClick,
  variant = "neutral",
  pressed,
  activeColor = "emerald",
  className = "",
}) {
  const style = pressed ? ACTIVE_COLORS[activeColor] : VARIANTS[variant];
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      aria-pressed={pressed}
      className={`p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-xl transition-colors ${style} ${className}`}
    >
      <Icon className="w-5 h-5" aria-hidden="true" />
    </button>
  );
}
