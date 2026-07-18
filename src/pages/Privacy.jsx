import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

// Drafted from the ACTUAL data flows in the code (localAuth.js, localDb.js,
// subscriptionApi.js, the Supabase Edge Functions) — if the data handling
// changes, this page must change with it. Placeholders in [BRACKETS] need
// real values before they stop being wrong.
//
// Every factual claim here was checked against the code on 2026-07-16:
//  - voice never leaves the device (recitationService/asrWorker are local)
//  - local email is stored only as a SHA-256 hash (localAuth.hashEmail)
//  - account deletion really does cancel Stripe + delete the Supabase row
//    (supabase/functions/delete-account) — do not weaken that function
//    without weakening section 11 to match.

const EFFECTIVE_DATE = "July 16, 2026";
const SUPPORT_EMAIL = "alaminoyeyemi64@gmail.com";
const OPERATOR = "[OPERATOR / BUSINESS NAME — to be filled in]";

function Section({ n, title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">
        {n}. {title}
      </h2>
      <div className="space-y-2 text-sm text-slate-400 leading-relaxed">{children}</div>
    </section>
  );
}

export default function Privacy() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <ShieldCheck className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Privacy Policy</h1>
            <p className="text-xs text-slate-500 mt-1">Effective date: {EFFECTIVE_DATE}</p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <p className="text-xs text-amber-400/90 leading-relaxed">
            <strong>Draft notice:</strong> this document is written to accurately describe how the
            app actually works, but it has <strong>not</strong> been reviewed by a lawyer. Because
            real payments are involved, it should receive professional legal review.
          </p>
        </div>

        <Section n="1" title="Overview">
          <p>
            This Privacy Policy explains what information Tilawah ("the app," "we," "our") collects,
            how it's used, and what control you have over it. Tilawah is a Quran recitation practice
            app with two tiers of use — a free tier that runs entirely on your own device, and a paid
            subscription tier that involves a real backend account. These two tiers handle your data
            very differently, and this policy describes both honestly and separately rather than
            making one blanket claim that wouldn't be true for everyone.
          </p>
        </Section>

        <Section n="2" title="The free tier is local-first, by design">
          <p>
            If you never subscribe, your account, your recitation history, your streaks, your
            memorization progress, your recitation-plan progress, any "this result seems off"
            feedback reports you file (text only), a local technical diagnostic log, and every
            setting you choose are stored only in your browser's local storage, on your own device.
            Nothing in the free tier is transmitted to us or to any server we operate, because no
            such server exists for this data. Each browser or device you use creates its own
            independent local account; there is no cross-device sync for free accounts, and no way
            for us to see, recover, or restore this data on your behalf, since we never had a copy
            of it.
          </p>
        </Section>

        <Section n="3" title="Your voice recordings are never uploaded, on either tier">
          <p>
            When you record yourself reciting, that audio is analyzed entirely on your device — the
            acoustic scoring and the speech-recognition-based Tajweed analysis both run locally, in
            your browser. At no point does your recorded voice get sent to us, to any server, or to
            any third party. This is true whether you are a free user or a paying subscriber; a
            subscription changes how your account is managed, not how your voice is handled.
          </p>
        </Section>

        <Section n="4" title="How your local account works">
          <p>
            If you create a local account, we do not store your email address in readable form.
            Instead, your email is converted into a one-way cryptographic hash (SHA-256 of your
            normalized address) and only that hash is stored — this means the app never keeps a copy
            of your email that could be read directly from storage. This hides your email from
            casual inspection but is <strong>not</strong> strong protection against someone who has
            full access to your unlocked device: the hash must be reproducible in order to look your
            account up, so someone who already guesses your address can confirm it matches. It is
            obfuscation, not a guarantee of secrecy.
          </p>
          <p>
            Your password is never stored in any form — only a salted PBKDF2-SHA-256 hash (600,000
            iterations, a current industry-standard setting) is kept, and the original password
            cannot be derived from it.
          </p>
          <p className="text-slate-500">
            One honest caveat: local accounts created before this hashing was introduced still hold
            their email (and an older password hash) in the previous format until the next time you
            log in on that device, at which point both are automatically upgraded and the readable
            email is deleted.
          </p>
        </Section>

        <Section n="5" title="Display name">
          <p>
            You may choose a display name when you register, shown in the app instead of your email
            address. If you don't choose one, a generic default is used. This name is stored locally
            alongside your account and is not derived from your email address.
          </p>
        </Section>

        <Section n="6" title="What happens if you subscribe">
          <p>
            Subscribing to Tilawah requires creating a real, verified account with our backend
            provider (Supabase), using email-based verification. This is a deliberate and necessary
            trade-off: your entitlement to paid features needs to be checked against a real server so
            it can follow you across devices and survive you clearing your browser data — something a
            purely local account cannot do.
          </p>
          <p>
            If you subscribe, your email address (used for account verification) and your
            subscription record are stored with our backend provider. That record contains your plan,
            its status, the renewal date, and the Stripe customer and subscription identifiers that
            link your account to the payment. Access rules ensure only you (and our payment webhook)
            can read your record. Your recitation data, voice recordings, and practice history remain
            local to your device even as a subscriber; only your account identity and subscription
            status are backend-managed.
          </p>
        </Section>

        <Section n="7" title="Payment information">
          <p>
            Subscription payments are handled by <strong>Stripe</strong>, a third-party payment
            processor. We do not receive, see, or store your card details, billing address, or other
            payment credentials — these are handled entirely within Stripe's own secure systems, in
            accordance with Stripe's privacy practices and industry payment security standards. We
            receive confirmation of your subscription status (active, cancelled, renewal date) and
            the Stripe identifiers described in section 6 — never your payment details themselves.
          </p>
          <p>
            Separately, voluntary <strong>donations</strong> are optional, grant no features, and
            require no account. Depending on which option you choose in the app, a donation is made
            either through Stripe's hosted payment page or through <strong>Cash App</strong>, which
            opens in a new tab and is governed by Cash App's own terms and privacy policy. We receive
            no personal information about donors beyond what the chosen provider shows us.
          </p>
        </Section>

        <Section n="8" title="What we do not do">
          <p>
            We do not run advertising, do not use third-party analytics or tracking scripts, do not
            sell or share your data with data brokers, and do not build advertising profiles from
            your usage. The only third parties involved in the app's operation are those genuinely
            necessary to provide its features:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>Stripe</strong> — subscription payments and the billing portal.</li>
            <li><strong>Supabase</strong> — subscriber account and entitlement storage.</li>
            <li>
              <strong>Brevo</strong> — email delivery. It transmits the 6-digit sign-in codes we
              email subscribers, and therefore processes your email address in transit.
            </li>
            <li><strong>Cloudflare</strong> — hosting for the app itself.</li>
            <li>
              <strong>Hugging Face</strong> — where your browser downloads the speech-recognition
              model that then runs locally on your device.
            </li>
            <li><strong>Cash App</strong> — only if you choose it for a voluntary donation.</li>
            <li>The public content sources listed in section 9.</li>
          </ul>
        </Section>

        <Section n="9" title="Third-party content sources">
          <p>
            To display Quran text, translations, reciter audio, tafsir, and hadith content, the app
            fetches data at runtime from established public sources: Quran text from alquran.cloud,
            reciter audio from everyayah.com, hadith and tafsir text from the jsDelivr CDN, and
            word-by-word meanings from qurancdn.com. These requests may be visible to those services
            as ordinary web traffic (for example, your device's IP address requesting a specific
            ayah's audio file) in the same way any website request works, but no personal account
            information is sent alongside these requests.
          </p>
        </Section>

        <Section n="10" title="Local storage and how to clear it">
          <p>
            The app uses your browser's local storage to keep your account, preferences, and practice
            history on your device. This is not a tracking cookie and is not used to identify you
            across other websites — it functions purely as this app's own private storage. You can
            clear this data at any time through your browser's own settings, or through the in-app
            data export/delete options described below; doing so will permanently remove your local
            account and history unless you have exported a backup first.
          </p>
        </Section>

        <Section n="11" title="Exporting and deleting your data">
          <p>
            Settings includes a data export feature that lets you download a copy of your local
            recitation history, streaks, and progress as a file, and an import feature to restore it
            later or move it to a new device/browser.
          </p>
          <p>
            Deleting your account permanently removes your local account and all locally stored
            practice data from the device it's stored on. Because we never held a copy of that data,
            we cannot recover it for you afterward.
          </p>
          <p>
            If you are a subscriber, deleting your account also{" "}
            <strong>cancels your Stripe subscription and deletes your account record from our
            backend provider</strong> — your subscription row and your backend account are removed,
            not merely marked inactive. If that server-side step fails for any reason, the app stops
            and tells you rather than deleting your local account, so you are never left still being
            billed with no account to show for it.
          </p>
          <p>
            Honest limit: Stripe retains the underlying payment and transaction records for its own
            accounting and legal-compliance obligations. We cancel your subscription and remove your
            link to us; we cannot erase Stripe's financial history, and we don't claim to.
          </p>
        </Section>

        <Section n="12" title="Security">
          <p>
            We take reasonable, genuine measures to protect the data described above — salted
            password hashing with a strong, current-standard iteration count, hashed rather than
            plaintext email storage, and reliance on established, security-reviewed third-party
            providers (Stripe, Supabase) for anything that isn't purely local. That said, no system
            is perfectly secure, and data stored on your own device is only as secure as that device
            itself; we encourage you to use a device passcode and keep your browser and operating
            system updated.
          </p>
        </Section>

        <Section n="13" title="Children's privacy">
          <p>
            Creating a subscription account requires confirming that you are at least 13 years old;
            the app blocks account creation for anyone who indicates they are under 13. If you are a
            parent or guardian and believe your child has provided us with personal information
            through the subscription/backend system despite this, please contact us at{" "}
            {SUPPORT_EMAIL} so we can address it. We encourage parental involvement in any
            subscription or payment activity related to this app, consistent with how the app's own
            subscription system is designed to require an adult account holder for payment purposes.
          </p>
        </Section>

        <Section n="14" title="International users">
          <p>
            Our backend service providers process and store data in the United States. Your
            subscriber account and subscription record are stored in our Supabase project's US West
            region (Oregon, <code>us-west-2</code>), and subscription payments are processed by
            Stripe, a United States-based company. If you access the app from outside the United
            States, the limited account and subscription information described in this policy will be
            transferred to and stored in the United States, which may have data-protection laws that
            differ from those of your own country. By creating a subscription account, you consent to
            this transfer. Your recitation recordings and practice data are never transmitted at all
            and remain on your own device regardless of where you are.
          </p>
        </Section>

        <Section n="15" title="Changes to this policy">
          <p>
            We may update this Privacy Policy from time to time as the app changes. If we make
            material changes, we will make a reasonable effort to note this within the app itself.
            Continued use of the app after an update constitutes acceptance of the revised policy. We
            encourage you to review this page periodically.
          </p>
          <p>
            Questions or requests: {SUPPORT_EMAIL}.
          </p>
          <p className="text-xs text-slate-600">Operator: {OPERATOR}.</p>
        </Section>

        <div className="pt-2 border-t border-slate-800">
          <Link to="/terms" className="text-sm text-emerald-400 hover:text-emerald-300">
            Terms of Service →
          </Link>
        </div>
      </div>
    </div>
  );
}
