import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { defaultShowTranslation } from "@/lib/arabicComfort";
import { getArabicTextScale } from "@/lib/arabicTextSize";
import { MemorizationProgress, RecitationLog } from "@/lib/localDb";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Languages, Loader2, BookOpen, ChevronLeft, ChevronRight, Heart, Mic } from "lucide-react";
import { SURAHS, RECITERS, fetchSurahText } from "@/lib/quranData";
import { findTajweedRules } from "@/lib/tajweedRules";
import AyahDisplay from "@/components/quran/AyahDisplay";
import EmptyState from "@/components/EmptyState";
import AudioPlayer from "@/components/quran/AudioPlayer";
import SupportModal from "@/components/quran/SupportModal";
import UpgradeModal from "@/components/quran/UpgradeModal";
import { useSubscription } from "@/lib/SubscriptionContext";
import { canAccessFeature, GATED_FEATURES } from "@/lib/entitlements";
import { summarizeLastScores } from "@/lib/ayahScores";

const PRACTICE_RULES = [
  { key: "qalqalah", label: "Qalqalah", color: "text-sky-400 bg-sky-500/10 border-sky-500/20" },
  { key: "ghunnah", label: "Ghunnah", color: "text-purple-400 bg-purple-500/10 border-purple-500/20" },
  { key: "iqlab", label: "Iqlab", color: "text-pink-400 bg-pink-500/10 border-pink-500/20" },
  { key: "idgham_ghunnah", label: "Idgham", color: "text-orange-400 bg-orange-500/10 border-orange-500/20" },
  { key: "ikhfa", label: "Ikhfa", color: "text-cyan-400 bg-cyan-500/10 border-cyan-500/20" },
  { key: "madd", label: "Madd", color: "text-emerald-400 bg-emerald-500/10 border-emerald-500/20" },
];

// Lazy-loaded: these pull in the ASR/speech-recognition chain
// (@huggingface/transformers + ONNX Runtime Web), which is heavy and only
// needed once someone actually opens a recording flow.
const RecordingModal = lazy(() => import("@/components/quran/RecordingModal"));
const ContinuousRecitation = lazy(() => import("@/components/quran/ContinuousRecitation"));

