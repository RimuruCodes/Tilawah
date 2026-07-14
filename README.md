# Tilawah — Quran Companion

A standalone React + Vite app for reading, listening to, and memorizing the
Quran, with recitation practice scored by real acoustic analysis of your
recording against the reference reciter's audio.

The free experience has **no backend** and previously ran on Base44; that
dependency has been removed. Everything below runs client-side. A minimal
backend (Supabase) exists only to support real, paid subscriptions — see
"Subscriptions" below — and is entirely optional: the app works exactly as
described here without it configured at all.

- **Accounts**: email/password accounts are stored in this browser's
  `localStorage`, with passwords hashed via PBKDF2-SHA-256 (600k
  iterations; accounts created under the older scheme are upgraded
  automatically on their next login). There's no server for this, so free accounts
  don't sync across devices/browsers, and there's no email-based password
  reset — see the "Forgot password" page for the honest local-only recovery
  flow. Subscribing adds a *separate*, optional identity (an emailed
  one-time code, no password) used only to verify entitlement across
  devices — it never touches or migrates the local account.
- **Your data** (recitation logs, streaks, memorization progress): stored
  locally per-account in `localStorage`.
- **Recitation scoring**: your recording is decoded in the browser (Web
  Audio API), compared against the actual reciter audio for that ayah
  (fetched from everyayah.com) using energy/pitch/timing analysis and
  Dynamic Time Warping — not a canned or AI-guessed score. If the
  reference audio can't be fetched, the app clearly labels the result as
  a "recording quality" score instead of pretending to compare it to a
  reciter.
- **Continuous Recitation accuracy**: whole-surah practice tracks which
  ayah you're on via manual "Next Ayah" taps, which can drift from your
  actual pace (a late tap, a missed tap). Rather than trusting that tap
  count outright when building the reference audio to score against, the
  app fetches a window of ayahs around it and picks whichever count's
  reference duration best matches how long the recording actually is —
  auto-correcting under/over-tapping before scoring, and telling you
  transparently if it did.
- **Word accuracy & basic Tajweed checks**: for single-ayah practice *and*
  continuous (whole-surah) recitation, the app runs real speech
  recognition entirely in-browser (via transformers.js/ONNX Runtime Web,
  downloaded once and cached, in a Web Worker so it never freezes the UI,
  with automatic WebGPU acceleration where supported). By default it uses
  the official timestamped browser build of multilingual Whisper base
  (`onnx-community/whisper-base_timestamped`), with a smaller
  general-purpose Whisper model available as a faster/lighter alternative
  in Settings. (A Quran-specific fine-tune would be better still, but as
  of 2026-07 no public browser conversion of
  `tarteel-ai/whisper-base-ar-quran` was exported with the attention
  outputs that word-level timestamps require — see
  `tools/qdat-eval/README.md` for the conversion recipe to self-host one.) It
  aligns the recognized words against the expected ayah text to flag
  skipped/misread words, and uses the recognized words' timestamps to run
  heuristic acoustic checks for Qalqalah (bounce), Ghunnah (nasal hold),
  Iqlab (noon→meem), Idgham-with-Ghunnah (nasal merge), Ikhfa (hidden
  noon), and Madd (elongation length) at their known positions in the
  Uthmani script. For Idgham/Ikhfa the check is explicitly partial: it
  verifies a nasal hold of roughly the right length at the right position,
  but cannot verify *which* consonant was produced (it can't tell a proper
  merge/hiding from a clearly-pronounced noon with a hum added) — the
  in-app glossary says the same. Idgham *without* ghunnah (before ل ر) is
  not checked at all, since it has no nasal hold to measure. Even with a
  Quran-tuned model, this remains a heuristic layer — treat the Tajweed
  detail as approximate guidance, not a formal ruling.
- **Data export/import**: since everything lives in `localStorage`,
  Settings includes a JSON export/import so you're not stuck if you clear
  browser storage or move to a new device.
- **Visual feedback**: after analyzing a recording, you get a waveform
  timeline of your recitation with clickable markers showing exactly
  where each Tajweed rule occurred and whether it passed or needs work.
- **Tajweed trends**: the Progress page tracks your Qalqalah/Ghunnah/Madd
  pass rate over time (cumulative), so you can see which specific rules
  are actually improving with practice, not just your overall score.
- **Practice mode**: within a surah, filter to just the ayahs containing
  a specific Tajweed rule (e.g. "show me every ayah with Qalqalah") for
  focused drilling, computed directly from the Uthmani script — no audio
  needed for this part.
