// The app's primary navigation: a persistent bottom tab bar (mobile-first,
// like the daily-habit apps this UX borrows from). Rendered by the AppShell
// layout on every primary page; the surah reader hides it for an immersive
// reading/recitation view (it has its own back button).
import React from "react";
import { NavLink } from "react-router-dom";
import { Home, BookOpen, ScrollText, BarChart3, Settings2 } from "lucide-react";

const TABS = [
  { to: "/", label: "Home", icon: Home, end: true },
  { to: "/quran", label: "Quran", icon: BookOpen },
  { to: "/hadith", label: "Hadith", icon: ScrollText },
  { to: "/progress", label: "Progress", icon: BarChart3 },
  { to: "/settings", label: "Settings", icon: Settings2 },
];

export default function BottomTabBar() {
  return (
    <nav
      aria-label="Primary"
      className="fixed bottom-0 inset-x-0 z-40 border-t border-slate-800/80 bg-slate-950/90 backdrop-blur-lg pb-[env(safe-area-inset-bottom)]"
    >
      <div className="max-w-2xl mx-auto grid grid-cols-5">
        {TABS.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center gap-1 py-2.5 text-[10px] font-medium transition-colors ${
                isActive ? "text-emerald-400" : "text-slate-500 hover:text-slate-300"
              }`
            }
          >
            {({ isActive }) => (
              <>
                <Icon className="w-5 h-5" strokeWidth={isActive ? 2.4 : 2} />
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
