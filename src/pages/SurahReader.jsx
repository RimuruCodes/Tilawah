import React, { useState, useEffect, useCallback, useMemo, lazy, Suspense } from "react";
import { useParams, Link, useNavigate } from "react-router-dom";
import { defaultShowTranslation } from "@/lib/arabicComfort";
import { getArabicTextScale } from "@/lib/arabicTextSize";
import { MemorizationProgress, RecitationLog } from "@/lib/localDb";
import { motion } from "framer-motion";
import { ArrowLeft, Eye, EyeOff, Languages, Loader2, BookOpen, ChevronLeft, ChevronRight, Mic } from "lucide-react";
import { SURAHS, RECITERS, fetchSurahText } from "@/lib/quranData";
import { findTajweedRules } from "@/lib/tajweedRules";
import AyahDisplay from "@/components/quran/AyahDisplay";
import EmptyState from "@/components/EmptyState";
import IconButton from "@/components/IconButton";
import SupportButton from "@/components/SupportButton";
import AudioPlayer from "@/components/quran/AudioPlayer";
import SupportModal from "@/components/quran/SupportModal";
import UpgradeModal from "@/components/quran/UpgradeModal";
import { useSubscription } from "@/lib/SubscriptionContext";
import { canAccessFeature, GATED_FEATURES } from "@/lib/entitlements";
import { summarizeLastScores } from "@/lib/ayahScores";
import { PRACTICE_FOCUS_RULES, getDefaultPracticeFocusRule } from "@/lib/practiceFocus";