- **Mic check**: an optional "Test your mic first" step before recording
  gives an instant read on whether your input level is too quiet, too
  loud/clipping, or silent — most of the scoring thresholds are already
  relative rather than absolute, so this catches the practical thing that
  actually matters most (a bad mic setup) rather than pretending to do
  heavy per-user recalibration that wouldn't change much.
- **Mic calibration (Settings)**: a one-time, 3-second silence recording
  that measures your device/room's actual background noise level and
  stores it locally. This is used to make voice-activity detection (what
  counts as "speech" vs "silence") more reliable specifically on noisy or
  quiet setups — the purely-relative thresholds elsewhere don't need this,
  but activity detection benefits from a real anchor. Optional; the app
  works fine without it.
- **In-app tutorial**: a short walkthrough (shown once automatically, and
  replayable via the "?" icon on the Home screen) explains in plain
  language what the acoustic score measures, what speech recognition and
  Tajweed checks do, the honest limits of both, and that everything stays
  on-device.
- **Iqlab detection**: alongside Qalqalah/Ghunnah/Madd, the app also
  detects Iqlab (noon sakinah/tanween before ب → hidden م sound) — the
  Uthmani script actually marks this explicitly with a small meem
  character above the letter, which the rule detector uses as the primary
  signal (falling back to checking whether ب actually follows, for text
  sources that omit that mark).
- **Installable / works offline**: the app is a PWA — install it from
  your browser's address bar, and after your first visit the app shell,
  previously-viewed Quran text, and previously-played reciter audio are
  cached for offline use. The ASR model itself (fetched from Hugging
  Face) is deliberately *not* force-precached on install, since it's
  large — it's cached normally by the browser once you use it.

## Testing

Pure logic (the DSP math, Tajweed rule detection, word-alignment/text
normalization) has an automated test suite:

```bash
npm run test
```

The browser-only pieces — microphone recording, `AudioContext` decoding,
the in-browser ASR model, and the recording UI's state machine — are
covered by a separate Playwright end-to-end suite that drives a real
Chromium with a fake microphone (a synthetic WAV fed in via
`--use-file-for-fake-audio-capture`):

```bash
npm run test:e2e:install   # once: downloads Chromium into node_modules
npm run test:e2e
```

It exercises the single-ayah recording flow, Continuous Recitation, the
file-upload path, and edge cases (silent, too-short, and corrupted audio
files), asserting the app reaches a scored result or a proper error state
without console errors or crashes. Notes:

- **It catches technical/UI bugs only — it does NOT validate scoring or
  Tajweed accuracy.** The fake "recitation" is synthetic audio, so the
  scores it produces are meaningless by design; whether real recitations
  are scored *correctly* still requires human testing by people who can
  judge recitation.
- First run needs internet (Quran text API, reciter audio, and a ~40MB
  ASR model download) and is slow; the model and audio are cached in a
  reused browser profile (`e2e/.browser-profile`) so later runs are much
  faster. Tests run serially against a production build on port 5173.

External runtime data (both suites and the app itself):
- **Quran text**: fetched at runtime from the Al Quran Cloud API.
- **Reciter audio**: fetched at runtime from everyayah.com.

## Run locally

```bash
npm install
npm run dev
```

## Testing on a phone

Mobile browsers only allow microphone access on `localhost` or a real
`https://` origin — a plain `http://192.168.x.x` LAN address will NOT get
mic permission. Use a Cloudflare quick tunnel (free, no account).

**Always phone-test against the static build (`test:phone`), not the dev
server.** The dev server's live-reload client force-reloads every
connected page — including the phone — whenever a source file is edited,
the server restarts, or a dependency gets re-optimized, which destroys an
in-progress recitation analysis and once masqueraded as an app bug.

```bash
# terminal 1 — build + serve the static production build on :5173
npm run test:phone

# terminal 2 (install once with: winget install Cloudflare.cloudflared)
cloudflared tunnel --url http://localhost:5173
```

cloudflared prints an `https://<random-words>.trycloudflare.com` URL —
open that on the phone. Notes:

- The URL is **temporary** and changes every cloudflared restart.
- `vite.config.js` allow-lists `.trycloudflare.com` for both the dev and
  preview servers (Vite 6 otherwise rejects unknown Host headers with
  "Blocked request").
- On `test:phone` the PWA service worker registers in prompt mode: if you
  rebuild while the phone tab is open it shows an "Update available"
  toast — it never silently reloads.
- Accounts/data live in each browser's localStorage — register a fresh
  account on the phone.

## Build

```bash
npm run build
npm run preview
```

## Subscriptions

