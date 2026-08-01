// Ground-truth word timing from the Qur'anic Universal Audio (QUA) project
// (github.com/Wider-Community/quranic-universal-audio, CC BY 4.0) — see
// Settings' "Open Data & Credits" section. Used by tajweedAnalysis.js to
// replace the DTW-ESTIMATED reference window with QUA's own verified word
// timestamp, for reciter+ayah pairs where that's been independently
// validated to actually be safe.
//
// QUA's timestamps are offsets within a full-SURAH audio file; Tilawah
// plays per-AYAH files from everyayah.com, a different mirror of the same
// recording. Reconciling the two needs a per-ayah offset, and that offset
// is genuinely NOT constant across ayahs (validated range: roughly -1000ms
// to +400ms, varying by how much lead-in silence each mirror trimmed) — so
// it's looked up per (reciter, surah, ayah) below, never assumed or applied
// as one reciter-wide correction. See `offsetMs` on each ayah entry.
//
// Coverage is intentionally narrow: only reciter+ayah pairs an offline
// cross-correlation check (comparing QUA's source audio against Tilawah's
// actual everyayah.com file) confirmed are the same recording. Of the 4
// reciters checked 2026-07-25, only Al-Husary and Al-Minshawi cleared that
// bar cleanly (>=0.96 normalized correlation on every sampled ayah); Abdul
// Basit was mixed (0.40-0.99) and Alafasy was inconsistent (including
// negative correlations on some samples) — both are deliberately absent
// from QUA_DATA below, not just untested, so they keep using the existing
// DTW-estimated reference window unchanged. Treating an unvalidated
// reciter's QUA timestamps as ground truth would risk quietly making
// Tajweed feedback less accurate while labeling it more trustworthy —
// worse than today's honest DTW estimate.
//
// --- Investigation status (Alafasy: CLOSED 2026-07-25, permanent) ---
// Three avenues were explored to get Alafasy real ground-truth timing, none
// panned out:
//  1. Reconciling everyayah.com's Alafasy audio against QUA's mp3quran-
//     sourced Alafasy audio (the same approach that worked for Husary/
//     Minshawi): inconsistent correlation across sampled ayahs, including
//     negative values — evidence of a genuine content-level mismatch (not
//     a fixable offset), most likely everyayah's and mp3quran's Alafasy
//     files not consistently being the same recording session throughout.
//  2. Using QUA's own native audio (fetched via their download_audio.py,
//     matched to their timestamps by construction) purely as an internal
//     Tajweed-reference source, never for playback: technically validated
//     as clean (0.99-1.00 correlation against QUA's own timestamps, as
//     expected), but blocked on licensing — neither mp3quran.net (QUA's
//     Alafasy audio source) nor everyayah.com (Tilawah's own existing
//     playback source) has ever published a terms of use, license, or
//     copyright statement (checked directly: privacy policy, API docs,
//     about page, sitemap, and Wayback Machine archive history back to
//     2020 — nothing found on either site). That's an honest "informal
//     assumption, undocumented" status for both, not something a
//     comparison between them resolves. Decision: don't build on an
//     unresolved licensing question — resolving it needs a real outreach
//     to mp3quran.net/everyayah.com from a person representing Tilawah,
//     which is explicitly a human/business decision, not something to
//     pursue from this codebase or session.
//  3. QUA's live Aligner tool, to align Tilawah's own everyayah.com
//     Alafasy audio directly (sidestepping the source-matching problem
//     entirely): not viable as a free/anonymous service — no published
//     commercial terms, GPU access requires Hugging Face login, and the
//     anonymous CPU tier is hard-capped at one active request globally
//     (confirmed via repeated real calls). Their own error response
//     points bulk/commercial use to contacting the maintainers directly.
//
// FINAL DECISION: Alafasy stays on the DTW-estimated reference-timing path
// permanently — not paused, not pending re-validation. Do not re-open this
// without a genuinely new reason (e.g. a human-confirmed license answer
// from mp3quran.net/everyayah.com, or a materially different data source
// appearing). This does not touch Tilawah's existing everyayah.com usage
// for actual playback, which is unaffected and continues as-is.
//
// Abdul Basit remains a SEPARATE, still-open question (not closed): its
// QUA audio source is Tarteel's CDN, which Tarteel's own support docs say
// isn't offered as a public API for third-party apps — pending a direct,
// human-sent clarification with Tarteel, same category as the Alafasy
// outreach above but a different counterparty. Until then it also stays
// on the DTW-estimated path.
//
// Word-level only, deliberately: QUA also publishes letter-level timing,
// but its letters use its own normalized alphabet (e.g. dropping the
// maddah mark, splitting shaddah-doubled letters), which doesn't map 1:1
// onto tajweedRules.js's charIndex (an index into the raw Uthmani string,
// diacritics included) without a real normalization layer. Word-level QUA
// data also matches the granularity the rest of the pipeline can actually
// use today: the user side of every comparison comes from ASR word
// timestamps (see timeWindowForRule in tajweedAnalysis.js), which has no
// letter-level timing to compare against either — so letter-level ground
// truth on the reference side alone wouldn't currently be usable. A real
// letter-level upgrade needs letter-level ASR alignment on the user side
// too; that's a separate, larger piece of work.
//
// Widening coverage — new reciters, new ayahs, or letter-level once the
// alphabet-mapping problem above is solved — means re-running the same
// offline validation methodology and adding entries here. Never assume an
// untested ayah behaves like a tested one, even for an already-approved
// reciter: coverage is per-ayah for exactly that reason.

