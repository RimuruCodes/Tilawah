import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ArrowLeft, Mail, Send, Check, MessageSquare, Loader2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Contact() {
  const navigate = useNavigate();
  const [form, setForm] = useState({ name: "", email: "", message: "" });
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.message) {
      setError("Please fill in all fields.");
      return;
    }
    setError("");
    setSending(true);
    try {
      const subject = `New message from ${form.name}`;
      const body = `Name: ${form.name}\nEmail: ${form.email}\n\nMessage:\n${form.message}`;
      window.location.href = `mailto:team@qurancompanion.app?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
      setSent(true);
      setForm({ name: "", email: "", message: "" });
    } catch (err) {
      setError("Something went wrong opening your mail app. Please email us directly instead.");
    }
    setSending(false);
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-8">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <span className="text-sm text-slate-500">Back to Home</span>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="space-y-6"
        >
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-emerald-500/10 border border-emerald-500/20">
            <MessageSquare className="w-7 h-7 text-emerald-400" />
          </div>

          <div>
            <h1 className="text-3xl md:text-4xl font-bold text-white tracking-tight">Contact Us</h1>
            <p className="text-slate-400 mt-2 text-sm leading-relaxed">
              Have a question, suggestion, or just want to say salaam? We'd love to hear from you. Fill out the form below and we'll get back to you as soon as we can, insha'Allah.
            </p>
          </div>

          {/* Contact methods */}
          <div className="grid gap-3 sm:grid-cols-2">
            <a
              href="mailto:team@qurancompanion.app"
              className="flex items-center gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-700/20 hover:border-emerald-500/30 transition-colors"
            >
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <Mail className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Email</h3>
                <p className="text-xs text-slate-500">team@qurancompanion.app</p>
              </div>
            </a>
            <div className="flex items-center gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-700/20">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 flex items-center justify-center">
                <MessageSquare className="w-5 h-5 text-emerald-400" />
              </div>
              <div>
                <h3 className="text-sm font-semibold text-white">Response Time</h3>
                <p className="text-xs text-slate-500">Usually within 2–3 days</p>
              </div>
            </div>
          </div>

          {/* Contact form */}
          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-6 space-y-4">
            <AnimatePresence mode="wait">
              {sent ? (
                <motion.div
                  key="success"
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="flex flex-col items-center gap-3 py-8 text-center"
                >
                  <div className="w-14 h-14 rounded-full bg-emerald-500/20 flex items-center justify-center">
                    <Check className="w-7 h-7 text-emerald-400" />
                  </div>
                  <h3 className="text-lg font-semibold text-white">Opening your mail app…</h3>
                  <p className="text-sm text-slate-400 max-w-xs">
                    We've pre-filled a message to team@qurancompanion.app in your email client — just hit send there.
                  </p>
                  <button
                    onClick={() => setSent(false)}
                    className="mt-2 text-sm text-emerald-400 hover:underline"
                  >
                    Send another message
                  </button>
                </motion.div>
              ) : (
                <motion.form
                  key="form"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  onSubmit={handleSubmit}
                  className="space-y-4"
                >
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Name</label>
                    <input
                      type="text"
                      value={form.name}
                      onChange={(e) => setForm({ ...form, name: e.target.value })}
                      placeholder="Your name"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Email</label>
                    <input
                      type="email"
                      value={form.email}
                      onChange={(e) => setForm({ ...form, email: e.target.value })}
                      placeholder="you@example.com"
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <label className="text-xs font-medium text-slate-400">Message</label>
                    <textarea
                      value={form.message}
                      onChange={(e) => setForm({ ...form, message: e.target.value })}
                      placeholder="Write your message here..."
                      rows={5}
                      className="w-full px-4 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 focus:ring-1 focus:ring-emerald-500/20 transition-all text-sm resize-none"
                    />
                  </div>

                  {error && (
                    <p className="text-xs text-red-400">{error}</p>
                  )}

                  <button
                    type="submit"
                    disabled={sending}
                    className="w-full py-3 rounded-xl bg-emerald-500 text-slate-900 font-medium hover:bg-emerald-400 transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {sending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Sending...
                      </>
                    ) : (
                      <>
                        <Send className="w-4 h-4" />
                        Send Message
                      </>
                    )}
                  </button>
                </motion.form>
              )}
            </AnimatePresence>
          </div>
        </motion.div>
      </div>
    </div>
  );
}