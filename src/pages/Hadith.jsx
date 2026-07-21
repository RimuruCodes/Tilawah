import React, { useState, useEffect, useMemo } from "react";
import { motion } from "framer-motion";
import { ScrollText, Search, ChevronRight, ArrowLeft, Loader2, AlertTriangle, Download, Sparkles } from "lucide-react";
import { HADITH_COLLECTIONS, getBooks, getBookHadiths, searchCollection, isCollectionLoadedForSearch } from "@/lib/hadithData";
import EmptyState from "@/components/EmptyState";
import { DUAS, DUA_CATEGORIES } from "@/lib/duasData";
import { HADITH_TOPICS, TOPIC_ENTRIES_PER_BOOK } from "@/lib/hadithTopics";

// Hadith browser: Sahih al-Bukhari and Sahih Muslim only — see the
// disclaimer block at the bottom of the page for the content policy.
export default function Hadith() {
  const [collectionId, setCollectionId] = useState("bukhari");
  const [openBook, setOpenBook] = useState(null); // {number, name} | null
  const [entries, setEntries] = useState(null);
  const [loadError, setLoadError] = useState("");
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
  }, [collectionId, openBook]);

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
  }, [mode, activeTopic]);

  const switchCollection = (id) => {
    setCollectionId(id);
    setOpenBook(null);
    setEntries(null);
    setSearchResults(null);
    setSearchQuery("");
    setMode("browse");
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
    <div className="min-h-screen bg-slate-950">
      <div className="max-w-2xl mx-auto px-4 pt-6 pb-8 space-y-6">
        {/* Header */}
        <header className="space-y-1">
          <div className="flex items-center gap-2">
            <ScrollText className="w-6 h-6 text-emerald-400" />
            <h1 className="text-2xl font-bold text-white">Hadith</h1>
          </div>
          <p className="text-xs text-slate-500">Authentic (Sahih) narrations from the two Sahih collections.</p>
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
                mode === m.key ? "bg-emerald-500 text-slate-900" : "bg-slate-800/50 text-slate-400 border border-slate-700/30"
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
                    ? "bg-emerald-500/10 border-emerald-500/40 text-emerald-300"
                    : "bg-slate-900/50 border-slate-700/20 text-slate-400 hover:border-slate-600/40"
                }`}
              >
                {c.name}
              </button>
            ))}
          </div>
        )}

        {loadError && (
          <div className="flex items-center gap-2 bg-orange-500/10 border border-orange-500/20 rounded-xl p-3">
            <AlertTriangle className="w-4 h-4 text-orange-400 flex-shrink-0" />
            <p className="text-xs text-orange-300">{loadError}</p>
          </div>
        )}

        {/* SEARCH MODE */}
        {mode === "search" && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") runSearch(); }}
                  placeholder={`Search ${collection.name} (English text)...`}
                  className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 text-sm"
                />
              </div>
              <button
                onClick={runSearch}
                disabled={searching || searchQuery.trim().length < 3}
                className="px-4 rounded-xl bg-emerald-500 text-slate-900 text-sm font-medium hover:bg-emerald-400 disabled:opacity-40 transition-colors"
              >
                {searching ? <Loader2 className="w-4 h-4 animate-spin" /> : "Search"}
              </button>
            </div>
            {!searchReady && searchResults === null && !searching && (
              <p className="flex items-center gap-1.5 text-[11px] text-slate-500">
                <Download className="w-3 h-3" />
                First search downloads the whole collection once (~5MB) so searching stays instant afterward.
              </p>
            )}
            {searching && !searchReady && (
              <p className="text-xs text-slate-500 text-center py-4">Downloading {collection.name} for search...</p>
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
                  <p className="text-xs text-slate-500">
                    {`${searchResults.length}${searchResults.length >= 50 ? "+" : ""} match${searchResults.length === 1 ? "" : "es"}`}
                  </p>
                  {searchResults.map((h) => (
                    <HadithCard key={`${collectionId}-${h.number}`} hadith={h} collectionName={collection.name} accent={collectionId} />
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
                      ? "bg-emerald-500 text-slate-900"
                      : "bg-slate-800/50 text-slate-400 border border-slate-700/30"
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <div className="flex items-start gap-2 bg-emerald-500/5 border border-emerald-500/15 rounded-xl p-3">
              <Sparkles className="w-4 h-4 text-emerald-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs text-slate-400">
                {HADITH_TOPICS.find((t) => t.id === activeTopic)?.description}
              </p>
            </div>
            {topicLoading && (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
            )}
            {!topicLoading && topicGroups && topicGroups.map((group) => (
              <div key={`${group.collectionId}-${group.bookNumber}`} className="space-y-3">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wide px-1">
                  {HADITH_COLLECTIONS.find((c) => c.id === group.collectionId)?.name} · {group.bookName}
                </h3>
                {group.entries.map((h) => (
                  <HadithCard
                    key={`${group.collectionId}-${h.number}`}
                    hadith={h}
                    collectionName={HADITH_COLLECTIONS.find((c) => c.id === group.collectionId)?.name}
                    accent={group.collectionId}
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
                      ? "bg-emerald-500 text-slate-900"
                      : "bg-slate-800/50 text-slate-400 border border-slate-700/30"
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
                  className="rounded-2xl bg-slate-900/50 border border-slate-700/20 p-4 space-y-3"
                >
                  <h3 className="text-sm font-semibold text-white">{dua.title}</h3>
                  <p dir="rtl" lang="ar" className="font-arabic text-xl leading-loose text-white/90 text-right">
                    {dua.arabic}
                  </p>
                  <p className="text-xs text-slate-400 italic">{dua.transliteration}</p>
                  <p className="text-sm text-slate-300 leading-relaxed">{dua.translation}</p>
                  <p className="text-[11px] text-slate-500 border-t border-slate-700/30 pt-2">{dua.source}</p>
                </motion.div>
              ))}
            </div>
            <p className="text-[11px] text-slate-600 leading-relaxed">
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
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-500" />
              <input
                type="text"
                value={bookFilter}
                onChange={(e) => setBookFilter(e.target.value)}
                placeholder="Filter books by name or number..."
                className="w-full pl-10 pr-3 py-2.5 rounded-xl bg-slate-800/50 border border-slate-700/30 text-white placeholder:text-slate-600 focus:outline-none focus:border-emerald-500/40 text-sm"
              />
            </div>
            <div className="space-y-2">
              {filteredBooks.map((book) => (
                <button
                  key={book.number}
                  onClick={() => setOpenBook(book)}
                  className="w-full flex items-center gap-3 rounded-xl bg-slate-900/50 border border-slate-700/20 hover:border-slate-600/40 transition-colors p-3 text-left"
                >
                  <span className="w-8 h-8 rounded-lg bg-slate-800 text-slate-400 text-xs font-medium flex items-center justify-center flex-shrink-0">
                    {book.number}
                  </span>
                  <span className="flex-1 text-sm text-slate-200 truncate">{book.name}</span>
                  <ChevronRight className="w-4 h-4 text-slate-600 flex-shrink-0" />
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
              className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-white transition-colors"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              All books
            </button>
            <h2 className="text-lg font-semibold text-white">{openBook.name}</h2>
            {entries === null && !loadError && (
              <div className="flex justify-center py-10"><Loader2 className="w-6 h-6 text-emerald-400 animate-spin" /></div>
            )}
            {entries && (
              <div className="space-y-3">
                {entries.map((h) => (
                  <HadithCard key={h.number} hadith={h} collectionName={collection.name} accent={collectionId} />
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
        <footer className="border-t border-slate-800/50 pt-4">
          <p className="text-[11px] text-slate-600 leading-relaxed">
            Content is limited to hadith from <span className="text-slate-500">Sahih al-Bukhari</span> and{" "}
            <span className="text-slate-500">Sahih Muslim</span>, collections regarded as authentic (Sahih) by
            their compilers' methodology and mainstream scholarly consensus — the grading shown comes from the
            source collections, not from this app. Text is served from the open fawazahmed0/hadith-api dataset
            (compiled from sunnah.com, al-maktaba.org and similar); translations: Muhsin Khan (Bukhari) and
            Abdul Hamid Siddiqui (Muslim). This is a reference tool, not a substitute for studying with a
            qualified teacher.
          </p>
        </footer>
      </div>
    </div>
  );
}

// accent differentiates the two collections at a glance (emerald=Bukhari,
// sky=Muslim) — purely visual grouping, not a claim about relative authenticity.
const ACCENT_STYLES = {
  bukhari: { border: "border-l-emerald-500/50", badge: "bg-emerald-500/10 text-emerald-300 border-emerald-500/20" },
  muslim: { border: "border-l-sky-500/50", badge: "bg-sky-500/10 text-sky-300 border-sky-500/20" },
};

function HadithCard({ hadith, collectionName, accent }) {
  const style = ACCENT_STYLES[accent] || ACCENT_STYLES.bukhari;
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`rounded-2xl bg-slate-900/50 border border-slate-700/20 border-l-2 ${style.border} p-4 space-y-3`}
    >
      {hadith.arabic && (
        <p dir="rtl" lang="ar" className="font-arabic text-base leading-loose text-white/90 text-right">
          {hadith.arabic}
        </p>
      )}
      <p className="text-sm text-slate-300 leading-relaxed">{hadith.english}</p>
      <div className="flex items-center gap-2 pt-1">
        <span className={`text-[10px] px-2 py-0.5 rounded-full border font-medium ${style.badge}`}>Sahih</span>
        <p className="text-[11px] text-slate-500">
          {collectionName} {hadith.number}
          <span className="text-slate-600"> · source collection's grading</span>
        </p>
      </div>
    </motion.div>
  );
}