// everyayah.com folder name (the identifier already threaded through
// quranData.js/recitationService.js) -> QUA data.
const QUA_DATA = {
  Husary_128kbps: {
    slug: "mahmoud_khalil_al_husary_mp3quran",
    ayahs: {
      "1:1": { offsetMs: 292.7, corrPeak: 0.9948, verseStartMs: 6114, verseEndMs: 12045, words: [[1, 6464, 6934], [2, 6934, 7654], [3, 7654, 8814], [4, 8814, 11104]] },
      "2:255": { offsetMs: -963.2, corrPeak: 0.994, verseStartMs: 10193995, verseEndMs: 10253940, words: [[1, 10194195, 10195115], [2, 10195115, 10197055], [3, 10197055, 10197815], [4, 10197815, 10198555], [5, 10198555, 10198905], [6, 10198905, 10199615], [7, 10199615, 10202525], [8, 10203235, 10203675], [9, 10203675, 10204815], [10, 10204815, 10206225], [11, 10206225, 10206765], [12, 10206765, 10208445], [13, 10209265, 10209935], [14, 10209935, 10210375], [15, 10210375, 10210545], [16, 10210545, 10212025], [17, 10212025, 10212675], [18, 10212675, 10212885], [19, 10212885, 10213835], [20, 10215535, 10216475], [21, 10216475, 10216645], [22, 10216645, 10217445], [23, 10217445, 10218355], [24, 10218355, 10221225], [25, 10221225, 10221975], [26, 10221975, 10224015], [27, 10224075, 10224895], [28, 10224895, 10225305], [29, 10225305, 10225875], [30, 10225875, 10227005], [31, 10227005, 10227725], [32, 10227725, 10228745], [33, 10228745, 10229325], [34, 10229325, 10230535], [35, 10230535, 10232175], [36, 10232175, 10232315], [37, 10232315, 10234595], [38, 10234595, 10235425], [39, 10235425, 10236105], [40, 10236105, 10238295], [41, 10240945, 10241545], [42, 10241545, 10242645], [43, 10242645, 10244105], [44, 10244105, 10245015], [45, 10245015, 10245585], [46, 10245585, 10246715], [47, 10246715, 10249105], [48, 10249285, 10249875], [49, 10249875, 10250785], [50, 10250785, 10253395]] },
      "18:10": { offsetMs: -469.5, corrPeak: 0.9999, verseStartMs: 150125, verseEndMs: 171660, words: [[1, 150505, 151045], [2, 151045, 151575], [3, 151575, 153075], [4, 153075, 153675], [5, 153675, 154845], [6, 154845, 156575], [7, 156575, 159035], [8, 159035, 160645], [9, 160645, 161305], [10, 161305, 162795], [11, 162795, 164835], [12, 164835, 165935], [13, 165935, 167055], [14, 167055, 167635], [15, 167635, 169185], [16, 169185, 170495]] },
      "36:1": { offsetMs: 308.6, corrPeak: 0.9957, verseStartMs: 6640, verseEndMs: 12085, words: [[1, 7050, 11060]] },
      "55:1": { offsetMs: 163.9, corrPeak: 0.9821, verseStartMs: 6445, verseEndMs: 10610, words: [[1, 6715, 10365]] },
      "78:1": { offsetMs: -97.6, corrPeak: 0.9939, verseStartMs: 8300, verseEndMs: 16045, words: [[1, 8690, 10230], [2, 10230, 15250]] },
      "112:1": { offsetMs: -398.8, corrPeak: 0.98, verseStartMs: 8340, verseEndMs: 13910, words: [[1, 8710, 9360], [2, 9360, 10090], [3, 10090, 11750], [4, 11750, 12630]] },
      "114:6": { offsetMs: -299.0, corrPeak: 0.9876, verseStartMs: 46170, verseEndMs: 54310, words: [[1, 46480, 47110], [2, 47110, 49650], [3, 49650, 53090]] },
    },
  },
  Minshawy_Murattal_128kbps: {
    slug: "mohammed_siddiq_al_minshawi_mp3quran",
    ayahs: {
      "1:1": { offsetMs: -282.4, corrPeak: 0.9988, verseStartMs: 7440, verseEndMs: 11940, words: [[1, 7700, 8130], [2, 8130, 8840], [3, 8840, 9940], [4, 9940, 11270]] },
      "2:255": { offsetMs: -323.2, corrPeak: 0.9941, verseStartMs: 6797515, verseEndMs: 6864585, words: [[1, 6797725, 6798985], [2, 6798985, 6800665], [3, 6800665, 6801655], [4, 6801655, 6802675], [5, 6802675, 6803125], [6, 6803125, 6804165], [7, 6804165, 6806005], [8, 6807205, 6807805], [9, 6807805, 6809265], [10, 6809265, 6810995], [11, 6810995, 6811585], [12, 6811585, 6812375], [13, 6813475, 6814335], [14, 6814335, 6814815], [15, 6814815, 6815025], [16, 6815025, 6816925], [17, 6816925, 6817805], [18, 6817805, 6818035], [19, 6818035, 6818935], [20, 6819975, 6821195], [21, 6821195, 6821425], [22, 6821425, 6822525], [23, 6822525, 6823595], [24, 6823595, 6826665], [25, 6826665, 6827775], [26, 6827775, 6830055], [27, 6830115, 6831145], [28, 6831145, 6831695], [29, 6831695, 6832465], [30, 6832465, 6834025], [31, 6834025, 6834795], [32, 6834795, 6835925], [33, 6837125, 6837905], [34, 6837905, 6839425], [35, 6839425, 6841415], [36, 6841415, 6841715], [37, 6841715, 6844005], [38, 6844005, 6844995], [39, 6844995, 6845695], [40, 6845695, 6848735], [41, 6849185, 6849995], [42, 6849995, 6851535], [43, 6851535, 6853395], [44, 6853395, 6854625], [45, 6855445, 6856265], [46, 6856265, 6857865], [47, 6857865, 6859775], [48, 6860315, 6861115], [49, 6861115, 6862415], [50, 6862415, 6863755]] },
      "18:10": { offsetMs: -314.6, corrPeak: 0.9659, verseStartMs: 113268, verseEndMs: 130510, words: [[1, 113495, 113935], [2, 113935, 114415], [3, 114415, 115655], [4, 115655, 116055], [5, 116055, 116995], [6, 116995, 118245], [7, 118245, 120795], [8, 120795, 121945], [9, 121945, 122435], [10, 122435, 123735], [11, 123735, 125495], [12, 125495, 126385], [13, 126385, 127205], [14, 127205, 127635], [15, 127635, 128755], [16, 128755, 130075]] },
      "36:1": { offsetMs: -76.9, corrPeak: 0.9999, verseStartMs: 4570, verseEndMs: 8284, words: [[1, 4830, 8100]] },
      "55:1": { offsetMs: -36.5, corrPeak: 0.9647, verseStartMs: 4190, verseEndMs: 6840, words: [[1, 4410, 6510]] },
      "78:1": { offsetMs: -183.5, corrPeak: 0.9747, verseStartMs: 7550, verseEndMs: 13360, words: [[1, 7810, 9250], [2, 9250, 13240]] },
      "112:1": { offsetMs: 170.4, corrPeak: 0.9789, verseStartMs: 4610, verseEndMs: 8009, words: [[1, 4830, 5280], [2, 5280, 5760], [3, 5760, 6790], [4, 6790, 7470]] },
      "114:6": { offsetMs: -29.0, corrPeak: 0.9743, verseStartMs: 27118, verseEndMs: 32295, words: [[1, 27238, 27688], [2, 27688, 29558], [3, 29558, 31498]] },
    },
  },
};