// Per-rule filter-chip color, presentation-only and kept here; ids/labels
// come from practiceFocus.js, the single source of truth shared with
// Settings' default-focus-rule picker. Uses the `rule-*` categorical
// tokens (tailwind.config.js/index.css) rather than raw Tailwind colors —
// those measured 1.6-2.6:1 against the new light-theme backgrounds, so
// this needed real per-theme values, not a like-for-like class swap.
// `madd` reuses `ink-accent` directly: its dark-mode color already IS
// ink-accent's dark value (both are emerald-400).
const PRACTICE_RULE_COLORS = {
  qalqalah: "text-rule-qalqalah bg-rule-qalqalah/10 border-rule-qalqalah/20",
  ghunnah: "text-rule-ghunnah bg-rule-ghunnah/10 border-rule-ghunnah/20",
  iqlab: "text-rule-iqlab bg-rule-iqlab/10 border-rule-iqlab/20",
  idgham_ghunnah: "text-rule-idgham bg-rule-idgham/10 border-rule-idgham/20",
  ikhfa: "text-rule-ikhfa bg-rule-ikhfa/10 border-rule-ikhfa/20",
  madd: "text-ink-accent bg-ink-accent/10 border-ink-accent/20",
};
const PRACTICE_RULES = PRACTICE_FOCUS_RULES.map((r) => ({ ...r, key: r.id, color: PRACTICE_RULE_COLORS[r.id] }));

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
  // { ayahNumber, wordIndex } | null — which word is currently playing,
  // only ever set for reciter+ayah pairs with QUA ground-truth timing
  // (see AudioPlayer.jsx/quaReferenceData.js); null everywhere else.
  const [highlightedWord, setHighlightedWord] = useState(null);
  const [selectedReciter, setSelectedReciter] = useState(RECITERS[0].id);
  const [recordingAyah, setRecordingAyah] = useState(null);
  const [memorizationMap, setMemorizationMap] = useState({});
  const [lastScoreMap, setLastScoreMap] = useState({});
  const [supportOpen, setSupportOpen] = useState(false);
  const [continuousOpen, setContinuousOpen] = useState(false);
  // Seeded from the Settings default focus rule (null = "All ayahs", the
  // pre-existing default); corrected below once this surah's rule counts
  // are known, in case the default rule doesn't occur in this surah at all.
  const [practiceRuleFilter, setPracticeRuleFilter] = useState(getDefaultPracticeFocusRule());
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

  // A default focus rule (Settings) that happens not to occur anywhere in
  // THIS surah would otherwise land on the "no ayahs" empty state every
  // time it's opened — fall back to "All ayahs" instead. Only ever fires
  // for that case: a rule the user actually clicked always has count > 0
  // (the filter buttons below only render when it does), so this never
  // fights a real selection.
  useEffect(() => {
    if (!loading && practiceRuleFilter && !practiceRuleCounts[practiceRuleFilter]) {
      setPracticeRuleFilter(null);
    }
  }, [loading, practiceRuleFilter, practiceRuleCounts]);

  const handleAyahHighlight = useCallback((ayahNum) => {
    setHighlightedAyah(ayahNum);
    const el = document.getElementById(`ayah-${ayahNum}`);
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, []);

  // `word` is the full { wordIndex, startSec, endSec, confidence } object
  // (or null) from AudioPlayer's word/letter lookup — confidence rides
  // along so AyahDisplay can style a low-confidence (ASR-estimated) word
  // differently from a verified (QUA) one. `charIndex` is present only when
  // AudioPlayer resolved letter-level timing for this ayah (see
  // letterTiming.js); AyahDisplay falls back to whole-word highlighting
  // when it's absent.
  const handleWordHighlight = useCallback((ayahNum, word) => {
    setHighlightedWord(word ? { ayahNumber: ayahNum, ...word } : null);
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
      <div className="min-h-screen bg-ink-bg flex items-center justify-center">
        <div className="text-center">
          <BookOpen className="w-12 h-12 text-ink-border mx-auto mb-4" />
          <p className="text-ink-text-3">Surah not found</p>
          <Link to="/" className="text-ink-accent text-sm mt-2 inline-block hover:underline">Go back</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-ink-bg">
      <div className="max-w-3xl mx-auto px-4 pt-6 pb-[calc(1.5rem+env(safe-area-inset-bottom))] space-y-6">
        {/* Top Bar */}
        <div className="flex items-center justify-between">
          <button
            onClick={() => navigate(-1)}
            className="flex items-center gap-2 text-ink-text-2 hover:text-ink-text transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span className="text-sm">All Surahs</span>
          </button>
          <div className="flex items-center gap-2">
            <IconButton
              icon={Languages}
              label={showTranslation ? "Hide translation" : "Show translation"}
              pressed={showTranslation}
              activeColor="emerald"
              onClick={() => setShowTranslation(!showTranslation)}
              className="p-2 min-h-[44px] min-w-[44px]"
            />
            <IconButton
              icon={hideMode ? EyeOff : Eye}
              label={hideMode ? "Disable memorization mode" : "Enable memorization mode"}
              pressed={hideMode}
              activeColor="amber"
              onClick={() => setHideMode(!hideMode)}
              className="p-2 min-h-[44px] min-w-[44px]"
            />
            <button
              onClick={handleContinuousClick}
              className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-ink-accent/10 text-ink-accent hover:bg-ink-accent/20 transition-colors border border-ink-accent/20 text-sm font-medium"
              title="Recite the entire Surah"
            >
              <Mic className="w-4 h-4" />
              Recite All
            </button>
            <SupportButton onClick={() => setSupportOpen(true)} />
          </div>
        </div>

        {/* Surah Header */}
        <motion.div
          initial={{ opacity: 0, y: -10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-3 py-6"
        >
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-ink-accent-soft border border-ink-accent/20">
            <span className="text-xs text-ink-accent font-medium">{surah.type}</span>
            <span className="text-ink-text-3">·</span>
            <span className="text-xs text-ink-text-2">{surah.ayahs} Ayahs</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-arabic text-ink-accent" dir="rtl" style={{ fontFamily: "var(--font-arabic)" }}>
            {surah.arabic}
          </h1>
          <h2 className="text-xl text-ink-text font-semibold">{surah.name}</h2>
          <p className="text-sm text-ink-text-3">{surah.meaning}</p>
        </motion.div>

        {/* Bismillah */}
        {surahNumber !== 1 && surahNumber !== 9 && (
          <div className="text-center py-4" dir="rtl">
            <p className="text-2xl text-ink-accent/60" style={{ fontFamily: "var(--font-arabic)", lineHeight: "2.5" }}>
              بِسْمِ ٱللَّهِ ٱلرَّحْمَـٰنِ ٱلرَّحِيمِ
            </p>
          </div>
        )}

        {/* Tajweed Practice Filter */}
        {!loading && Object.values(practiceRuleCounts).some((n) => n > 0) && (
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-ink-text-3 mr-1">Practice:</span>
            <button
              onClick={() => setPracticeRuleFilter(null)}
              className={`text-xs px-3 py-1.5 rounded-full border transition-colors ${
                !practiceRuleFilter ? "bg-ink-surface-2 text-ink-text border-ink-border" : "bg-ink-surface-2/40 text-ink-text-3 border-ink-border/60 hover:text-ink-text-2"
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
                    practiceRuleFilter === rule.key ? rule.color : "bg-ink-surface-2/40 text-ink-text-3 border-ink-border/60 hover:text-ink-text-2"
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
            onWordHighlight={handleWordHighlight}
            selectedReciter={selectedReciter}
            onReciterChange={setSelectedReciter}
          />
        </div>

        {/* Memorization Mode Banner */}
        {hideMode && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            className="bg-ink-gold/10 border border-ink-gold/20 rounded-xl p-3 flex items-center gap-3"
          >
            <EyeOff className="w-4 h-4 text-ink-gold flex-shrink-0" />
            <p className="text-xs text-ink-gold/80">
              <span className="font-medium">Active Recall Mode</span> — Verses are hidden. Tap each to reveal and test your memory. This leverages spaced repetition for deeper retention.
            </p>
          </motion.div>
        )}

        {/* Ayahs */}
        {loading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 className="w-8 h-8 text-ink-accent animate-spin" />
          </div>
        ) : loadError ? (
          <div className="text-center py-16 bg-ink-surface/30 rounded-2xl border border-ink-border/40 space-y-4">
            <p className="text-ink-text-2 text-sm px-6">{loadError}</p>
            <button
              onClick={load}
              className="px-5 py-2 rounded-lg bg-ink-accent text-ink-bg text-sm font-medium hover:brightness-110 transition-colors"
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
                  highlightedWordIndex={highlightedWord?.ayahNumber === ayah.number ? highlightedWord.wordIndex : null}
                  highlightedCharIndex={highlightedWord?.ayahNumber === ayah.number ? highlightedWord.charIndex ?? null : null}
                  highlightedWordConfidence={highlightedWord?.ayahNumber === ayah.number ? highlightedWord.confidence : null}
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
        <div className="flex items-center justify-between py-8 border-t border-ink-border/50">
          {prevSurah ? (
            <Link
              to={`/surah/${prevSurah.number}`}
              className="flex items-center gap-2 text-ink-text-2 hover:text-ink-text transition-colors group"
            >
              <ChevronLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
              <div>
                <span className="text-xs text-ink-text-3 block">Previous</span>
                <span className="text-sm">{prevSurah.name}</span>
              </div>
            </Link>
          ) : <div />}
          {nextSurah ? (
            <Link
              to={`/surah/${nextSurah.number}`}
              className="flex items-center gap-2 text-ink-text-2 hover:text-ink-text transition-colors group text-right"
            >
              <div>
                <span className="text-xs text-ink-text-3 block">Next</span>
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