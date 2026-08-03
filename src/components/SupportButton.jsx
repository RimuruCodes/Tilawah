import { Heart } from "lucide-react";

// A donation ask deserves to be genuinely visible, not styled like a plain
// icon button just because it happens to open the same modal as one.
export default function SupportButton({ onClick, className = "" }) {
  return (
    <button
      type="button"
      onClick={onClick}
      title="Support the App"
      aria-label="Support the App"
      className={`flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink-gold text-ink-bg font-semibold text-sm hover:brightness-110 transition-colors shadow-ink ${className}`}
    >
      <Heart className="w-4 h-4" />
      Donate
    </button>
  );
}