// The approved boundary — the single source of truth for "which reciters
// may use QUA ground truth at all." Exported so tests can assert against it
// directly (rather than just against individual lookups returning null),
// so an accidental widening shows up as a failing assertion, not a silent
// behavior change.
export const QUA_SUPPORTED_RECITER_FOLDERS = new Set(Object.keys(QUA_DATA));

function findAyah(reciterFolder, surahNumber, ayahNumber) {
  return QUA_DATA[reciterFolder]?.ayahs?.[`${surahNumber}:${ayahNumber}`] ?? null;
}

export function isQuaGroundTruthAvailable(reciterFolder, surahNumber, ayahNumber) {
  return findAyah(reciterFolder, surahNumber, ayahNumber) != null;
}

// Translates one QUA word entry's surah-absolute ms into Tilawah's own
// everyayah ayah buffer's timeline (t=0 at that buffer's start): subtract
// this ayah's own QUA start (ayah-relative), then apply the validated
// per-ayah offset (see file header). Returns null for a non-positive-width
// result rather than a nonsensical window.
function windowSecForWord(ayah, [, wStartMs, wEndMs]) {
  const startMs = wStartMs - ayah.verseStartMs - ayah.offsetMs;
  const endMs = wEndMs - ayah.verseStartMs - ayah.offsetMs;
  if (endMs <= startMs) return null;
  return { startSec: Math.max(0, startMs / 1000), endSec: endMs / 1000 };
}

