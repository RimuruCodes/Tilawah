import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

// Drafted from the ACTUAL data flows in the code (cloudAuth.js, dataSync.js,
// localDb.js, subscriptionApi.js, the Supabase Edge Functions) — if the data
// handling changes, this page must change with it.
//
// Key facts, checked against the code:
//  - accounts are Supabase Auth (email + password); the password is stored
//    only as a secure hash by Supabase (cloudAuth.js)
//  - practice data is local-first AND backed up to the user_data table so it
//    syncs across devices (dataSync.js + migration 0002); voice is NOT synced
//  - voice never leaves the device (recitationService/asrWorker are local)
//  - account deletion cancels Stripe + deletes the Supabase row + auth user,
//    and user_data cascade-deletes with it (supabase/functions/delete-account,
//    migration 0002) — do not weaken that without weakening section 11.

const EFFECTIVE_DATE = "July 16, 2026";
const SUPPORT_EMAIL = "alaminoyeyemi64@gmail.com";
const OPERATOR = "Akeem Adekunle";

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

        <Section n="1" title="Overview">
          <p>
            This Privacy Policy explains what information Tilawah ("the app," "we," "our" — meaning
            Akeem Adekunle, an individual doing business as Tilawah) collects, how it's used, and what
            control you have over it. Tilawah is a Quran recitation practice
            app with two tiers of use — a free tier that runs entirely on your own device, and a paid
            subscription tier that involves a real backend account. These two tiers handle your data
            very differently, and this policy describes both honestly and separately rather than
            making one blanket claim that wouldn't be true for everyone.
          </p>
        </Section>

        <Section n="2" title="Your account and practice data sync across your devices">
          <p>
            To use the app you create an account with our backend provider (Supabase), using an
            email address and a password. Because your account lives on the server, you can sign in
            on any device and pick up where you left off. Your practice data — your recitation
            history, your streaks, your memorization progress, your recitation-plan progress, and any
            "this result seems off" feedback reports you file (text only) — is kept on your device
            for offline use <strong>and</strong> backed up to your account so it follows you to your
            other devices.
          </p>
          <p>
            Some things stay on your device only and are never sent to us: your recorded voice (see
            the next section), a local technical diagnostic log, and app settings/preferences. If you
            sign out, or use the app without logging in, that unsynced data remains only on the
            device where it was created.
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

        <Section n="4" title="How your account works">
          <p>
            Your account is created and managed by our backend provider, Supabase, using your email
            address and a password. Your email address is stored so we can identify your account,
            let you sign in across devices, send you sign-in and password-reset messages, and (if you
            subscribe) tie your subscription to you. Your password is never stored in readable form —
            Supabase keeps only a securely hashed version of it, from which the original password
            cannot be recovered.
          </p>
          <p>
            Access to your account and your synced data is protected by your password and by
            database access rules that let only you (and, for subscriptions, our payment webhook)
            read your records. As with any account-based service, keep your password private and use
            a strong one.
          </p>
        </Section>

        <Section n="5" title="Display name">
          <p>
            You may choose a display name when you register, shown in the app instead of your email
            address. If you don't choose one, a generic default is used. This name is stored with
            your account and is not derived from your email address.
          </p>
        </Section>

        <Section n="6" title="What happens if you subscribe">
          <p>
            If you subscribe, your existing account gains a subscription record stored with our
            backend provider. That record contains your plan, its status, the renewal date, and the
            Stripe customer and subscription identifiers that link your account to the payment.
            Access rules ensure only you (and our payment webhook) can read your record.
          </p>
          <p>
            Subscribing does not change how your practice data or voice are handled: your voice
            recordings are still never uploaded, and your practice data is synced the same way it is
            for any account (section 2). A subscription only adds the entitlement record described
            above.
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
            <li>
              <strong>Supabase</strong> — your account (email + password), your synced practice
              data, and subscription/entitlement storage.
            </li>
            <li>
              <strong>Brevo</strong> — email delivery. It transmits the sign-in and password-reset
              messages we email you, and therefore processes your email address in transit.
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
            The app uses your browser's local storage to keep a working copy of your data,
            preferences, and sign-in session on your device, so it runs quickly and works offline.
            This is not a tracking cookie and is not used to identify you across other websites — it
            functions purely as this app's own private storage. Clearing it through your browser
            removes the on-device copy; because your practice data is also backed up to your account,
            signing in again restores it. Preferences and the local diagnostic log, which are not
            synced, would not be restored.
          </p>
        </Section>

        <Section n="11" title="Exporting and deleting your data">
          <p>
            Settings includes a data export feature that lets you download a copy of your recitation
            history, streaks, and progress as a file, and an import feature to restore it later.
          </p>
          <p>
            Deleting your account permanently deletes your backend account, your synced practice
            data, and (if you subscribe) <strong>cancels your Stripe subscription and removes your
            subscription record</strong> — these are removed, not merely marked inactive — and also
            wipes the copy of your data stored on the device you delete from. If the server-side step
            fails for any reason, the app stops and tells you rather than continuing, so you are never
            left still being billed with no account to show for it. Once deletion completes, we cannot
            recover your data for you afterward.
          </p>
          <p>
            Honest limit: Stripe retains the underlying payment and transaction records for its own
            accounting and legal-compliance obligations. We cancel your subscription and remove your
            link to us; we cannot erase Stripe's financial history, and we don't claim to.
          </p>
        </Section>

        <Section n="12" title="Security">
          <p>
            We take reasonable, genuine measures to protect the data described above: your password
            is stored only as a secure hash by our backend provider, access to your account and
            synced data is restricted by database rules to you alone, and we rely on established,
            security-reviewed providers (Supabase, Stripe) for account, data, and payment handling.
            That said, no system is perfectly secure, and data stored on your own device is only as
            secure as that device itself; we encourage you to use a strong, unique password, a device
            passcode, and to keep your browser and operating system updated.
          </p>
        </Section>

        <Section n="13" title="Children's privacy">
          <p>
            Tilawah is intended for users 13 and older, and we do not knowingly collect personal
            information from children under 13. Creating a subscription account requires confirming
            that you are at least 13 years old, and the app blocks account creation for anyone who
            indicates they are under 13. If we learn that a child under 13 has provided personal
            information through the subscription/backend system, we will take steps to delete it. If
            you are a parent or guardian and believe your child has provided us with personal
            information despite this, please contact us at {SUPPORT_EMAIL} so we can address it. We
            encourage parental involvement in any subscription or payment activity related to this
            app, consistent with how the app's own subscription system is designed to require an adult
            account holder for payment purposes.
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