Continuous "Recite all" mode and the Progress page's Tajweed Trends chart
require a subscription; everything else (Quran text/translation, audio
playback, single-ayah recitation analysis with Tajweed/ASR feedback,
memorization mode, streaks, milestones) stays free. Entitlement is verified server-side — the
client only ever *reads* subscription state, never sets it (see
`src/lib/entitlements.js` for the pure gating logic and
`src/lib/subscriptionApi.js`/`src/lib/SubscriptionContext.jsx` for how it's
fetched).

**Payments go through Stripe Checkout — TEST MODE ONLY for now.** Every
Edge Function refuses to start with a non-test key until the
`ALLOW_LIVE_STRIPE_KEYS` flag in
`supabase/functions/_shared/stripeClient.ts` is deliberately flipped
alongside swapping in live keys. (Cash App remains for voluntary
donations only — `src/lib/payments.js`.) The flow:

1. In the app, the subscriber picks a plan (monthly $4.99 / yearly $39.99
   placeholders — final pricing TBD) and verifies their email with a
   6-digit code (Supabase Auth OTP — this same step restores access on
   another device later; there's no separate "restore purchase" flow).
   The code email requires custom SMTP (the free-tier built-in provider
   can't customize templates): configured via Brevo in
   `supabase/config.toml` (`[auth.email.smtp]` + the code template at
   `supabase/templates/magic_link.html`, `otp_length = 6`), applied with
   `SMTP_PASSWORD=<brevo-key> npx supabase config push`. The SMTP key
   lives only in the gitignored `supabase/functions/.env`.
2. The `checkout` Edge Function creates a Stripe Checkout session and the
   browser goes to Stripe's hosted payment page (card details never touch
   the app). In test mode, pay with card `4242 4242 4242 4242`, any
   future expiry, any CVC.
3. Stripe calls the `stripe-webhook` function, which upserts the
   `subscriptions` row — the only writer of entitlement state. Stripe then
   sends the browser back to `/settings`, which re-reads the row and
   shows the active plan.
4. Renewals, card changes, plan switches, and cancellation all happen in
   the Stripe Billing Portal ("Manage subscription" in Settings, via the
   `billing-portal` function). A cancelled plan keeps access until the
   period the subscriber already paid for ends.

Backend setup (once): create a [Supabase](https://supabase.com) project,
then:

```bash
supabase link --project-ref <your-project-ref>
supabase db push                    # applies supabase/migrations/
supabase secrets set --env-file supabase/functions/.env
supabase functions deploy checkout stripe-webhook billing-portal
# stripe-webhook must be reachable WITHOUT a Supabase JWT:
supabase functions deploy stripe-webhook --no-verify-jwt
```

Then in the Stripe dashboard (Test mode ON): create the two prices with
`node scripts/create-stripe-plans.mjs` (see the script's comments), and
add a webhook endpoint pointing at
`https://<project-ref>.supabase.co/functions/v1/stripe-webhook` for the
events `checkout.session.completed`, `customer.subscription.updated`,
`customer.subscription.deleted` — its signing secret goes into
`supabase/functions/.env` as `STRIPE_WEBHOOK_SECRET` (re-run
`supabase secrets set` after). For local webhook testing,
`stripe listen --forward-to` that same URL works too.

Backend env vars live in `supabase/functions/.env` (gitignored):
`STRIPE_SECRET_KEY` (test key), `STRIPE_WEBHOOK_SECRET`,
`STRIPE_PRICE_ID_MONTHLY`, `STRIPE_PRICE_ID_YEARLY`, `APP_BASE_URL`.

Client env vars: copy `.env.example` to `.env.local` and fill in
`VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` from the Supabase project's
API settings (both are safe to expose in the built bundle).

Without any of this configured, the app runs exactly as it does today —
`isSubscriptionBackendConfigured` (`src/lib/supabaseClient.js`) short-circuits
every subscription check to "not subscribed" rather than throwing.

## Notes / limitations

- The scoring engine does real signal-processing (energy envelope, pitch
  via autocorrelation, DTW alignment) — it is *not* phoneme-level Tajweed
  grading. Detecting specific Tajweed rule violations would require a
  trained Arabic speech-recognition/forced-alignment model, which is out
  of scope for a client-side app.
- `MediaRecorder`'s output format is auto-negotiated per-browser
  (`src/lib/mediaUtils.js`), preferring `audio/webm;codecs=opus` and
  falling back to `audio/mp4`/`audio/ogg` where webm isn't supported
  (e.g. Safari).
- Reference audio is fetched cross-origin from everyayah.com. If that
  host ever blocks CORS or is unreachable, the app automatically falls
  back to a recording-quality-only score and says so in the UI.
