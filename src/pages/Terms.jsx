import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";

// Written against what the app ACTUALLY does (entitlements.js decides which
// features are gated; the Stripe Edge Functions handle billing). Keep section
// 17's free/paid split in sync with FREE_FEATURES/GATED_FEATURES, and section
// 23's honesty about the analysis in sync with tajweedRules.js scope.
// Placeholders in [BRACKETS] are real business/legal decisions and must be
// filled in by the operator — they are deliberately left visible rather than
// invented.

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

export default function Terms() {
  return (
    <div className="min-h-screen bg-slate-950 text-slate-300">
      <div className="max-w-2xl mx-auto px-5 py-8 space-y-6">
        <Link to="/settings" className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-300">
          <ArrowLeft className="w-4 h-4" /> Back
        </Link>

        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center flex-shrink-0">
            <ScrollText className="w-5 h-5 text-emerald-400" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-white">Terms of Service</h1>
            <p className="text-xs text-slate-500 mt-1">Effective date: {EFFECTIVE_DATE}</p>
          </div>
        </div>

        <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3">
          <p className="text-xs text-amber-400/90 leading-relaxed">
            <strong>Draft notice:</strong> these terms are written to accurately describe how the app
            actually works, but they have <strong>not</strong> been reviewed by a lawyer. Because
            real payments are involved, they should receive professional legal review.
          </p>
        </div>

        <Section n="16" title="Acceptance of these terms">
          <p>
            By downloading, accessing, or using Tilawah, you agree to these Terms of Service. If you
            do not agree, please do not use the app. If you are using the app on behalf of a minor,
            or are a minor using the app under a parent or guardian's supervision, these terms apply
            to that arrangement as described further below.
          </p>
        </Section>

        <Section n="17" title="What the app is">
          <p>
            Tilawah is a Quran recitation practice tool. Free features include the full Quran text
            and translations, reciter audio playback, single-ayah recitation scoring, the Tajweed
            checks shown with those results, an authentic-hadith reference section, and local
            progress tracking. Certain features — specifically continuous ("Recite All") whole-surah
            recitation practice and the Tajweed Trends charts — require an active paid subscription.
          </p>
        </Section>

        <Section n="18" title="Eligibility and account responsibility">
          <p>
            When you create a subscription account, you must confirm that you are at least 13 years
            old and actively agree to these Terms of Service and the Privacy Policy before the
            account is created. If you are under the age required to enter into binding agreements or
            hold a payment account in your jurisdiction, any subscription purchase must be made and
            managed by a parent or legal guardian acting as the account holder; the app's
            subscription system is intentionally designed to require this. You are responsible for
            maintaining the security of your local device and any account credentials you create, and
            for all activity that occurs under your account.
          </p>
        </Section>

        <Section n="19" title="Subscriptions and billing">
          <p>
            Paid subscriptions are billed on a recurring basis (monthly or yearly, as selected at
            signup) through Stripe. Before you are sent to payment, the app shows you — at the point
            of purchase — the exact recurring amount, the billing frequency, that the subscription
            automatically renews at that price until you cancel, and how to cancel. Subscriptions
            automatically renew at the end of each billing period unless cancelled beforehand. You
            can view your current plan and renewal date, and cancel your subscription at any time,
            through Settings, which links to Stripe's own account management portal. Cancelling stops
            future renewals; you retain access to paid features through the remainder of the period
            you have already paid for.
          </p>
          <p>
            Because a subscription grants immediate access to digital features, at checkout you
            confirm that you want that access to begin right away and acknowledge that doing so waives
            any statutory "cooling-off" or withdrawal right (such as the EU/UK 14-day right) for the
            current billing period, to the extent such a right would otherwise apply to you.
          </p>
        </Section>

        <Section n="20" title="Refund Policy and Right of Withdrawal">
          <p>
            All subscription charges are non-refundable, except as required by applicable law. EU/UK
            Users: By subscribing to Tilawah, you expressly consent to the immediate delivery of the
            digital content and paid features. You acknowledge and agree that by accessing these
            features immediately, you lose your statutory 14-day right of withdrawal for the current
            billing period. If you cancel your subscription, the cancellation will take effect at the
            end of your current paid term, and no prorated refunds will be issued.
          </p>
        </Section>

        <Section n="21" title="Changes to pricing or plans">
          <p>
            We may change subscription pricing or the features included in each tier over time. If we
            do, we will make reasonable efforts to notify existing subscribers before any change
            takes effect for their next billing cycle. Continuing your subscription after a pricing
            change takes effect constitutes acceptance of the new pricing.
          </p>
        </Section>

        <Section n="22" title="Acceptable use">
          <p>
            You agree not to use the app for any unlawful purpose, not to attempt to
            reverse-engineer, decompile, or extract the app's underlying models or source code beyond
            what is already publicly available, not to attempt to circumvent subscription/payment
            controls, and not to use the app in any way that could disrupt or harm its operation or
            other users' ability to use it.
          </p>
        </Section>

        <Section n="23" title="The Tajweed and recitation analysis is guidance, not a ruling">
          <p>
            This is important, and we state it plainly rather than bury it: the app's scoring and
            Tajweed feedback are generated through acoustic signal analysis and an on-device
            speech-recognition model. This is a genuine, real analysis of your recorded audio — not a
            placeholder or fabricated result — but it is fundamentally an approximation, not a formal
            religious ruling and not a substitute for guidance from a qualified Quran or Tajweed
            teacher. Some Tajweed rules cannot be reliably verified through acoustic analysis alone
            and are not claimed to be checked by the app. Use Tilawah as a practice aid between
            lessons, not as an authority on the correctness of your recitation.
          </p>
        </Section>

        <Section n="24" title="Content ownership">
          <p>
            The Quran text, translations, reciter audio, tafsir, and hadith content displayed in the
            app are sourced from established third-party providers and are not owned by us; they are
            used under the terms those sources make publicly available. The app's own software,
            design, and the specific analysis features we built are our own work product. Your own
            recitation recordings and practice data belong to you.
          </p>
        </Section>

        <Section n="25" title="No warranty">
          <p>
            The app is provided "as is" and "as available," without warranties of any kind, whether
            express or implied, including but not limited to warranties of merchantability, fitness
            for a particular purpose, or non-infringement. We do not warrant that the app will be
            uninterrupted, error-free, or that its analysis will meet any particular standard of
            accuracy, given the honest, stated limitations described in section 23.
          </p>
        </Section>

        <Section n="26" title="Limitation of liability">
          <p>
            To the maximum extent permitted by applicable law, we shall not be liable for any
            indirect, incidental, special, consequential, or punitive damages, or any loss of data,
            arising out of or related to your use of the app. Our total liability for any claim
            arising from your use of the app shall not exceed the amount you paid us, if any, in the
            twelve months preceding the claim.
          </p>
        </Section>

        <Section n="27" title="Termination">
          <p>
            We may suspend or terminate your access to the app if you violate these terms. You may
            stop using the app and delete your account at any time, as described in the Privacy
            Policy. Sections of these terms that by their nature should survive termination
            (including ownership, disclaimers, and limitation of liability) will continue to apply
            after termination.
          </p>
        </Section>

        <Section n="28" title="Governing law">
          <p>
            These Terms of Service are governed by and construed in accordance with the laws of the
            State of Ohio, United States, without regard to its conflict-of-laws provisions. You agree
            that any dispute arising out of or relating to these terms or your use of the app will be
            subject to the exclusive jurisdiction of the state and federal courts located in the State
            of Ohio.
          </p>
        </Section>

        <Section n="29" title="Severability and entire agreement">
          <p>
            If any provision of these terms is found to be unenforceable, the remaining provisions
            will continue in full force and effect. These terms, together with the Privacy Policy,
            constitute the entire agreement between you and us regarding your use of the app, and
            supersede any prior agreements on this subject.
          </p>
        </Section>

        <Section n="30" title="Changes to these terms and contact">
          <p>
            We may revise these Terms of Service from time to time; continued use of the app after a
            revision takes effect constitutes acceptance of the updated terms. If you have questions
            about these terms or the Privacy Policy, please contact us at {SUPPORT_EMAIL}.
          </p>
          <p className="text-xs text-slate-600">Operator: {OPERATOR}.</p>
        </Section>

        <div className="pt-2 border-t border-slate-800">
          <Link to="/privacy" className="text-sm text-emerald-400 hover:text-emerald-300">
            Privacy Policy →
          </Link>
        </div>
      </div>
    </div>
  );
}
