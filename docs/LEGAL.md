# Tilawah — Privacy Policy & Terms of Service

**Effective date: July 16, 2026**

> **Draft notice:** this document is written to accurately describe how the app
> actually works, but it has **not** been reviewed by a lawyer. Because real
> payments are involved, it should receive professional legal review.

> **Maintainer note (not part of the published text):** this file mirrors what
> `src/pages/Privacy.jsx` and `src/pages/Terms.jsx` render. Every factual claim
> was verified against the code on 2026-07-16. **If the data handling changes,
> both the pages and this file must change with it.** In particular:
> - Section 3 depends on ASR/DSP staying on-device (`recitationService.js`, `asrWorker.js`).
> - Section 4 depends on `localAuth.hashEmail` storing only a SHA-256 hash.
> - Section 11 depends on `supabase/functions/delete-account` genuinely cancelling
>   Stripe and deleting the Supabase row. Do not weaken that function without
>   weakening section 11 to match.
>
> **Unresolved placeholders are marked `[LIKE THIS]` and are real business/legal
> decisions — they were deliberately left rather than invented.** See the summary
> at the end.

---

## PART ONE: PRIVACY POLICY

### 1. Overview

This Privacy Policy explains what information Tilawah ("the app," "we," "our")
collects, how it's used, and what control you have over it. Tilawah is a Quran
recitation practice app with two tiers of use — a free tier that runs entirely on
your own device, and a paid subscription tier that involves a real backend
account. These two tiers handle your data very differently, and this policy
describes both honestly and separately rather than making one blanket claim that
wouldn't be true for everyone.

### 2. The free tier is local-first, by design

If you never subscribe, your account, your recitation history, your streaks, your
memorization progress, your recitation-plan progress, any "this result seems off"
feedback reports you file (text only), a local technical diagnostic log, and every
setting you choose are stored only in your browser's local storage, on your own
device. Nothing in the free tier is transmitted to us or to any server we operate,
because no such server exists for this data. Each browser or device you use
creates its own independent local account; there is no cross-device sync for free
accounts, and no way for us to see, recover, or restore this data on your behalf,
since we never had a copy of it.

### 3. Your voice recordings are never uploaded, on either tier

When you record yourself reciting, that audio is analyzed entirely on your device
— the acoustic scoring and the speech-recognition-based Tajweed analysis both run
locally, in your browser. At no point does your recorded voice get sent to us, to
any server, or to any third party. This is true whether you are a free user or a
paying subscriber; a subscription changes how your account is managed, not how
your voice is handled.

### 4. How your local account works

If you create a local account, we do not store your email address in readable
form. Instead, your email is converted into a one-way cryptographic hash (SHA-256
of your normalized address) and only that hash is stored — this means the app
never keeps a copy of your email that could be read directly from storage. This
hides your email from casual inspection but is **not** strong protection against
someone who has full access to your unlocked device: the hash must be reproducible
in order to look your account up, so someone who already guesses your address can
confirm it matches. It is obfuscation, not a guarantee of secrecy.

Your password is never stored in any form — only a salted PBKDF2-SHA-256 hash
(600,000 iterations, a current industry-standard setting) is kept, and the
original password cannot be derived from it.

One honest caveat: local accounts created before this hashing was introduced still
hold their email (and an older password hash) in the previous format until the
next time you log in on that device, at which point both are automatically
upgraded and the readable email is deleted.

### 5. Display name

You may choose a display name when you register, shown in the app instead of your
email address. If you don't choose one, a generic default is used. This name is
stored locally alongside your account and is not derived from your email address.

### 6. What happens if you subscribe

Subscribing to Tilawah requires creating a real, verified account with our backend
provider (Supabase), using email-based verification. This is a deliberate and
necessary trade-off: your entitlement to paid features needs to be checked against
a real server so it can follow you across devices and survive you clearing your
browser data — something a purely local account cannot do.

