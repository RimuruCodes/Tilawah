# Tilawah — Privacy Policy & Terms of Service

**Effective date: July 16, 2026**

> **Maintainer note (not part of the published text):** this file mirrors what
> `src/pages/Privacy.jsx` and `src/pages/Terms.jsx` render. Every factual claim
> was verified against the code on 2026-07-16. **If the data handling changes,
> both the pages and this file must change with it.** In particular:
> - Section 2/4 depend on accounts being Supabase Auth (email + password) with
>   practice data synced via the `user_data` table (`cloudAuth.js`, `dataSync.js`,
>   migration `0002`); voice is NOT synced.
> - Section 3 depends on ASR/DSP staying on-device (`recitationService.js`, `asrWorker.js`).
> - Section 11 depends on `supabase/functions/delete-account` genuinely cancelling
>   Stripe, deleting the Supabase subscription row, and deleting the auth user (which
>   cascade-deletes `user_data`). Do not weaken that function without weakening
>   section 11 to match.
>
> **Unresolved placeholders are marked `[LIKE THIS]` and are real business/legal
> decisions — they were deliberately left rather than invented.** See the summary
> at the end.

---

## PART ONE: PRIVACY POLICY

### 1. Overview

This Privacy Policy explains what information Tilawah ("the app," "we," "our" —
meaning Akeem Adekunle, an individual doing business as Tilawah) collects, how it's
used, and what control you have over it. Tilawah is a Quran
recitation practice app with two tiers of use — a free tier that runs entirely on
your own device, and a paid subscription tier that involves a real backend
account. These two tiers handle your data very differently, and this policy
describes both honestly and separately rather than making one blanket claim that
wouldn't be true for everyone.

### 2. Your account and practice data sync across your devices

To use the app you create an account with our backend provider (Supabase), using
an email address and a password. Because your account lives on the server, you can
sign in on any device and pick up where you left off. Your practice data — your
recitation history, your streaks, your memorization progress, your recitation-plan
progress, and any "this result seems off" feedback reports you file (text only) —
is kept on your device for offline use **and** backed up to your account so it
follows you to your other devices.

Some things stay on your device only and are never sent to us: your recorded voice
(see the next section), a local technical diagnostic log, and app
settings/preferences. If you sign out, or use the app without logging in, that
unsynced data remains only on the device where it was created.

### 3. Your voice recordings are never uploaded, on either tier

When you record yourself reciting, that audio is analyzed entirely on your device
— the acoustic scoring and the speech-recognition-based Tajweed analysis both run
locally, in your browser. At no point does your recorded voice get sent to us, to
any server, or to any third party. This is true whether you are a free user or a
paying subscriber; a subscription changes how your account is managed, not how
your voice is handled.

### 4. How your account works

Your account is created and managed by our backend provider, Supabase, using your
email address and a password. Your email address is stored so we can identify your
account, let you sign in across devices, send you sign-in and password-reset
messages, and (if you subscribe) tie your subscription to you. Your password is
never stored in readable form — Supabase keeps only a securely hashed version of
it, from which the original password cannot be recovered.

Access to your account and your synced data is protected by your password and by
database access rules that let only you (and, for subscriptions, our payment
webhook) read your records. As with any account-based service, keep your password
private and use a strong one.

### 5. Display name

You may choose a display name when you register, shown in the app instead of your
email address. If you don't choose one, a generic default is used. This name is
stored with your account and is not derived from your email address.

### 6. What happens if you subscribe

If you subscribe, your existing account gains a subscription record stored with our
backend provider. That record contains your plan, its status, the renewal date, and
the Stripe customer and subscription identifiers that link your account to the
payment. Access rules ensure only you (and our payment webhook) can read your
record.

Subscribing does not change how your practice data or voice are handled: your voice
recordings are still never uploaded, and your practice data is synced the same way
it is for any account (section 2). A subscription only adds the entitlement record
described above.

### 7. Payment information

Subscription payments are handled by **Stripe**, a third-party payment processor.
We do not receive, see, or store your card details, billing address, or other
payment credentials — these are handled entirely within Stripe's own secure
systems, in accordance with Stripe's privacy practices and industry payment
security standards. We receive confirmation of your subscription status (active,
cancelled, renewal date) and the Stripe identifiers described in section 6 — never
your payment details themselves.

