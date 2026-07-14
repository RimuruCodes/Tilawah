# Accessibility — what was checked, what wasn't

This app tries to be honest about the limits of its recitation analysis; the
same honesty applies to its accessibility. This is a real first pass, not a
certified audit. Below is exactly what was verified and what still isn't.

## How it was tested

- **Automated:** `e2e/a11y-check.spec.js` runs axe-core (WCAG 2.0/2.1 A + AA
  rule tags) against the recording dialogs and six key pages (Home + bottom
  tabs, Quran index, Surah reader, Hadith, Settings, Privacy). It fails CI on
  any **serious or critical** violation. As of the last run: **0 serious/
  critical violations** on all of the above.
- **Keyboard:** the same spec drives the full single-ayah recording flow
  (open → record → stop → analyze → result → close) with **Tab/Enter/Escape
  only**, no mouse, and asserts the result is announced via a live region and
  that Escape closes the dialog (no keyboard trap).
- **Contrast:** muted helper text (Tailwind `text-slate-500`/`-600`) was
  measured against every slate background the app uses; both were lifted to
  `#8290a5`, the dimmest gray that clears 4.5:1 everywhere (worst case: a
  `slate-800` card at 4.52:1). Filled primary buttons (emerald/red) were
  switched from white to near-black text (e.g. white-on-emerald-500 was
  2.54:1; black-on-emerald-500 is 7.95:1).

## What was fixed in this pass

**Recording flow (the priority):**
- Both recording dialogs now expose an accessible name via `DialogTitle`/
  `DialogDescription` (previously bare headings — screen readers announced an
  unnamed dialog).
- A visually-hidden `role="status"` live region announces each flow
  transition and the final score, so a screen-reader user hears the outcome
  without the whole result view being re-read.
- Icon-only controls (play/pause, discard, close, hide, per-ayah record,
  reciter dropdown, compare-playback focus toggles) have real `aria-label`s;
  the record/stop buttons already did.
- The ayah-count stepper and the Recalculate count input have explicit
  labels; the low-confidence badge exposes its reason to assistive tech
  instead of only as a hover `title`.
- Arabic text is marked `lang="ar"` (and surrounding UI `lang="en"`) so a
  screen reader switches pronunciation rules; the decorative waveform SVG is
  `aria-hidden` because every rule marker it shows is also presented as text.
- A duplicate custom close button that overlapped the dialog's real one was
  removed from the continuous flow.

**App-wide:**
- Audio-player sliders (seek, volume) and the reciter `SelectTrigger` now have
  accessible names; the Settings toggles (Tajweed, pace-match, Ramadan) label
  their visually-hidden checkboxes; the debug-log scroll region is keyboard-
  focusable.
- Contrast fixes above apply everywhere, not just the recording flow.

## What is NOT covered / known gaps

- **No human screen-reader session yet.** Everything above is axe + scripted
  keyboard checks. A real pass with **VoiceOver (iOS/Mac)** and **NVDA
  (Windows)** is still needed — automated tools catch missing names and
  contrast, but not awkward reading order, verbose announcements, or a live
  region that fires too often/rarely. This is the single biggest gap.
- **Pages not in the automated scan:** Login, Register, Progress, Donate,
  About, Contact, Terms, and the calibration/support/upgrade modals were
  improved incidentally (shared components, the button-contrast sweep) but are
  not yet asserted against axe.
- **`prefers-reduced-motion` is not honored.** The app animates page and
  dialog transitions unconditionally; a user who asks the OS to reduce motion
  still gets them.
- **Focus-visible styling is inconsistent.** Radix primitives have focus
  rings; some custom buttons rely on the browser default outline, which is
  faint on the dark theme.
- **Arabic script size/RTL** hasn't been checked with a screen magnifier or
  for reflow at 200% zoom.
- **The waveform/pitch visualizations convey information visually only.** The
  underlying scores and rule verdicts are all available as text, so nothing is
  lost, but the visual timeline itself isn't described.

## To re-run

```
npm run test:e2e -- a11y-check.spec.js
```

Keep the "0 serious/critical" bar green; when adding UI, prefer real buttons/
labels over `div`+`onClick`, give every icon-only control an `aria-label`, and
check contrast against `#8290a5` as the muted-text floor.