If you subscribe, your email address (used for account verification) and your
subscription record are stored with our backend provider. That record contains
your plan, its status, the renewal date, and the Stripe customer and subscription
identifiers that link your account to the payment. Access rules ensure only you
(and our payment webhook) can read your record. Your recitation data, voice
recordings, and practice history remain local to your device even as a subscriber;
only your account identity and subscription status are backend-managed.

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
- **Supabase** — subscriber account and entitlement storage.
- **Brevo** — email delivery. It transmits the 6-digit sign-in codes we email
  subscribers, and therefore processes your email address in transit.
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

The app uses your browser's local storage to keep your account, preferences, and
practice history on your device. This is not a tracking cookie and is not used to
identify you across other websites — it functions purely as this app's own private
storage. You can clear this data at any time through your browser's own settings,
or through the in-app data export/delete options described below; doing so will
permanently remove your local account and history unless you have exported a
backup first.

### 11. Exporting and deleting your data

Settings includes a data export feature that lets you download a copy of your
local recitation history, streaks, and progress as a file, and an import feature
to restore it later or move it to a new device/browser.

Deleting your account permanently removes your local account and all locally
stored practice data from the device it's stored on. Because we never held a copy
of that data, we cannot recover it for you afterward.

If you are a subscriber, deleting your account also **cancels your Stripe
subscription and deletes your account record from our backend provider** — your
subscription row and your backend account are removed, not merely marked inactive.
If that server-side step fails for any reason, the app stops and tells you rather
than deleting your local account, so you are never left still being billed with no
account to show for it.

Honest limit: Stripe retains the underlying payment and transaction records for
its own accounting and legal-compliance obligations. We cancel your subscription
and remove your link to us; we cannot erase Stripe's financial history, and we
don't claim to.

### 12. Security

We take reasonable, genuine measures to protect the data described above — salted
password hashing with a strong, current-standard iteration count, hashed rather
than plaintext email storage, and reliance on established, security-reviewed
third-party providers (Stripe, Supabase) for anything that isn't purely local.
That said, no system is perfectly secure, and data stored on your own device is
only as secure as that device itself; we encourage you to use a device passcode
and keep your browser and operating system updated.

### 13. Children's privacy

Tilawah does not currently have a specific age-verification or age-gating system.
If you are a parent or guardian and believe your child has provided us with
personal information through the subscription/backend system without your consent,
please contact us at `[SUPPORT-EMAIL — dedicated address to be created]` so we can
address it. We encourage parental involvement in any subscription or payment
activity related to this app, consistent with how the app's own subscription
system is designed to require an adult account holder for payment purposes.

### 14. International users

Our backend service providers (Supabase, Stripe) may process and store data in
regions outside your own country. `[DATA PROCESSING REGION / TRANSFER DETAILS —
PLACEHOLDER, confirm against Supabase/Stripe's current infrastructure
documentation before relying on this section.]`

### 15. Changes to this policy

We may update this Privacy Policy from time to time as the app changes. If we make
material changes, we will make a reasonable effort to note this within the app
itself. Continued use of the app after an update constitutes acceptance of the
revised policy. We encourage you to review this page periodically.

Questions or requests: `[SUPPORT-EMAIL — dedicated address to be created]`.

Operator: `[OPERATOR / BUSINESS NAME — to be filled in]`.

---

## PART TWO: TERMS OF SERVICE

### 16. Acceptance of these terms

By downloading, accessing, or using Tilawah, you agree to these Terms of Service.
If you do not agree, please do not use the app. If you are using the app on behalf
of a minor, or are a minor using the app under a parent or guardian's supervision,
these terms apply to that arrangement as described further below.

### 17. What the app is