Separately, voluntary **donations** are optional, grant no features, and require
no account. Depending on which option you choose in the app, a donation is made
either through Stripe's hosted payment page or through **Cash App**, which opens
in a new tab and is governed by Cash App's own terms and privacy policy. We
receive no personal information about donors beyond what the chosen provider shows
us.

### 8. What we do not do

We do not run advertising, do not use third-party analytics or tracking scripts,
do not sell or share your data with data brokers, and do not build advertising
profiles from your usage. The only third parties involved in the app's operation
are those genuinely necessary to provide its features:

- **Stripe** — subscription payments and the billing portal.
- **Supabase** — your account (email + password), your synced practice data, and
  subscription/entitlement storage.
- **Brevo** — email delivery. It transmits the sign-in and password-reset messages
  we email you, and therefore processes your email address in transit.
- **Cloudflare** — hosting for the app itself.
- **Hugging Face** — where your browser downloads the speech-recognition model
  that then runs locally on your device.
- **Cash App** — only if you choose it for a voluntary donation.
- The public content sources listed in section 9.

### 9. Third-party content sources

To display Quran text, translations, reciter audio, tafsir, and hadith content,
the app fetches data at runtime from established public sources: Quran text from
alquran.cloud, reciter audio from everyayah.com, hadith and tafsir text from the
jsDelivr CDN, and word-by-word meanings from qurancdn.com. These requests may be
visible to those services as ordinary web traffic (for example, your device's IP
address requesting a specific ayah's audio file) in the same way any website
request works, but no personal account information is sent alongside these
requests.

### 10. Local storage and how to clear it

The app uses your browser's local storage to keep a working copy of your data,
preferences, and sign-in session on your device, so it runs quickly and works
offline. This is not a tracking cookie and is not used to identify you across other
websites — it functions purely as this app's own private storage. Clearing it
through your browser removes the on-device copy; because your practice data is also
backed up to your account, signing in again restores it. Preferences and the local
diagnostic log, which are not synced, would not be restored.

### 11. Exporting and deleting your data

Settings includes a data export feature that lets you download a copy of your
recitation history, streaks, and progress as a file, and an import feature to
restore it later.

Deleting your account permanently deletes your backend account, your synced
practice data, and (if you subscribe) **cancels your Stripe subscription and
removes your subscription record** — these are removed, not merely marked inactive
— and also wipes the copy of your data stored on the device you delete from. If the
server-side step fails for any reason, the app stops and tells you rather than
continuing, so you are never left still being billed with no account to show for
it. Once deletion completes, we cannot recover your data for you afterward.

Honest limit: Stripe retains the underlying payment and transaction records for
its own accounting and legal-compliance obligations. We cancel your subscription
and remove your link to us; we cannot erase Stripe's financial history, and we
don't claim to.

### 12. Security

We take reasonable, genuine measures to protect the data described above: your
password is stored only as a secure hash by our backend provider, access to your
account and synced data is restricted by database rules to you alone, and we rely
on established, security-reviewed providers (Supabase, Stripe) for account, data,
and payment handling. That said, no system is perfectly secure, and data stored on
your own device is only as secure as that device itself; we encourage you to use a
strong, unique password, a device passcode, and to keep your browser and operating
system updated.

### 13. Children's privacy

Tilawah is intended for users 13 and older, and we do not knowingly collect personal
information from children under 13. Creating a subscription account requires
confirming that you are at least 13 years old, and the app blocks account creation
for anyone who indicates they are under 13. If we learn that a child under 13 has
provided personal information through the subscription/backend system, we will take
steps to delete it. If you are a parent or guardian and believe your child has
provided us with personal information despite this, please contact us at
`alaminoyeyemi64@gmail.com` so we can address it. We encourage parental involvement
in any subscription or payment activity related to this app, consistent with how the
app's own subscription system is designed to require an adult account holder for
payment purposes.

### 14. International users

Our backend service providers process and store data in the United States. Your
subscriber account and subscription record are stored in our Supabase project's
US West region (Oregon, `us-west-2`), and subscription payments are processed by
Stripe, a United States-based company. If you access the app from outside the
United States, the limited account and subscription information described in this
policy will be transferred to and stored in the United States, which may have
data-protection laws that differ from those of your own country. By creating a
subscription account, you consent to this transfer. Your recitation recordings
and practice data are never transmitted at all and remain on your own device
regardless of where you are.

### 15. Changes to this policy

We may update this Privacy Policy from time to time as the app changes. If we make
material changes, we will make a reasonable effort to note this within the app
itself. Continued use of the app after an update constitutes acceptance of the
revised policy. We encourage you to review this page periodically.

Questions or requests: `alaminoyeyemi64@gmail.com`.

Operator: Akeem Adekunle (an individual/sole proprietor).

---

## PART TWO: TERMS OF SERVICE

### 16. Acceptance of these terms

In these Terms, "we," "us," and "our" mean Akeem Adekunle, an individual doing
business as Tilawah. By downloading, accessing, or using Tilawah, you agree to these
Terms of Service. If you do not agree, please do not use the app. If you are using
the app on behalf of a minor, or are a minor using the app under a parent or
guardian's supervision, these terms apply to that arrangement as described further
below.

### 17. What the app is

Tilawah offers free Quran practice features such as full Quran text and
translations, reciter audio playback, single-ayah scoring, Tajweed checks,
authentic-hadith references, and local progress tracking. A paid subscription is
required for whole-surah "Recite All" practice and Tajweed Trends charts.

### 18. Eligibility and account responsibility

When you create a subscription account, you must confirm that you are at least 13
years old and actively agree to these Terms of Service and the Privacy Policy before
the account is created. If you are under the age required to enter into binding
agreements or hold a payment account in your jurisdiction, any subscription purchase
must be made and managed by a parent or legal guardian acting as the account holder;
the app's subscription system is intentionally designed to require this. You are
responsible for maintaining the security of your local device and any account
credentials you create, and for all activity that occurs under your account.

### 19. Subscriptions and renewals

If you subscribe, your email and subscription record are stored with the backend
provider. The record includes your plan, subscription status, renewal date, Stripe
customer ID, and Stripe subscription ID. These identifiers connect your account to
payment processing. Only you and the payment webhook can read this record. Your
recitation data, voice recordings, and practice history stay on your device. Paid
subscriptions are billed through Stripe on a recurring basis. You may choose monthly
or yearly billing at signup. Subscriptions renew automatically at the end of each
billing period unless you cancel before the renewal date. You can view your plan and
renewal date in Settings, which also links to Stripe's account portal. You may cancel
at any time. Cancellation stops future renewals, but you keep access to paid features
until the end of the paid period.

If you are an EU or UK consumer and you choose immediate access to paid digital
features, you expressly request that access begin immediately — which you confirm at
checkout by checking the immediate-access consent box before payment. You acknowledge
that once access begins, you lose any statutory right of withdrawal or cancellation
for the digital content or the current billing period, to the extent that law allows.

### 20. Refund Policy and Right of Withdrawal

All subscription charges are non-refundable, except as required by applicable law.
EU/UK Users: By subscribing to Tilawah, you expressly consent to the immediate
delivery of the digital content and paid features. You acknowledge and agree that by
accessing these features immediately, you lose your statutory 14-day right of
withdrawal for the current billing period. If you cancel your subscription, the
cancellation will take effect at the end of your current paid term, and no prorated
refunds will be issued.

### 21. Changes to pricing or plans

Pricing and included features may change over time. The app will try to notify
existing subscribers before changes take effect in the next billing cycle.
Continuing the subscription after a price change means you accept the new pricing.

### 22. Acceptable use

You agree not to use the app for any unlawful purpose, not to attempt to
reverse-engineer, decompile, or extract the app's underlying models or source code
beyond what is already publicly available, not to attempt to circumvent
subscription/payment controls, and not to use the app in any way that could
disrupt or harm its operation or other users' ability to use it.

### 23. The Tajweed and recitation analysis is guidance, not a ruling

This is important, and we state it plainly rather than bury it: the app's scoring
and Tajweed feedback are generated through acoustic signal analysis and an
on-device speech-recognition model. This is a genuine, real analysis of your
recorded audio — not a placeholder or fabricated result — but it is fundamentally
an approximation, not a formal religious ruling and not a substitute for guidance
from a qualified Quran or Tajweed teacher. Some Tajweed rules cannot be reliably
verified through acoustic analysis alone and are not claimed to be checked by the
app. Use Tilawah as a practice aid between lessons, not as an authority on the
correctness of your recitation.

### 24. Content ownership

The Quran text, translations, reciter audio, tafsir, and hadith content displayed
in the app are sourced from established third-party providers and are not owned by
us; they are used under the terms those sources make publicly available. The app's
own software, design, and the specific analysis features we built are our own work
product. Your own recitation recordings and practice data belong to you.

### 25. No warranty

The app is provided "as is" and "as available," without warranties of any kind,
whether express or implied, including but not limited to warranties of
merchantability, fitness for a particular purpose, or non-infringement. We do not
warrant that the app will be uninterrupted, error-free, or that its analysis will
meet any particular standard of accuracy, given the honest, stated limitations
described in section 23.

### 26. Limitation of liability

To the fullest extent permitted by law, we are not liable for any indirect,
incidental, special, consequential, or punitive damages, or for loss of data. This
limitation applies to any claim arising out of or relating to your use of the app.
Our total liability for any claim related to your use of the app will not exceed the
amount you paid us, if any, in the 12 months before the claim.

### 27. Termination

We may suspend or end your access to the app if you break the terms. You may stop
using the app at any time. You may also delete your account at any time, as explained
in the Privacy Policy. If you are a subscriber, deleting your account also cancels
your Stripe subscription and deletes your backend account record. Your subscription
row and backend account are removed completely. They are not only marked inactive.
Some parts of the terms still apply after termination. These surviving parts include
ownership, disclaimers, and limitation of liability.

### 28. Governing law

These Terms of Service are governed by and construed in accordance with the laws of
the State of Ohio, United States, without regard to its conflict-of-laws provisions.
You agree that any dispute arising out of or relating to these terms or your use of
the app will be subject to the exclusive jurisdiction of the state and federal courts
located in the State of Ohio.

Nothing in these Terms limits or waives any consumer-protection or other rights that
the law of your country or state of residence does not permit to be limited or
waived. Where such mandatory rights apply, they continue to apply to you regardless
of the governing-law and jurisdiction choices above.

### 29. Severability and entire agreement

If any provision of these terms is found to be unenforceable, the remaining
provisions will continue in full force and effect. These terms, together with the
Privacy Policy, constitute the entire agreement between you and us regarding your
use of the app, and supersede any prior agreements on this subject.

### 30. Changes to these terms and contact

We may revise these Terms of Service from time to time; continued use of the app
after a revision takes effect constitutes acceptance of the updated terms. If you
have questions about these terms or the Privacy Policy, please contact us at
`alaminoyeyemi64@gmail.com`.

Operator: Akeem Adekunle (an individual/sole proprietor).

---

## Outstanding placeholders (operator decisions)

These are **not** oversights — they are business/legal decisions that were
deliberately left rather than invented.

Resolved 2026-07-16: the **refund policy** (Terms §20, attorney-provided text) and
the **contact email** (`alaminoyeyemi64@gmail.com`) are now filled in. **Governing
law** (Terms §28) is set to the State of Ohio — the Ohio choice is confirmed, though
the specific clause wording here is a standard draft, not the reviewed §20 text.

Resolved 2026-07-18: the **data processing region** (Privacy §14) is filled in — the
Supabase project runs in US West (Oregon, `us-west-2`) and Stripe is US-based, so
data is stored in the United States, with a cross-border transfer/consent clause for
users outside the US.

Resolved 2026-07-18: the **operator / business name** (Privacy §15; Terms §30) is
filled in — **Akeem Adekunle**, operating as an individual / sole proprietor (matching
the Live Stripe account's "Individual" business type). If a formal business (LLC, etc.)
is registered later, this name should be updated to the registered entity in both pages.

**All content placeholders are now filled.** The document went through a legal review
(two passes; recommendations applied — sole-proprietor wording, EU/UK withdrawal,
COPPA language, Ohio governing-law savings clause). On 2026-07-18 the operator elected
to remove the "Draft notice" banner from both pages and this document, on the strength
of that review. Note the review itself was provided as general information and stated
it is not a substitute for advice from a licensed attorney; a licensed-attorney sign-off
was not obtained. If the operator later wants that, a licensed attorney should review
the current version before further reliance.
