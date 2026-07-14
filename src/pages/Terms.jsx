import React from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, ScrollText } from "lucide-react";

// Drafted to match how the app actually behaves (Stripe-hosted billing,
// local-first data, heuristic analysis with honest limits). Placeholders in
// [BRACKETS] are deliberate and must be decided by the operator before
// launch — especially the refund policy and governing law.

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
            <strong>Draft notice:</strong> this document is a drafted starting point and has{" "}
            <strong>not</strong> been reviewed by a lawyer. Because real payments are involved, it
            should receive professional legal review before launch.
          </p>
        </div>

        <Section title="What Tilawah is">
          <p>
            Tilawah is a Quran recitation companion: it lets you read, listen, practice, and get
            automated feedback on your recitation. By using the app you agree to these terms. If
            you don't agree, please don't use the app.
          </p>
        </Section>

        <Section title="The analysis is approximate guidance — not a teacher, not a ruling">
          <p>
            The recitation scores and Tajweed checks are produced by on-device signal analysis and
            a general-purpose Arabic speech-recognition model with heuristic timing checks. They
            are <strong>approximate guidance, not a formal Tajweed ruling</strong>, not a
            certification, and <strong>not a substitute for studying with a qualified teacher</strong>.
            The model can mishear words and the checks can be wrong in both directions. Treat every
            result as a pointer to double-check, not a verdict — the app says this in its results
            screens, and these terms say it too.
          </p>
        </Section>

        <Section title="Subscriptions, billing, and cancellation">
          <ul className="list-disc pl-5 space-y-1">
            <li>
              Paid plans are billed by <strong>Stripe</strong> on a monthly or yearly cycle, in
              advance, and <strong>renew automatically</strong> until cancelled.
            </li>
            <li>
              You can cancel anytime via Settings → Manage subscription, which opens Stripe's
              billing portal. Cancelling stops future renewals; your access continues until the end
              of the period you already paid for.
            </li>
            <li>
              Prices may change; existing subscribers will be notified before a change affects
              their renewal.
            </li>
            <li>
              The free tier is genuinely free and works without any account on our servers.
            </li>
          </ul>
        </Section>

        <Section title="Refunds">
          <p className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
            [REFUND POLICY — PLACEHOLDER. Operator must decide: e.g. "14-day no-questions refund on
            first purchase, then no refunds for partial periods", or "no refunds; cancel anytime to
            stop renewal". Common practice for small subscription apps is the first option.]
          </p>
        </Section>

        <Section title="Your data">
          <p>
            How data is handled is described in the{" "}
            <Link to="/privacy" className="text-emerald-400 hover:text-emerald-300">
              Privacy Policy
            </Link>
            . In short: practice data lives on your device (export it from Settings), and only
            subscriptions create server-side records. You are responsible for backing up your local
            data (Settings → Data → Export) — clearing browser storage deletes it.
          </p>
        </Section>

        <Section title="Acceptable use">
          <p>
            Don't attempt to disrupt the service, abuse the payment or email systems, or use the
            app to violate any law. The Quran text, reciter audio, hadith, and tafsir content are
            provided by third-party sources and remain subject to their terms.
          </p>
        </Section>

        <Section title="Disclaimer of warranties & limitation of liability">
          <p>
            The app is provided <strong>"as is"</strong>, without warranties of any kind, express or
            implied — including fitness for a particular purpose and accuracy of the analysis. To
            the maximum extent permitted by law, our total liability for any claim related to the
            app is limited to the amount you paid us in the twelve months before the claim arose
            (zero for free-tier users). Nothing in these terms excludes liability that cannot
            legally be excluded.
          </p>
        </Section>

        <Section title="Governing law">
          <p className="bg-slate-800/50 border border-slate-700/40 rounded-lg p-3">
            [GOVERNING LAW / JURISDICTION — PLACEHOLDER. Operator must fill in the country/state
            whose law governs these terms and where disputes are resolved.]
          </p>
        </Section>

        <Section title="Changes and contact">
          <p>
            We may update these terms; material changes will be reflected in the effective date
            above. Continued use after a change means acceptance. Contact: {SUPPORT_EMAIL}.
          </p>
          <p className="text-xs text-slate-600">
            Operator: [OPERATOR / BUSINESS NAME — to be filled in].
          </p>
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
