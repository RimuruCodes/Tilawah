import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ScrollText, Search, ChevronRight, ArrowLeft, Loader2, AlertTriangle, Download, Sparkles, ChevronLeft } from "lucide-react";
import { HADITH_COLLECTIONS, getBooks, getBookHadiths, searchCollection, isCollectionLoadedForSearch } from "@/lib/hadithData";
import EmptyState from "@/components/EmptyState";
import { DUAS, DUA_CATEGORIES } from "@/lib/duasData";
import { HADITH_TOPICS, TOPIC_ENTRIES_PER_BOOK } from "@/lib/hadithTopics";
import { Dialog, DialogContent } from "@/components/ui/dialog";

// Hadith browser: Sahih al-Bukhari and Sahih Muslim only — see the
// disclaimer block at the bottom of the page for the content policy.
export default function Hadith() {
  const [collectionId, setCollectionId] = useState("bukhari");
  const [openBook, setOpenBook] = useState(null); // {number, name} | null
  const [entries, setEntries] = useState(null);
  const [loadError, setLoadError] = useState("");
  // Bumped by the retry button to force the book/topic effects below to
  // re-run without touching their own cancellation-guard logic.
  const [retryTick, setRetryTick] = useState(0);
  const [bookFilter, setBookFilter] = useState("");
  const [mode, setMode] = useState("browse"); // browse | search | topics | duas
  const [duaCategory, setDuaCategory] = useState("daily");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState(null);
  const [searching, setSearching] = useState(false);
  const [searchReady, setSearchReady] = useState(false);
  const [activeTopic, setActiveTopic] = useState(HADITH_TOPICS[0].id);
  const [topicGroups, setTopicGroups] = useState(null); // [{collectionId, bookNumber, bookName, entries}] | null
  const [topicLoading, setTopicLoading] = useState(false);
  // The single hadith currently open in the detail view: { list, index,
  // collectionName, accent } | null. Keeping the whole list + index (rather
  // than just the one hadith) lets the detail view offer Previous/Next
  // through whatever list it was opened from.
  const [viewingHadith, setViewingHadith] = useState(null);

  const collection = HADITH_COLLECTIONS.find((c) => c.id === collectionId);
  const books = useMemo(() => getBooks(collectionId), [collectionId]);
  const filteredBooks = useMemo(() => {
    const q = bookFilter.trim().toLowerCase();
    if (!q) return books;
    return books.filter((b) => b.name.toLowerCase().includes(q) || String(b.number) === q);
  }, [books, bookFilter]);

  useEffect(() => {
    setSearchReady(isCollectionLoadedForSearch(collectionId));
  }, [collectionId]);

  // Load a book's hadith when opened.
  useEffect(() => {
    if (!openBook) return undefined;
    let cancelled = false;
    setEntries(null);
    setLoadError("");
    getBookHadiths(collectionId, openBook.number)
      .then((data) => { if (!cancelled) setEntries(data); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Couldn't load this book — check your connection and try again."); });
    return () => { cancelled = true; };
  }, [collectionId, openBook, retryTick]);

  // Load the books mapped to the active topic (Topics mode) — each is a
  // real, already-cited Bukhari/Muslim book fetched through the same
  // getBookHadiths used by Browse mode, just curated by theme.
  useEffect(() => {
    if (mode !== "topics") return undefined;
    let cancelled = false;
    const topic = HADITH_TOPICS.find((t) => t.id === activeTopic);
    setTopicGroups(null);
    setTopicLoading(true);
    setLoadError("");
    Promise.all(
      topic.books.map(async ({ collectionId, bookNumber }) => {
        const bookName = getBooks(collectionId).find((b) => b.number === bookNumber)?.name || "";
        const entries = await getBookHadiths(collectionId, bookNumber);
        return { collectionId, bookNumber, bookName, entries: entries.slice(0, TOPIC_ENTRIES_PER_BOOK) };
      })
    )
      .then((groups) => { if (!cancelled) setTopicGroups(groups); })
      .catch((err) => { if (!cancelled) setLoadError(err.message || "Couldn't load this topic — check your connection and try again."); })
      .finally(() => { if (!cancelled) setTopicLoading(false); });
    return () => { cancelled = true; };
  }, [mode, activeTopic, retryTick]);

  const switchCollection = (id) => {
    setCollectionId(id);
    setOpenBook(null);
    setEntries(null);
    setSearchResults(null);
    setSearchQuery("");
    setMode("browse");
  };

  const retryLoad = () => {
    setLoadError("");
    if (mode === "search") {
      runSearch();
    } else {
      setRetryTick((t) => t + 1);
    }
  };

  const runSearch = async () => {
    if (searchQuery.trim().length < 3) return;
    setSearching(true);
    setSearchResults(null);
    try {
      const results = await searchCollection(collectionId, searchQuery);
      setSearchResults(results);
      setSearchReady(true);
    } catch (err) {
      setLoadError(err.message || "Search failed — check your connection and try again.");
    } finally {
      setSearching(false);
    }
  };

  return (
    <div className="min-h-screen bg-ink-bg">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-ink-accent" />
            <h1 className="text-2xl font-bold text-ink-text">Hadith</h1>
          </div>
          <p className="text-xs text-ink-text-3">Authentic (Sahih) narrations from the two Sahih collections.</p>
        </header>

        {/* Mode toggle */}
        <div className="flex gap-2">
          {[
            { key: "browse", label: "Browse by book" },
            { key: "search", label: "Search" },
            { key: "topics", label: "Topics" },
            { key: "duas", label: "Duas" },
          ].map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key);
                if (m.key !== "search") setSearchResults(null);
                if (m.key !== "browse") setOpenBook(null);
              }}
              className={`px-4 py-1.5 rounded-full text-xs font-medium transition-all ${
                mode === m.key ? "bg-ink-accent text-ink-bg" : "bg-ink-surface-2/50 text-ink-text-2 border border-ink-border/60"
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Collection toggle (browse/search only — Topics spans both collections, Duas has none) */}
        {mode !== "duas" && mode !== "topics" && (
          <div className="grid grid-cols-2 gap-2">
            {HADITH_COLLECTIONS.map((c) => (
              <button
                key={c.id}
                onClick={() => switchCollection(c.id)}
                className={`py-2.5 rounded-xl text-sm font-medium transition-all border ${
                  collectionId === c.id
                    ? "bg-ink-accent-soft border-ink-accent/40 text-ink-accent"
                    : "bg-ink-surface/50 border-ink-border/40 text-ink-text-2 hover:border-ink-border"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-2 bg-ink-danger/10 border border-ink-danger/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-ink-danger flex-shrink-0" />
            <p className="text-xs text-ink-danger flex-1">{loadError}</p>
            <button
              onClick={retryLoad}
              className="px-3 py-1.5 rounded-xl bg-ink-danger/20 text-ink-danger text-xs font-medium hover:bg-ink-danger/30 transition-colors flex-shrink-0"
            >
              Try again
            </button>
          </div>
        )}

        {/* SEARCH MODE */}
        {mode === "search" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-text-3" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder={`Search ${collection.name} (English text)...`}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-ink-surface-2/50 border border-ink-border/60 text-ink-text placeholder:text-ink-text-3 focus:outline-none focus:border-ink-accent/40 text-sm"
                />
              </div>
              <button
                onClick={runSearch}
                disabled={searching || searchQuery.trim().length < 3}
                className="px-4 rounded-xl bg-ink-accent text-ink-bg text-sm font-medium hover:brightness-110 disabled:opacity-40 transition-colors"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>
            {!searchReady && searchResults === null && !searching && (
              <p className="flex items-center gap-1.5 text-[11px] text-ink-text-3">
                <Download className="w-3 h-3" />
                First search downloads the whole collection once (~5MB) so searching stays instant afterward.
              </p>
            )}
            {searching && !searchReady && (
              <p className="text-xs text-ink-text-3 text-center py-4">Downloading {collection.name} for search...</p>
            )}
            {searchResults && (
              searchResults.length === 0 ? (
                <EmptyState
                  icon={Search}
                  title="No matches"
                  message="Try different words — search looks through the English translation."
                />
              ) : (
                <div className="space-y-3">
                  <p className="text-xs text-ink-text-3">
                    {`${searchResults.length}${searchResults.length >= 50 ? "+" : ""} match${searchResults.length === 1 ? "" : "es"}`}
                  </p>
                  {searchResults.map((h, i) => (
                    <HadithCard
                      key={`${collectionId}-${h.number}`}
                      hadith={h}
                      collectionName={collection.name}
                      accent={collectionId}
                      onClick={() => setViewingHadith({ list: searchResults, index: i, collectionName: collection.name, accent: collectionId })}
                    />
                  ))}
                </div>
              )
            )}
          </div>
        )}

        {/* TOPICS MODE — curated theme pointing at real Bukhari/Muslim books */}
        {mode === "topics" && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {HADITH_TOPICS.map((t) => (
                <button
                  key={t.id}
                  onClick={() => setActiveTopic(t.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    activeTopic === t.id
                      ? "bg-ink-accent text-ink-bg"
                      : "bg-ink-surface-2/50 text-ink-text-2 border border-ink-border/60"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-ink-accent/5 border border-ink-accent/15 rounded-xl p-3">
              <Sparkles className="w-4 h-4 text-ink-accent flex-shrink-0 mt-0.5" />
              <p className="text-xs text-ink-text-2">
                {HADITH_TOPICS.find((t) => t.id === activeTopic)?.description}
              </p>
            </div>
            {topicLoading && (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-ink-accent animate-spin" /></div>
            )}
            {!topicLoading && topicGroups && topicGroups.map((group) => (
              <div key={`${group.collectionId}-${group.bookNumber}`} className="space-y-3">
                <h3 className="text-xs font-semibold text-ink-text-3 uppercase tracking-wide px-1">
                  {HADITH_COLLECTIONS.find((c) => c.id === group.collectionId)?.name} · {group.bookName}
                </h3>
                {group.entries.map((h, i) => (
                  <HadithCard
                    key={`${group.collectionId}-${h.number}`}
                    hadith={h}
                    collectionName={HADITH_COLLECTIONS.find((c) => c.id === group.collectionId)?.name}
                    accent={group.collectionId}
                    onClick={() => setViewingHadith({
                      list: group.entries,
                      index: i,
                      collectionName: HADITH_COLLECTIONS.find((c) => c.id === group.collectionId)?.name,
                      accent: group.collectionId,
                    })}
                  />
                ))}
                {group.entries.length === 0 && (
                  <EmptyState title="Nothing to show here" message="This book has no displayable entries yet." />
                )}
              </div>
            ))}
          </div>
        )}

        {/* DUAS MODE — curated, sourced daily supplications */}
        {mode === "duas" && (
          <div className="space-y-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {DUA_CATEGORIES.map((cat) => (
                <button
                  key={cat.id}
                  onClick={() => setDuaCategory(cat.id)}
                  className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                    duaCategory === cat.id
                      ? "bg-ink-accent text-ink-bg"
                      : "bg-ink-surface-2/50 text-ink-text-2 border border-ink-border/60"
                  }`}
                >
                  {cat.label}
                </button>
              ))}
            </div>
            <div className="space-y-3">
              {DUAS.filter((d) => d.category === duaCategory).map((dua) => (
                <motion.div
                  key={dua.id}
                  initial={{ opacity: 0, y: 8 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="rounded-2xl bg-ink-surface/50 border border-ink-border/40 p-4 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-ink-text">{dua.title}</h3>
                  <p dir="rtl" lang="ar" className="font-arabic text-xl leading-loose text-ink-text/90 text-right">
                    {dua.arabic}
                  </p>
                  <p className="text-xs text-ink-text-2 italic">{dua.transliteration}</p>
                  <p className="text-sm text-ink-text-2 leading-relaxed">{dua.translation}</p>
                  <p className="text-[11px] text-ink-text-3 border-t border-ink-border/60 pt-2">{dua.source}</p>
                </motion.div>
              ))}
            </div>
            <p className="text-[11px] text-ink-text-3 leading-relaxed">
              A small curated set — every dua here is sourced from the Quran or the two Sahih collections,
              cited on each card. The Arabic follows those sources' standard printed texts; check your
              recitation with a teacher.
            </p>
          </div>
        )}

        {/* BROWSE MODE — book list */}
        {mode === "browse" && !openBook && (
          <div className="space-y-3">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-ink-text-3" />
              <input
                type="text"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                placeholder="Filter books by name or number..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-ink-surface-2/50 border border-ink-border/60 text-ink-text placeholder:text-ink-text-3 focus:outline-none focus:border-ink-accent/40 text-sm"
              />
            </div>
            <div className="space-y-2">
              {filteredBooks.map((book) => (
                <button
                  key={book.number}
                  onClick={() => setOpenBook(book)}
                  className="w-full flex items-center gap-3 rounded-xl bg-ink-surface/50 border border-ink-border/40 hover:border-ink-border transition-colors p-3 text-left"
                >
                  <span className="w-8 h-8 rounded-xl bg-ink-surface-2 text-ink-text-2 text-xs font-medium flex items-center justify-center flex-shrink-0">
                    {book.number}
                  </span>
                  <span className="flex-1 text-sm text-ink-text-2 truncate">{book.name}</span>
                  <ChevronRight className="w-4 h-4 text-ink-text-3 flex-shrink-0" />
                </button>
              ))}
              {filteredBooks.length === 0 && (
                <EmptyState icon={Search} title="No books match" message="Try a different book name." />
              )}
            </div>
          </div>
        )}

        {/* BROWSE MODE — open book */}
        {mode === "browse" && openBook && (
          <div className="space-y-4">
            <button
              onClick={() => { setOpenBook(null); setEntries(null); }}
              className="flex items-center gap-1.5 text-xs text-ink-text-2 hover:text-ink-text transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All books
            </button>
            <h2 className="text-lg font-semibold text-ink-text">{openBook.name}</h2>
            {entries === null && !loadError && (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-ink-accent animate-spin" /></div>
            )}
            {entries && (
              <div className="space-y-3">
                {entries.map((h, i) => (
                  <HadithCard
                    key={h.number}
                    hadith={h}
                    collectionName={collection.name}
                    accent={collectionId}
                    onClick={() => setViewingHadith({ list: entries, index: i, collectionName: collection.name, accent: collectionId })}
                  />
                ))}
                {entries.length === 0 && (
                  <EmptyState title="Nothing to show here" message="This book has no displayable entries yet." />
                )}
              </div>
            )}
          </div>
        )}

        {/* Content policy — the honest note (mirrors the app's Tajweed
            disclaimers): what's included, where it comes from, what this is. */}
        <footer className="border-t border-ink-border/50 pt-4">
          <p className="text-[11px] text-ink-text-3 leading-relaxed">
            Content is limited to hadith from <span className="text-ink-text-3">Sahih al-Bukhari</span> and{" "}
            <span className="text-ink-text-3">Sahih Muslim</span>, collections regarded as authentic (Sahih) by
            their compilers' methodology and mainstream scholarly consensus — the grading shown comes from the
            source collections, not from this app. Text is served from the open fawazahmed0/hadith-api dataset
            (compiled from sunnah.com, al-maktaba.org and similar); translations: Muhsin Khan (Bukhari) and
            Abdul Hamid Siddiqui (Muslim). This is a reference tool, not a substitute for studying with a
            qualified teacher.
          </p>
        </footer>
      </div>

      <HadithDetailModal
        viewing={viewingHadith}
        onClose={() => setViewingHadith(null)}
        onNavigate={(delta) => setViewingHadith((v) => (v ? { ...v, index: v.index + delta } : v))}
      />
    </div>
  );
}

// accent differentiates the two collections at a glance (accent=Bukhari,
// gold=Muslim — the palette has no separate "sky" equivalent, same
// two-hue-substitution as ComparePlayback's reciter/you distinction) —
// purely visual grouping, not a claim about relative authenticity.
const ACCENT_STYLES = {
  bukhari: { border: "border-l-ink-accent/50", badge: "bg-ink-accent/10 text-ink-accent border-ink-accent/20" },
  muslim: { border: "border-l-ink-gold/50", badge: "bg-ink-gold/10 text-ink-gold border-ink-gold/20" },
};

function HadithCard({ hadith, collectionName, accent, onClick }) {
  const style = ACCENT_STYLES[accent] || ACCENT_STYLES.bukhari;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      onClick={onClick}
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      className={`rounded-2xl bg-ink-surface/50 border border-ink-border/40 border-l-2 ${style.border} p-4 space-y-3 ${
        onClick ? "cursor-pointer hover:border-ink-border hover:bg-ink-surface/80 transition-colors" : ""
      }`}
    >
      {hadith.arabic && (
        <p dir="rtl" lang="ar" className="font-arabic text-base leading-loose text-ink-text/90 text-right line-clamp-3">
          {hadith.arabic}
        </p>
      )}
      <p className="text-sm text-ink-text-2 leading-relaxed line-clamp-4">{hadith.english}</p>
      <div className="flex items-center gap-2 pt-1">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style.badge}`}>Sahih</span>
        <p className="text-xs text-ink-text-3">
          {collectionName} {hadith.number}
          <span className="text-ink-text-3"> · source collection's grading</span>
        </p>
      </div>
    </motion.div>
  );
}

// Full detail view for a single hadith, opened by tapping any HadithCard.
// Keeps the whole originating list + index so Previous/Next can step
// through without closing back out to the list every time.
function HadithDetailModal({ viewing, onClose, onNavigate }) {
  const open = !!viewing;
  const hadith = viewing?.list?.[viewing.index];
  if (!hadith) return null;
  const style = ACCENT_STYLES[viewing.accent] || ACCENT_STYLES.bukhari;
  const hasPrev = viewing.index > 0;
  const hasNext = viewing.index < viewing.list.length - 1;

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="bg-ink-surface border-ink-border max-w-lg max-h-[85vh] overflow-y-auto p-0">
        <div className={`p-6 space-y-4 border-l-2 ${style.border}`}>
          <div className="flex items-center gap-2">
            <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style.badge}`}>Sahih</span>
            <p className="text-xs text-ink-text-3">
              {viewing.collectionName} {hadith.number}
              <span className="text-ink-text-3"> · source collection's grading</span>
            </p>
          </div>
          {hadith.arabic && (
            <p dir="rtl" lang="ar" className="font-arabic text-2xl leading-loose text-ink-text text-right">
              {hadith.arabic}
            </p>
          )}
          <p className="text-base text-ink-text-2 leading-relaxed">{hadith.english}</p>
          <div className="flex items-center justify-between pt-2 border-t border-ink-border/60">
            <button
              onClick={() => onNavigate(-1)}
              disabled={!hasPrev}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-ink-text-2 bg-ink-surface-2/60 hover:bg-ink-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
              Previous
            </button>
            <span className="text-[11px] text-ink-text-3">{viewing.index + 1} of {viewing.list.length}</span>
            <button
              onClick={() => onNavigate(1)}
              disabled={!hasNext}
              className="flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-medium text-ink-text-2 bg-ink-surface-2/60 hover:bg-ink-surface-2 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
            >
              Next
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
