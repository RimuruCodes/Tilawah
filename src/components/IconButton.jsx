const VARIANTS = {
  neutral: "bg-ink-surface-2/50 text-ink-text-2 hover:text-ink-text hover:bg-ink-surface-2 border border-ink-border/60",
  accent: "bg-ink-gold/10 text-ink-gold hover:bg-ink-gold/20 border border-ink-gold/20",
  ghost: "text-ink-text-2 hover:text-ink-text",
};

const ACTIVE_COLORS = {
  emerald: "bg-ink-accent/20 text-ink-accent border border-ink-accent/20",
  amber: "bg-ink-gold/20 text-ink-gold border border-ink-gold/20",
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
