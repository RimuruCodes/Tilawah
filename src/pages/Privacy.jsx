import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ShieldCheck } from "lucide-react";

// Drafted from the ACTUAL data flows in the code (localAuth.js, localDb.js,
// subscriptionApi.js, the Supabase Edge Functions) — if the data handling
// changes, this page must change with it. Placeholders in [BRACKETS] need
// real values before launch.

const EFFECTIVE_DATE = "July 14, 2026";
const SUPPORT_EMAIL = "[SUPPORT-EMAIL — dedicated address to be created]";

function Section({ title, children }) {
  return (
    <section className="space-y-2">
      <h2 className="text-base font-semibold text-white">{title}</h2>
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
            <strong>Draft notice:</strong> this document is a drafted starting point written to
            accurately describe how the app works. It has <strong>not</strong> been reviewed by a
            lawyer. Because real payments are involved, it should receive professional legal review
            before being relied on.
          </p>
        </div>

        <Section title="The short version">
          <p>
            Tilawah is built local-first. Your recitation practice — including your voice — is
            processed entirely on your own device. We only operate server-side data for one thing:
            paid subscriptions. If you never subscribe, we run no server that knows who you are.
          </p>
        </Section>

        <Section title="Voice recordings (both tiers)">
          <p>
            When you record a recitation, the audio is analyzed <strong>on your device, in your
            browser</strong> — including the speech-recognition step, which runs a local model
            downloaded to your browser. Your recordings are <strong>never uploaded to any server
            </strong> and <strong>never stored</strong>: the audio exists only in your device's
            memory while the result screen is open, and is discarded afterwards. What is kept is
            the <em>result</em> — scores and text feedback — stored locally on your device.
          </p>
        </Section>

        <Section title="Free tier: what's stored, and where">
          <p>
            Everything lives in your browser's local storage on your device. Nothing is sent to us —
            we have no server for it:
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li>Your local account: a one-way hash of your email (never a readable copy), a display name you choose, and a hashed password — used only to unlock the app on this device.</li>
            <li>Recitation scores and text feedback, including which verses you practiced.</li>
            <li>Streaks, memorization progress, recitation-plan progress, and any "this result seems off" reports you file (text only).</li>
            <li>Preferences: microphone calibration, speech-recognition settings, display options, and a technical diagnostic log.</li>
          </ul>
          <p>
            Because this data is on your device, clearing your browser's site data deletes it. Use
            Settings → Data to export a backup copy anytime.
          </p>
        </Section>

        <Section title="Subscribed tier: what's added">
          <p>If you subscribe, exactly this server-side data exists:</p>
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Supabase</strong> (our database and login provider) stores your email address
            and one subscription record: your plan, its status, renewal date, and Stripe customer/
              subscription IDs. Access rules ensure only you (and our payment webhook) can touch
              your record.
            </li>
            <li>
              <strong>Stripe</strong> (our payment processor) handles your payment. Card details are
              entered on Stripe's own pages — this app never sees or stores card numbers. Stripe
              receives your email and an account identifier so payments can be matched to your
              subscription. Stripe's own privacy policy applies to the data it processes.
            </li>
            <li>
              <strong>Brevo</strong> (email delivery) transmits the 6-digit login codes we email
              you, and therefore processes your email address in transit.
            </li>
          </ul>
          <p>
            Donations are separate from subscriptions and require no account: they go directly
            through Stripe's donation page, and we receive no personal information about donors.
          </p>
        </Section>

        <Section title="Ordinary web traffic to content providers">
          <p>
            Like any website, loading content means your IP address and the requested resource are
            visible to the servers involved. This app fetches: the app itself from Cloudflare Pages
            (hosting), Quran text from alquran.cloud, reciter audio from everyayah.com, hadith and
            tafsir text from the jsDelivr CDN, word-by-word meanings from qurancdn.com, and the
            speech-recognition model from huggingface.co. None of these receive your account
            details or your recordings from us — this is standard content fetching.
          </p>
        </Section>

        <Section title="Your rights: access, export, deletion">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              <strong>Access &amp; export:</strong> Settings → Data → Export downloads everything the
              app stores about you locally, as a JSON file, at any time.
            </li>
            <li>
              <strong>Local deletion:</strong> Settings → Delete account permanently removes your
              local account and all locally stored practice data (scores, streaks, progress, plans,
              feedback reports) from the device.
            </li>
            <li>
              <strong>Server-side deletion (subscribers):</strong> deleting the local account does
              not delete your subscription record. Email {SUPPORT_EMAIL} from your subscription
              email address and we will cancel any active subscription and delete your Supabase
              record. Stripe retains transaction records as required for financial/legal compliance
              — that retention is theirs, not ours.
            </li>
          </ul>
        </Section>

        <Section title="Data security — honest limits">
          <p>
            Local data is stored in your browser's standard storage, which is not additionally
            encrypted by the app: anyone with access to your unlocked device profile can access it.
            The local password protects the app's screens, not the underlying storage. Server-side
            data is protected by Supabase's and Stripe's security controls plus row-level access
            rules.
          </p>
          <p>
            Your email is stored locally only as a one-way hash, so the app never keeps a readable
            copy of your email — this hides it from casual inspection of local storage, but is not
            strong protection against someone with full access to your device (a known address can
            be checked against the hash).
          </p>
        </Section>

        <Section title="Children">
          <p>
            The app does not knowingly collect personal information from children beyond what is
            described above, and the free tier sends us nothing at all. Subscriptions require a
            payment method and should be completed by an adult.
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            If how the app handles data changes, this policy will be updated and the effective date
            changed. Questions or requests: {SUPPORT_EMAIL}.
          </p>
          <p className="text-xs text-slate-600">
            Operator: [OPERATOR / BUSINESS NAME — to be filled in].
          </p>
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
