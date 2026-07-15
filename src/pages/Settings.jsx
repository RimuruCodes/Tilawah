import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, User, Trash2, LogOut, Loader2, Mail, AlertTriangle, Download, Upload, Mic2, CheckCircle2, Sparkles, MessageCircle } from "lucide-react";
import { useAuth } from "@/lib/AuthContext";
import { useSubscription } from "@/lib/SubscriptionContext";
import { describeSubscription } from "@/lib/entitlements";
import { openBillingPortalUrl } from "@/lib/subscriptionApi";
import { RecitationLog, MemorizationProgress, DailyStreak, FeedbackReport, RecitationPlanState, exportUserData, importUserData } from "@/lib/localDb";
import { deleteAccount } from "@/lib/localAuth";
import { ASR_MODEL_OPTIONS, getAsrModelPreference, setAsrModelPreference, isAsrEnabled, setAsrEnabled } from "@/lib/asrEngine";
import { ESCALATION_BUDGETS, getEscalationBudgetId, setEscalationBudgetId } from "@/lib/escalation";
import { isPaceMatchEnabled, setPaceMatchEnabled } from "@/lib/paceMatching";
import { isRamadanModeEnabled, setRamadanModeEnabled } from "@/lib/hijri";
import { ARABIC_COMFORT_LEVELS, getArabicComfort, setArabicComfort } from "@/lib/arabicComfort";
import { getLifecycleEvents, clearLifecycleEvents } from "@/lib/lifecycleDebug";
import { getStoredCalibration } from "@/lib/micCalibration";
import CalibrationModal from "@/components/CalibrationModal";
import UpgradeModal from "@/components/quran/UpgradeModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