Tilawah is a Quran recitation practice tool. Free features include the full Quran
text and translations, reciter audio playback, single-ayah recitation scoring, the
Tajweed checks shown with those results, an authentic-hadith reference section,
and local progress tracking. Certain features — specifically continuous ("Recite
All") whole-surah recitation practice and the Tajweed Trends charts — require an
active paid subscription.

### 18. Eligibility and account responsibility

You are responsible for maintaining the security of your local device and any
account credentials you create. If you are under the age required to enter into
binding agreements or hold a payment account in your jurisdiction, any
subscription purchase must be made and managed by a parent or legal guardian
acting as the account holder; the app's subscription system is intentionally
designed to require this. You are responsible for all activity that occurs under
your account.

### 19. Subscriptions and billing

Paid subscriptions are billed on a recurring basis (monthly or yearly, as selected
at signup) through Stripe. Subscriptions automatically renew at the end of each
billing period unless cancelled beforehand. You can view your current plan and
renewal date, and cancel your subscription at any time, through Settings, which
links to Stripe's own account management portal. Cancelling stops future renewals;
you retain access to paid features through the remainder of the period you have
already paid for.

### 20. Refund policy

`[REFUND POLICY — PLACEHOLDER. This must be a real, specific policy before it can
be relied on: the operator must decide and state the terms — for example whether
refunds are offered within a set number of days of a charge, how to request one,
and how partial periods are treated. Stripe expects a live account to publish a
genuine refund and cancellation policy.]`

### 21. Changes to pricing or plans

We may change subscription pricing or the features included in each tier over
time. If we do, we will make reasonable efforts to notify existing subscribers
before any change takes effect for their next billing cycle. Continuing your
subscription after a pricing change takes effect constitutes acceptance of the new
pricing.

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

To the maximum extent permitted by applicable law, we shall not be liable for any
indirect, incidental, special, consequential, or punitive damages, or any loss of
data, arising out of or related to your use of the app. Our total liability for
any claim arising from your use of the app shall not exceed the amount you paid
us, if any, in the twelve months preceding the claim.

### 27. Termination

We may suspend or terminate your access to the app if you violate these terms. You
may stop using the app and delete your account at any time, as described in the
Privacy Policy. Sections of these terms that by their nature should survive
termination (including ownership, disclaimers, and limitation of liability) will
continue to apply after termination.

### 28. Governing law

`[GOVERNING LAW / JURISDICTION — PLACEHOLDER. The operator must fill in the
country/state whose laws govern these terms and where disputes are handled. This
section cannot be relied on while it remains unfilled.]`

### 29. Severability and entire agreement

If any provision of these terms is found to be unenforceable, the remaining
provisions will continue in full force and effect. These terms, together with the
Privacy Policy, constitute the entire agreement between you and us regarding your
use of the app, and supersede any prior agreements on this subject.

### 30. Changes to these terms and contact

We may revise these Terms of Service from time to time; continued use of the app
after a revision takes effect constitutes acceptance of the updated terms. If you
have questions about these terms or the Privacy Policy, please contact us at
`[CONTACT EMAIL — PLACEHOLDER]`.

Operator: `[OPERATOR / BUSINESS NAME — to be filled in]`.

---

## Outstanding placeholders (operator decisions)

These are **not** oversights — they are business/legal decisions that were
deliberately left rather than invented. Real cards are being charged while the
refund policy is blank, which makes the first item urgent.

| # | Placeholder | Where | Notes |
|---|---|---|---|
| 1 | **Refund policy** | Terms §20 | **Urgent.** Stripe expects a live account to publish a genuine refund/cancellation policy. |
| 2 | **Governing law / jurisdiction** | Terms §28 | Country/state whose law governs and where disputes are handled. |
| 3 | **Contact / support email** | Privacy §13, §15; Terms §30 | A real, monitored address. Privacy §13 (children's privacy) depends on it. |
| 4 | **Operator / business name** | Privacy §15; Terms §30 | Who "we" legally are. Stripe requires a real business identity on a live account. |
| 5 | **Data processing region** | Privacy §14 | Confirm against Supabase/Stripe infrastructure docs. |

Once these are filled in and the document has had professional legal review, the
"Draft notice" banner should be removed from both pages (`src/pages/Privacy.jsx`
and `src/pages/Terms.jsx`) — it is accurate today and should not be removed before
then.