// Returns the validated ground-truth window, in seconds, for one word of
// one ayah — in the SAME coordinate system as the reference ayah audio
// buffer Tilawah itself decoded (t=0 at that buffer's start), so callers
// can feed it straight into energyProfileForRefWindow exactly like a
// DTW-mapped window. `wordIndex` is 0-based, matching tajweedRules.js's
// rule.wordIndex; QUA's own word_idx is 1-based.
//
// Returns null whenever this specific (reciter, ayah, word) isn't covered
// — never a best guess — so callers fall through to the existing
// DTW-estimated window unchanged.
export function getQuaWordWindowSec(reciterFolder, surahNumber, ayahNumber, wordIndex) {
  const ayah = findAyah(reciterFolder, surahNumber, ayahNumber);
  if (!ayah) return null;
  const quaWordIdx = wordIndex + 1;
  const word = ayah.words.find((w) => w[0] === quaWordIdx);
  if (!word) return null;
  return windowSecForWord(ayah, word);
}

// Returns ground-truth windows for EVERY word of one ayah at once, in the
// shared { wordIndex, startSec, endSec, confidence } shape useWordHighlight
// expects everywhere in the app — used by playback-time word highlighting
// (AudioPlayer.jsx, ComparePlayback.jsx), which needs the whole ayah's word
// boundaries up front rather than one lookup per word. Same coordinate
// system and 0-based `wordIndex` as getQuaWordWindowSec above. `confidence`
// is always 1 — this IS the verified ground truth, not an estimate (see
// buildWordTimings in tajweedAnalysis.js for the ASR-estimated case, used
// for the user's own recording, which reports its own per-word confidence
// honestly instead).
// Returns null (never an empty/partial array) whenever this (reciter,
// ayah) isn't covered, so callers can tell "nothing to highlight" apart
// from "an ayah with zero valid words".
export function getQuaWordWindowsForAyah(reciterFolder, surahNumber, ayahNumber) {
  const ayah = findAyah(reciterFolder, surahNumber, ayahNumber);
  if (!ayah) return null;
  const windows = ayah.words
    .map((word) => {
      const win = windowSecForWord(ayah, word);
      return win && { wordIndex: word[0] - 1, ...win, confidence: 1 };
    })
    .filter(Boolean);
  return windows.length ? windows : null;
}