export default function Settings() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { subscription, isLoadingSubscription, refreshSubscription } = useSubscription();
  const [deleting, setDeleting] = useState(false);
  const [modelPref, setModelPref] = useState(getAsrModelPreference());
  const [escalationBudget, setEscalationBudget] = useState(getEscalationBudgetId());
  const [paceMatch, setPaceMatch] = useState(isPaceMatchEnabled());
  const [asrOn, setAsrOn] = useState(isAsrEnabled());
  const [ramadanMode, setRamadanMode] = useState(isRamadanModeEnabled());
  const [comfortLevel, setComfortLevel] = useState(getArabicComfort());
  const [calibration, setCalibration] = useState(getStoredCalibration());
  const [calibrationOpen, setCalibrationOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  // Bumped to re-render the temporary lifecycle-debug log after clearing it.
  const [, setLifecycleLogCleared] = useState(0);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [portalBusy, setPortalBusy] = useState(false);
  const [portalError, setPortalError] = useState("");
  const [checkoutNote, setCheckoutNote] = useState("");
  const fileInputRef = useRef(null);
  const planInfo = describeSubscription(subscription);
  // The owner's comped plan has no Stripe customer behind it — the billing
  // portal only makes sense for a real monthly/yearly subscription.
  const hasStripePlan = planInfo.active && (subscription?.plan === "monthly" || subscription?.plan === "yearly");

  // Landing back from Stripe Checkout (success_url/cancel_url point here).
  // The webhook usually lands within a couple of seconds — refresh now and
  // once more shortly after, then clean the URL so a reload doesn't repeat this.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;
    window.history.replaceState({}, "", window.location.pathname);
    if (checkout === "success") {
      setCheckoutNote("Payment received — activating your subscription...");
      refreshSubscription();
      const timer = setTimeout(async () => {
        await refreshSubscription();
        setCheckoutNote("");
      }, 2500);
      return () => clearTimeout(timer);
    }
    if (checkout === "cancelled") {
      setCheckoutNote("Checkout was cancelled — nothing was charged.");
    }
  }, [refreshSubscription]);

  const handleManageSubscription = async () => {
    setPortalBusy(true);
    setPortalError("");
    try {
      window.location.assign(await openBillingPortalUrl());
    } catch (err) {
      setPortalBusy(false);
      setPortalError(err.message || "Couldn't open the billing portal — try again in a moment.");
    }
  };

  const handleModelPrefChange = (pref) => {
    setAsrModelPreference(pref);
    setModelPref(pref);
  };

  const handleEscalationBudgetChange = (id) => {
    setEscalationBudgetId(id);
    setEscalationBudget(id);
  };

  const handlePaceMatchChange = (on) => {
    setPaceMatchEnabled(on);
    setPaceMatch(on);
  };

  const downloadJson = (payload, baseName) => {
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${baseName}-${new Date().toISOString().split("T")[0]}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleExport = () => {
    downloadJson(exportUserData(), "quran-companion-backup");
  };

  // Exports only the explicit "this result seems off" reports (text-only,
  // see src/lib/feedbackReports.js) so they can be shared for review
  // independently of the full data backup.
  const handleExportFeedback = async () => {
    const reports = await FeedbackReport.list("-created_date");
    downloadJson({ exportedAt: new Date().toISOString(), feedback_reports: reports }, "quran-companion-feedback");
  };

  const handleImportFile = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportMessage("");
    try {
      const text = await file.text();
      const payload = JSON.parse(text);
      importUserData(payload);
      setImportMessage("Data restored successfully.");
    } catch (err) {
      setImportMessage(err.message || "Couldn't read that file — make sure it's a Quran Companion export.");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleDeleteAccount = async () => {
    setDeleting(true);
    try {
      await Promise.all([
        RecitationLog.deleteMany({ created_by_id: user?.id }),
        MemorizationProgress.deleteMany({ created_by_id: user?.id }),
        DailyStreak.deleteMany({ created_by_id: user?.id }),
        FeedbackReport.deleteMany({ created_by_id: user?.id }),
        // Every exportable collection must also be deletable — this list
        // mirrors EXPORTABLE_COLLECTIONS in localDb.js.
        RecitationPlanState.deleteMany({ created_by_id: user?.id }),
      ]);
      if (user?.id) deleteAccount(user.id);
    } catch (err) {
      // proceed to logout even if deletes fail
    }
    logout();
  };

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-8">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate(-1)}
            aria-label="Go back"
            className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-2xl font-bold text-white">Settings</h1>
        </div>

        {/* Profile */}
        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-6 space-y-4"
        >
          <div className="flex items-center gap-2 text-slate-400">
            <User className="w-5 h-5" />
            <h2 className="text-sm font-medium">Profile</h2>
          </div>
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center">
              <span className="text-lg font-bold text-emerald-400">
                {user?.email?.[0]?.toUpperCase() || "?"}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-white">{user?.full_name || "Quran Companion User"}</p>
              <p className="text-xs text-slate-500 flex items-center gap-1">
                <Mail className="w-3 h-3" />
                {user?.email || "—"}
              </p>
            </div>
          </div>
        </motion.div>

        {/* Subscription */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 px-1">Subscription</h2>
          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-sm font-medium text-white">
                  {isLoadingSubscription ? "Checking plan..." : planInfo.label}
                </h3>
              </div>
              {planInfo.active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
                  Active
                </span>
              )}
            </div>

            {checkoutNote && (
              <p className="text-xs text-emerald-400">{checkoutNote}</p>
            )}
            {!isLoadingSubscription && planInfo.detail && (
              <p className="text-xs text-slate-500">{planInfo.detail}</p>
            )}
            {!isLoadingSubscription && !planInfo.active && (
              <p className="text-xs text-slate-500">
                Unlock "Recite all" continuous recitation and Tajweed Trends with a subscription. Single-ayah recitation analysis is free.
              </p>
            )}
            {hasStripePlan && (
              <>
                <button
                  onClick={handleManageSubscription}
                  disabled={portalBusy}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 disabled:opacity-50 transition-colors"
                >
                  {portalBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : "Manage subscription"}
                </button>
                {portalError && <p className="text-xs text-orange-400">{portalError}</p>}
                <p className="text-[10px] text-slate-600 text-center">
                  Change plan, update card, or cancel — handled on Stripe's secure page.
                </p>
              </>
            )}
            {planInfo.active ? (
              <Link
                to="/contact"
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                <MessageCircle className="w-4 h-4" />
                Questions about your subscription? Contact us
              </Link>
            ) : (
              <button
                onClick={() => setUpgradeOpen(true)}
                className="w-full px-4 py-2.5 rounded-xl bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 transition-colors"
              >
                Upgrade
              </button>
            )}
          </div>
        </div>

        {/* Account Actions */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 px-1">Account</h2>

          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 p-4 rounded-2xl bg-slate-900/50 border border-slate-700/20 hover:border-slate-600/30 transition-colors text-left"
          >
            <div className="w-10 h-10 rounded-xl bg-slate-700/30 flex items-center justify-center">
              <LogOut className="w-5 h-5 text-slate-400" />
            </div>
            <div>
              <h3 className="text-sm font-medium text-white">Log Out</h3>
              <p className="text-xs text-slate-500">Sign out of your account</p>
            </div>
          </button>
        </div>

        {/* Recitation Analysis */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 px-1">Recitation Analysis</h2>
          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Mic2 className="w-4 h-4" />
              <h3 className="text-sm font-medium text-white">Speech recognition model</h3>
            </div>
            <p className="text-xs text-slate-500">
              Used for word-accuracy and Tajweed checks. Changing this downloads a different model next time you analyze a recording.
            </p>
            <div className="space-y-2">
              {Object.entries(ASR_MODEL_OPTIONS).map(([key, opt]) => (
                <button
                  key={key}
                  onClick={() => handleModelPrefChange(key)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    modelPref === key
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-slate-800/30 border-slate-700/30 hover:border-slate-600/40"
                  }`}
                >
                  <span className="text-sm text-slate-200">{opt.label}</span>
                  {modelPref === key && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Mic2 className="w-4 h-4" />
              <h3 className="text-sm font-medium text-white">Extra time for a more reliable reading</h3>
            </div>
            <p className="text-xs text-slate-500">
              After showing your result, the app can optionally spend a little longer improving the parts a second attempt
              can legitimately help — refetching reference audio, or (on capable devices) re-checking with a more accurate
              speech model. It never changes your score by "retrying for a better number", and always falls back to the
              result you already have if time runs out.
            </p>
            <div className="space-y-2">
              {Object.values(ESCALATION_BUDGETS).map((opt) => (
                <button
                  key={opt.id}
                  onClick={() => handleEscalationBudgetChange(opt.id)}
                  className={`w-full flex items-center justify-between p-3 rounded-xl border text-left transition-colors ${
                    escalationBudget === opt.id
                      ? "bg-emerald-500/10 border-emerald-500/30"
                      : "bg-slate-800/30 border-slate-700/30 hover:border-slate-600/40"
                  }`}
                >
                  <span className="text-sm text-slate-200">{opt.label}</span>
                  {escalationBudget === opt.id && <CheckCircle2 className="w-4 h-4 text-emerald-400 flex-shrink-0" />}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Mic2 className="w-4 h-4" />
                <h3 className="text-sm font-medium text-white">Word-level Tajweed (speech recognition)</h3>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={asrOn}
                  onChange={(e) => { setAsrEnabled(e.target.checked); setAsrOn(e.target.checked); }}
                  aria-label="Word-level Tajweed (speech recognition)"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 relative after:top-0.5 after:left-0.5" />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              Runs an on-device speech-recognition model for word accuracy and Tajweed timing checks.
              When off, you still get the full acoustic score — only the word-level layer is skipped.
              Defaults off on iPhones/iPads and on any device where this step previously crashed the
              tab (loading the model can exceed a phone browser's memory limit).
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Mic2 className="w-4 h-4" />
                <h3 className="text-sm font-medium text-white">Pace-matched reciter comparison</h3>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={paceMatch}
                  onChange={(e) => handlePaceMatchChange(e.target.checked)}
                  aria-label="Pace-matched reciter comparison"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 relative after:top-0.5 after:left-0.5" />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              When on, single-ayah analysis compares you against whichever reciter's recording is
              closest in length to yours — chosen from audio duration alone, before any scoring, never
              by which reciter gives you a higher score. When off (default), you're always compared to
              the reciter you selected.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 text-slate-400">
                <Sparkles className="w-4 h-4" />
                <h3 className="text-sm font-medium text-white">Ramadan mode</h3>
              </div>
              <label className="inline-flex items-center cursor-pointer">
                <input
                  type="checkbox"
                  checked={ramadanMode}
                  onChange={(e) => { setRamadanModeEnabled(e.target.checked); setRamadanMode(e.target.checked); }}
                  aria-label="Ramadan mode"
                  className="sr-only peer"
                />
                <div className="w-9 h-5 bg-slate-700 rounded-full peer peer-checked:bg-emerald-500 after:content-[''] after:absolute after:h-4 after:w-4 after:rounded-full after:bg-white after:transition-all peer-checked:after:translate-x-4 relative after:top-0.5 after:left-0.5" />
              </label>
            </div>
            <p className="text-xs text-slate-500">
              During Ramadan (Umm al-Qura calendar), the Home screen adds a nightly Taraweeh practice
              suggestion. Turn off to keep Home exactly the same year-round.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Mic2 className="w-4 h-4" />
              <h3 className="text-sm font-medium text-white">Arabic reading comfort</h3>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {ARABIC_COMFORT_LEVELS.map((level) => (
                <button
                  key={level.id}
                  onClick={() => { setArabicComfort(level.id); setComfortLevel(level.id); }}
                  className={`py-2 rounded-xl text-xs font-medium transition-all border ${
                    comfortLevel === level.id
                      ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                      : "bg-slate-800/40 border-slate-700/30 text-slate-400 hover:border-slate-600/40"
                  }`}
                >
                  {level.label}
                </button>
              ))}
            </div>
            <p className="text-xs text-slate-500">
              Sets friendlier defaults (like whether translation starts visible in the reader).
              Never locks anything — every toggle still works as usual.
            </p>
          </div>

          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <div className="flex items-center gap-2 text-slate-400">
              <Mic2 className="w-4 h-4" />
              <h3 className="text-sm font-medium text-white">Microphone calibration</h3>
            </div>
            <p className="text-xs text-slate-500">
              A quick 3-second silence check so the app can tell your voice apart from background
              noise more reliably on this device.
            </p>
            {calibration ? (
              <p className="text-xs text-emerald-400">
                Calibrated (noise floor: {calibration.noiseFloorDb.toFixed(1)} dB)
              </p>
            ) : (
              <p className="text-xs text-slate-500">Not calibrated yet — using default settings.</p>
            )}
            <button
              onClick={() => setCalibrationOpen(true)}
              className="w-full px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
            >
              {calibration ? "Recalibrate" : "Calibrate Now"}
            </button>
          </div>
        </div>

        <CalibrationModal
          open={calibrationOpen}
          onClose={() => {
            setCalibrationOpen(false);
            setCalibration(getStoredCalibration());
          }}
        />

        {/* Data */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 px-1">Data</h2>
          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <p className="text-xs text-slate-500">
              Your recitation history, streaks, and memorization progress live only in this browser.
              Export a backup, or restore one on a new browser/device.
            </p>
            <div className="flex gap-2">
              <button
                onClick={handleExport}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                <Upload className="w-4 h-4" />
                Import
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept="application/json"
                className="hidden"
                onChange={handleImportFile}
              />
            </div>
            {importMessage && <p className="text-xs text-emerald-400">{importMessage}</p>}
            <div className="pt-2 border-t border-slate-800/60 space-y-2">
              <p className="text-xs text-slate-500">
                Flagged a result as "seems off"? Those text-only reports stay on this device — export
                them here if you'd like to share them to help tune the scoring.
              </p>
              <button
                onClick={handleExportFeedback}
                className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-slate-800 text-slate-200 text-sm font-medium hover:bg-slate-700 transition-colors"
              >
                <Download className="w-4 h-4" />
                Export feedback reports
              </button>
            </div>
          </div>
        </div>

        {/* TEMP: lifecycle debug log for the mobile mid-analysis reload
            investigation — readable on the phone itself, since a reload
            wipes the console. Remove with src/lib/lifecycleDebug.js. */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-slate-400 px-1">Lifecycle debug log (temporary)</h2>
          <div className="bg-slate-900/50 border border-slate-700/20 rounded-2xl p-4 space-y-3">
            <p className="text-xs text-slate-500">
              Records page reload/hide and service-worker events across reloads, to diagnose why a result screen disappeared. Look for a
              <span className="text-amber-400"> PREVIOUS-SESSION-DIED-MID-ANALYSIS</span> entry (tab was killed/reloaded by the browser) or an
              <span className="text-amber-400"> sw-controllerchange</span> entry (a service worker took over).
            </p>
            {/* tabIndex + role so keyboard users can scroll and reach this
                log region (it holds no focusable children of its own). */}
            <div tabIndex={0} role="group" aria-label="Lifecycle debug log" className="max-h-64 overflow-y-auto rounded-lg bg-slate-950/60 border border-slate-800 p-2 space-y-1 focus:outline-none focus-visible:ring-1 focus-visible:ring-emerald-500">
              {getLifecycleEvents().length === 0 && (
                <p className="text-[11px] text-slate-600">No events recorded yet.</p>
              )}
              {getLifecycleEvents().slice().reverse().map((e, i) => (
                <p key={i} className={`text-[11px] font-mono break-all ${/DIED|controllerchange/.test(e.type) ? "text-amber-400" : "text-slate-400"}`}>
                  {e.t.slice(11, 19)} <span className="text-slate-200">{e.type}</span>
                  {e.detail ? ` — ${e.detail}` : ""} <span className="text-slate-600">[{e.phase}]</span>
                </p>
              ))}
            </div>
            <button
              onClick={() => { clearLifecycleEvents(); setLifecycleLogCleared((n) => n + 1); }}
              className="w-full px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-xs font-medium hover:bg-slate-700 transition-colors"
            >
              Clear log
            </button>
          </div>
        </div>

        {/* Danger Zone */}
        <div className="space-y-3">
          <h2 className="text-sm font-medium text-red-400/80 px-1 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4" />
            Danger Zone
          </h2>

          <div className="bg-red-950/20 border border-red-500/20 rounded-2xl p-4 flex items-center justify-between gap-4">
            <div className="flex-1">
              <h3 className="text-sm font-medium text-white">Delete Account</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Permanently remove your account and all associated data.
              </p>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <button className="px-4 py-2.5 rounded-xl bg-red-500 text-slate-900 text-sm font-medium hover:bg-red-400 transition-colors flex items-center gap-2 flex-shrink-0">
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              </AlertDialogTrigger>
              <AlertDialogContent className="bg-slate-900 border-slate-700/50">
                <AlertDialogHeader>
                  <AlertDialogTitle className="text-white">Delete your account?</AlertDialogTitle>
                  <AlertDialogDescription className="text-slate-400">
                    This will permanently delete your account and all locally stored data: recitation scores and feedback, memorization progress, streaks, plans, and feedback reports. (Audio recordings are never stored, so there are none to delete.) This cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel className="bg-slate-800 text-slate-300 border-slate-700 hover:bg-slate-700">
                    Cancel
                  </AlertDialogCancel>
                  <AlertDialogAction
                    onClick={handleDeleteAccount}
                    disabled={deleting}
                    className="bg-red-500 text-slate-900 hover:bg-red-400 border-red-500"
                  >
                    {deleting ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin mr-2" />
                        Deleting...
                      </>
                    ) : (
                      "Delete Account"
                    )}
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </div>

        <div className="flex items-center justify-center gap-4 pt-4 pb-2">
          <Link to="/privacy" className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            Privacy Policy
          </Link>
          <Link to="/terms" className="text-xs text-slate-500 hover:text-slate-300 underline underline-offset-2">
            Terms of Service
          </Link>
        </div>
      </div>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureLabel="the full experience" />
    </div>
  );
}