export default function SurahReader() {
  const { number } = useParams();
  const navigate = useNavigate();
  const surahNumber = parseInt(number);
  const surah = SURAHS.find(s => s.number === surahNumber);

  const [ayahs, setAyahs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(null);
  // Seeded from the onboarding Arabic-comfort answer (fluent readers start
  // with just the mushaf text); the toggle in the header always wins after.
  const [showTranslation, setShowTranslation] = useState(defaultShowTranslation());
  // Reader-wide Arabic size (Settings preference, seeded from comfort level).
  const [arabicScale] = useState(getArabicTextScale());
  const [hideMode, setHideMode] = useState(false);
  const [highlightedAyah, setHighlightedAyah] = useState(null);
  const [selectedReciter, setSelectedReciter] = useState(RECITERS[0].id);
  const [recordingAyah, setRecordingAyah] = useState(null);
  const [memorizationMap, setMemorizationMap] = useState({});
  const [lastScoreMap, setLastScoreMap] = useState({});
  const [supportOpen, setSupportOpen] = useState(false);
  const [continuousOpen, setContinuousOpen] = useState(false);
  const [practiceRuleFilter, setPracticeRuleFilter] = useState(null);
  const [upgradeFeature, setUpgradeFeature] = useState(null);
  const { subscription } = useSubscription();

  // Per-ayah "last score" badges in the reader, so someone can see how a
  // specific ayah's practice is trending without opening the Progress page.
  const loadLastScores = useCallback(async () => {
    const logs = await RecitationLog.filter({ surah_number: surahNumber });
    setLastScoreMap(summarizeLastScores(logs));
  }, [surahNumber]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [text, progress] = await Promise.all([
        fetchSurahText(surahNumber),
        MemorizationProgress.filter({ surah_number: surahNumber })
      ]);
      setAyahs(text);

      const mMap = {};
      progress.forEach(p => { mMap[p.ayah_number] = p.status; });
      setMemorizationMap(mMap);
    } catch (err) {
      setAyahs([]);
      setLoadError(err?.message || "Couldn't load this surah. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }, [surahNumber]);

  useEffect(() => {
    load();
    loadLastScores();
  }, [load, loadLastScores]);

  // Deterministic, text-only: which Tajweed rule categories appear in each
  // ayah, so "practice mode" can filter down to just the ayahs containing
  // a given rule. No audio needed for this part.
  const ayahRuleCategories = useMemo(() => {
    const map = {};
    ayahs.forEach((ayah) => {
      const { hits } = findTajweedRules(ayah.arabic);
      const categories = new Set(hits.map((h) => (h.ruleType.startsWith("madd") ? "madd" : h.ruleType)));
      map[ayah.number] = categories;
    });
    return map;
  }, [ayahs]);

  const practiceRuleCounts = useMemo(() => {
    const counts = Object.fromEntries(PRACTICE_RULES.map((r) => [r.key, 0]));
    Object.values(ayahRuleCategories).forEach((categories) => {
      categories.forEach((c) => { if (counts[c] != null) counts[c]++; });
    });
    return counts;
  }, [ayahRuleCategories]);

  const visibleAyahs = useMemo(() => {
    if (!practiceRuleFilter) return ayahs;
    return ayahs.filter((ayah) => ayahRuleCategories[ayah.number]?.has(practiceRuleFilter));
  }, [ayahs, practiceRuleFilter, ayahRuleCategories]);

  const handleAyahHighlight = useCallback((ayahNum) => {
    setHighlightedAyah(ayahNum);
    const el = document.getElementById(`ayah-${ayahNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  const handleRecordClick = (ayah) => {
    if (!canAccessFeature(GATED_FEATURES.SINGLE_AYAH_ANALYSIS, subscription)) {
      setUpgradeFeature({ label: "Recitation Analysis" });
      return;
    }
    setRecordingAyah(ayah);
  };

  const handleContinuousClick = () => {
    if (!canAccessFeature(GATED_FEATURES.CONTINUOUS_RECITATION, subscription)) {
      setUpgradeFeature({ label: "Continuous Recitation" });
      return;
    }
    setContinuousOpen(true);
  };

  const reciter = RECITERS.find(r => r.id === selectedReciter) || RECITERS[0];

  const prevSurah = surahNumber > 1 ? SURAHS.find(s => s.number === surahNumber - 1) : null;
  const nextSurah = surahNumber < 114 ? SURAHS.find(s => s.number === surahNumber + 1) : null;

  if (!surah) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-slate-700 mx-auto mb-4" />
          <p className="text-slate-500">Surah not found</p>
          <Link to="/" className="text-emerald-400 text-sm mt-2 inline-block hover:underline">Go back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">All Surahs</span>
          </button>
          <div className="flex items-center gap-2">
            <button
              onClick={() => setShowTranslation(!showTranslation)}
              className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${showTranslation ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-800/50 text-slate-500'}`}
              title={showTranslation ? "Hide translation" : "Show translation"}
              aria-label={showTranslation ? "Hide translation" : "Show translation"}
              aria-pressed={showTranslation}
            >
              <Languages className="w-4 h-4" />
            </button>
            <button
              onClick={() => setHideMode(!hideMode)}
              className={`p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg transition-colors ${hideMode ? 'bg-amber-500/20 text-amber-400' : 'bg-slate-800/50 text-slate-500'}`}
              title={hideMode ? "Disable memorization mode" : "Enable memorization mode"}
              aria-label={hideMode ? "Disable memorization mode" : "Enable memorization mode"}
              aria-pressed={hideMode}
            >
              {hideMode ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>
            <button
              onClick={handleContinuousClick}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 transition-colors border border-emerald-500/20 text-sm font-medium"
              title="Recite the entire Surah"
            >
              <Mic className="w-4 h-4" />
              Recite All
            </button>
            <button
              onClick={() => setSupportOpen(true)}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-amber-500 text-slate-900 font-semibold text-sm hover:bg-amber-400 transition-colors shadow-sm shadow-amber-500/20"
              title="Support the App"
            >
              <Heart className="w-4 h-4" />
              Donate
            </button>
          </div>
        </div>

        {/* Surah Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3 py-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-500/10 border border-emerald-500/20">
            <span className="text-xs text-emerald-400 font-medium">{surah.type}</span>
            <span className="text-slate-600">·</span>
            <span className="text-xs text-slate-400">{surah.ayahs} Ayahs</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-arabic text-emerald-300" dir="rtl" style={{ fontFamily: "'Scheherazade New', serif" }}>
            {surah.arabic}
          </h1>
          <h2 className="text-xl text-white font-semibold">{surah.name}</h2>
          <p className="text-sm text-slate-500">{surah.meaning}</p>
        </motion.div>

        {/* Bismillah */}
        {surahNumber !== 1 && surahNumber !== 9 && (
          <div className="text-center py-4" dir="rtl">
            <p className="text-2xl text-emerald-300/60" style={{ fontFamily: "'Scheherazade New', serif", lineHeight: "2.5" }}>
              بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
            </p>
          </div>
        )}

        {/* Tajweed Practice Filter */}
        {!loading && Object.values(practiceRuleCounts).some((n) => n > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500 mr-1">Practice:</span>
            <button
              onClick={() => setPracticeRuleFilter(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !practiceRuleFilter ? "bg-slate-700 text-white border-slate-600" : "bg-slate-800/40 text-slate-500 border-slate-700/30 hover:text-slate-300"
              }`}
            >
              All ayahs
            </button>
            {PRACTICE_RULES.map((rule) => (
              practiceRuleCounts[rule.key] > 0 && (
                <button
                  key={rule.key}
                  onClick={() => setPracticeRuleFilter(practiceRuleFilter === rule.key ? null : rule.key)}
                  className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                    practiceRuleFilter === rule.key ? rule.color : "bg-slate-800/40 text-slate-500 border-slate-700/30 hover:text-slate-300"
                  }`}
                >
                  {rule.label} ({practiceRuleCounts[rule.key]})
                </button>
              )
            ))}
          </div>
        )}

        {/* Audio Player */}
        <div className="sticky top-[calc(1rem+env(safe-area-inset-top))] z-30">
          <AudioPlayer
            surahNumber={surahNumber}
            ayahs={ayahs}
            onAyahHighlight={handleAyahHighlight}
            selectedReciter={selectedReciter}
            onReciterChange={setSelectedReciter}
          />
        </div>

        {/* Memorization Mode Banner */}
        {hideMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-3 flex items-center gap-3"
          >
            <EyeOff className="w-4 h-4 text-amber-400 flex-shrink-0" />
            <p className="text-xs text-amber-300/80">
              <span className="font-medium">Active Recall Mode</span> — Verses are hidden. Tap each to reveal and test your memory. This leverages spaced repetition for deeper retention.
            </p>
          </motion.div>
        )}

        {/* Ayahs */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 bg-slate-900/30 rounded-2xl border border-slate-700/20 space-y-4">
            <p className="text-slate-400 text-sm px-6">{loadError}</p>
            <button
              onClick={load}
              className="px-5 py-2 rounded-lg bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 transition-colors"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {visibleAyahs.map((ayah) => (
              <div key={ayah.number} id={`ayah-${ayah.number}`}>
                {practiceRuleFilter && (
                  <div className="flex items-center gap-1.5 mb-1.5 px-1">
                    {[...(ayahRuleCategories[ayah.number] || [])].map((cat) => {
                      const rule = PRACTICE_RULES.find((r) => r.key === cat);
                      if (!rule) return null;
                      return (
                        <span key={cat} className={`text-[10px] px-2 py-0.5 rounded-full border ${rule.color}`}>
                          {rule.label}
                        </span>
                      );
                    })}
                  </div>
                )}
                <AyahDisplay
                  ayah={ayah}
                  surahNumber={surahNumber}
                  arabicScale={arabicScale}
                  isHighlighted={highlightedAyah === ayah.number}
                  memorizationStatus={memorizationMap[ayah.number]}
                  lastScore={lastScoreMap[ayah.number]}
                  showTranslation={showTranslation}
                  hideMode={hideMode}
                  onRecordClick={handleRecordClick}
                />
              </div>
            ))}
            {practiceRuleFilter && visibleAyahs.length === 0 && (
              <EmptyState
                title={`No ${PRACTICE_RULES.find(r => r.key === practiceRuleFilter)?.label} here`}
                message="This surah has no ayahs with that Tajweed rule. Try another rule, or show every ayah."
                actionLabel="Show all ayahs"
                onAction={() => setPracticeRuleFilter(null)}
              />
            )}
          </div>
        )}

        {/* Navigation */}
        <div className="flex items-center justify-between py-8 border-t border-slate-800/50">
          {prevSurah ? (
            <Link
              to={`/surah/${prevSurah.number}`}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <div>
                <span className="text-xs text-slate-600 block">Previous</span>
                <span className="text-sm">{prevSurah.name}</span>
              </div>
            </Link>
          ) : <div />}
          {nextSurah ? (
            <Link
              to={`/surah/${nextSurah.number}`}
              className="flex items-center gap-2 text-slate-400 hover:text-white transition-colors group text-right"
            >
              <div>
                <span className="text-xs text-slate-600 block">Next</span>
                <span className="text-sm">{nextSurah.name}</span>
              </div>
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </Link>
          ) : <div />}
        </div>
      </div>

      {/* Recording Modal */}
      <Suspense fallback={null}>
        {!!recordingAyah && (
          <RecordingModal
            open={!!recordingAyah}
            onClose={() => setRecordingAyah(null)}
            ayah={recordingAyah}
            surahName={surah.name}
            surahNumber={surahNumber}
            reciterName={reciter.name}
            reciterFolder={reciter.folder}
            onRecitationSaved={loadLastScores}
          />
        )}
      </Suspense>

      <SupportModal open={supportOpen} onClose={() => setSupportOpen(false)} />

      <Suspense fallback={null}>
        {continuousOpen && (
          <ContinuousRecitation
            open={continuousOpen}
            onClose={() => setContinuousOpen(false)}
            ayahs={ayahs}
            surahName={surah.name}
            surahNumber={surahNumber}
            reciterName={reciter.name}
            reciterFolder={reciter.folder}
            onRecitationSaved={loadLastScores}
          />
        )}
      </Suspense>

      <UpgradeModal
        open={!!upgradeFeature}
        onClose={() => setUpgradeFeature(null)}
        featureLabel={upgradeFeature?.label}
      />
    </div>
  );
}