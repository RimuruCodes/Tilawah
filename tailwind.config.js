/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: ["class"],
    content: ["./index.html", "./src/**/*.{ts,tsx,js,jsx}"],
  theme: {
  	extend: {
  		borderRadius: {
  			lg: 'var(--radius)',
  			md: 'calc(var(--radius) - 2px)',
  			sm: 'calc(var(--radius) - 4px)'
  		},
  		colors: {
  			background: 'hsl(var(--background))',
  			foreground: 'hsl(var(--foreground))',
  			card: {
  				DEFAULT: 'hsl(var(--card))',
  				foreground: 'hsl(var(--card-foreground))'
  			},
  			popover: {
  				DEFAULT: 'hsl(var(--popover))',
  				foreground: 'hsl(var(--popover-foreground))'
  			},
  			primary: {
  				DEFAULT: 'hsl(var(--primary))',
  				foreground: 'hsl(var(--primary-foreground))'
  			},
  			secondary: {
  				DEFAULT: 'hsl(var(--secondary))',
  				foreground: 'hsl(var(--secondary-foreground))'
  			},
  			muted: {
  				DEFAULT: 'hsl(var(--muted))',
  				foreground: 'hsl(var(--muted-foreground))'
  			},
  			accent: {
  				DEFAULT: 'hsl(var(--accent))',
  				foreground: 'hsl(var(--accent-foreground))'
  			},
  			destructive: {
  				DEFAULT: 'hsl(var(--destructive))',
  				foreground: 'hsl(var(--destructive-foreground))'
  			},
  			border: 'hsl(var(--border))',
  			input: 'hsl(var(--input))',
  			ring: 'hsl(var(--ring))',
  			chart: {
  				'1': 'hsl(var(--chart-1))',
  				'2': 'hsl(var(--chart-2))',
  				'3': 'hsl(var(--chart-3))',
  				'4': 'hsl(var(--chart-4))',
  				'5': 'hsl(var(--chart-5))'
  			},
  			sidebar: {
  				DEFAULT: 'hsl(var(--sidebar-background))',
  				foreground: 'hsl(var(--sidebar-foreground))',
  				primary: 'hsl(var(--sidebar-primary))',
  				'primary-foreground': 'hsl(var(--sidebar-primary-foreground))',
  				accent: 'hsl(var(--sidebar-accent))',
  				'accent-foreground': 'hsl(var(--sidebar-accent-foreground))',
  				border: 'hsl(var(--sidebar-border))',
  				ring: 'hsl(var(--sidebar-ring))'
  			},
  			// "Paper & Ink" semantic theme tokens (light/dark toggle) -- a
  			// SEPARATE, deliberately non-colliding namespace from the shadcn
  			// scaffold colors above (background/primary/border/etc.), which
  			// real shadcn/ui primitives (Button, Dialog, AlertDialog, Badge,
  			// Checkbox...) already use internally and which this app's own
  			// components override with explicit hardcoded classes rather than
  			// relying on. Redefining `primary`/`border`/`background` directly
  			// would risk silently reskinning those primitives in ways nothing
  			// here has tested for. `ink-*` is new, so it can only ever affect
  			// code that explicitly opts in during the Phase 3+ migration.
  			// Each uses the `hsl(var(...) / <alpha-value>)` pattern (same
  			// convention already used above) so Tailwind's opacity modifiers
  			// (e.g. `bg-ink-accent/10`) work correctly against them.
  			ink: {
  				bg: 'hsl(var(--ink-bg-primary) / <alpha-value>)',
  				surface: 'hsl(var(--ink-bg-surface) / <alpha-value>)',
  				'surface-2': 'hsl(var(--ink-bg-surface-secondary) / <alpha-value>)',
  				text: 'hsl(var(--ink-text-primary) / <alpha-value>)',
  				'text-2': 'hsl(var(--ink-text-secondary) / <alpha-value>)',
  				'text-3': 'hsl(var(--ink-text-tertiary) / <alpha-value>)',
  				border: 'hsl(var(--ink-border) / <alpha-value>)',
  				accent: 'hsl(var(--ink-accent-primary) / <alpha-value>)',
  				'accent-soft': 'hsl(var(--ink-accent-primary-soft) / <alpha-value>)',
  				gold: 'hsl(var(--ink-accent-gold) / <alpha-value>)',
  				success: 'hsl(var(--ink-success) / <alpha-value>)',
  				warning: 'hsl(var(--ink-warning) / <alpha-value>)',
  			danger: 'hsl(var(--ink-danger) / <alpha-value>)'
  			},
  			// Per-Tajweed-rule categorical colors (filter chips in SurahReader,
  			// chart lines in Progress) -- a SEPARATE small palette from the 4
  			// semantic ink-* accents above, because 6 mutually-distinguishable
  			// rule categories can't be told apart through only 4 tokens.
  			// Dark-theme values are the original Tailwind -400 shades
  			// (unchanged, already tuned for a near-black background);
  			// light-theme values are measured, darker replacements -- the
  			// -400 shades measured 1.6-2.6:1 against the new cream
  			// backgrounds (nowhere near WCAG's 4.5:1), so this needed real
  			// per-theme values, not the same hex reused. `madd` has no
  			// separate token: its dark-mode color already IS
  			// --ink-accent-primary's dark value (both are emerald-400), so
  			// it reuses `ink-accent` directly instead of duplicating it.
  			rule: {
  				qalqalah: 'hsl(var(--rule-qalqalah) / <alpha-value>)',
  				ghunnah: 'hsl(var(--rule-ghunnah) / <alpha-value>)',
  				iqlab: 'hsl(var(--rule-iqlab) / <alpha-value>)',
  				idgham: 'hsl(var(--rule-idgham) / <alpha-value>)',
  				ikhfa: 'hsl(var(--rule-ikhfa) / <alpha-value>)'
  			}
  		},
  		boxShadow: {
  			// Generic themed shadow -- NOT a replacement for the dark-mode
  			// glowing colored shadows that used to exist on things like the
  			// recording score circles; Phase 4 replaced those outright with
  			// this flat shadow rather than giving them per-theme glow colors.
  			// This is for plain card/surface elevation.
  			ink: '0 2px 8px 0 var(--ink-shadow)'
  		},
  		fontFamily: {
  			heading: ['var(--font-heading)'],
  			body: ['var(--font-body)'],
  			display: ['var(--font-display)'],
  			mono: ['var(--font-mono)']
  		},
  		keyframes: {
  			'accordion-down': {
  				from: {
  					height: '0'
  				},
  				to: {
  					height: 'var(--radix-accordion-content-height)'
  				}
  			},
  			'accordion-up': {
  				from: {
  					height: 'var(--radix-accordion-content-height)'
  				},
  				to: {
  					height: '0'
  				}
  			}
  		},
  		animation: {
  			'accordion-down': 'accordion-down 0.2s ease-out',
  			'accordion-up': 'accordion-up 0.2s ease-out'
  		}
  	}
  },
  plugins: [require("tailwindcss-animate")],
}
