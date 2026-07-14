// Locates Tajweed rule positions directly from the Uthmani Arabic script
// (which includes full diacritics: fatha, damma, kasra, sukun, shadda,
// tanween, maddah). This is deterministic — a given letter+diacritic
// combination always means the same rule — so it doesn't need audio or
// ML, only correct text.
//
// This intentionally covers the rules that are realistically checkable
// from a plain waveform: Qalqalah (an audible "bounce" on certain
// letters), Madd (elongation length), and the nasal-hold family —
// Ghunnah, Iqlab, Idgham-with-Ghunnah, and Ikhfa, all of which share the
// same acoustic signature (a nasal hum sustained for ~2 counts). For the
// last two, only the hold's presence/length at the right position is
// checkable — not *which* consonant was produced (proper merging/hiding
// of the noon), which would need phoneme-level analysis. Idgham WITHOUT
// ghunnah (before ل ر) is deliberately not covered: its signature is the
// absence of a released noon, not a nasal hold, so this heuristic can't
// see it.
//
// Script-encoding note (verified against the Tanzil Uthmani text served
// by api.alquran.cloud): an assimilated noon sakinah (Iqlab/Idgham/Ikhfa)
// is written *bare* — no sukun — while an Izhar noon carries an explicit
// sukun. That convention conveniently also excludes the four Izhar Mutlaq
// words (دُنْيَا بُنْيَان قِنْوَان صِنْوَان), whose noon is written with sukun.
// Tanween in assimilation contexts is followed by a small high/low meem
// (U+06E2/U+06ED); on a *noon*, the small high meem specifically marks
// Iqlab, but after a *tanween* it appears for Idgham/Ikhfa too, so there
// it must not be read as an Iqlab marker on its own.

const FATHA = "\u064E";
const DAMMA = "\u064F";
const KASRA = "\u0650";
const SUKUN = "\u0652";
const SHADDA = "\u0651";
const TANWEEN_FATH = "\u064B";
const TANWEEN_DAMM = "\u064C";
const TANWEEN_KASR = "\u064D";
const MADDAH = "\u0653";
const SMALL_HIGH_MEEM = "\u06E2"; // on a noon: the Uthmani Iqlab marker; after a tanween: sequential-tanween marker
const SMALL_LOW_MEEM = "\u06ED"; // low variant of the sequential-tanween marker
const DIACRITICS = new Set([FATHA, DAMMA, KASRA, SUKUN, SHADDA, TANWEEN_FATH, TANWEEN_DAMM, TANWEEN_KASR, MADDAH, SMALL_HIGH_MEEM, SMALL_LOW_MEEM, "\u0670"]);

const QALQALAH_LETTERS = new Set(["\u0642", "\u0637", "\u0628", "\u062C", "\u062F"]); // ق ط ب ج د
const NOON = "\u0646";
const MEEM = "\u0645";
const BA = "\u0628";
const ALEF = "\u0627";
const WAW = "\u0648";
const YA = "\u064A";
const HAMZA_CHARS = new Set(["\u0621", "\u0623", "\u0625", "\u0624", "\u0626"]); // ء أ إ ؤ ئ
const TANWEEN_MARKS = new Set([TANWEEN_FATH, TANWEEN_DAMM, TANWEEN_KASR]);
const ALEF_MAKSURA = "ى";
// Precomposed alef-with-madda (آ, U+0622): the Uthmani text uses BOTH this
// and the decomposed ا+ٓ sequence (e.g. لَنَآ vs لَّآ) — it is an alef madd
// letter that also carries a hamza sound, so it participates in both sides
// of the madd rules.
const ALEF_MADDA = "آ";

// Idgham with Ghunnah: noon sakinah/tanween merging into ي ن م و across a
// word boundary. (Within one word, noon before ي/و is Izhar Mutlaq — e.g.
// دُنْيَا, قِنْوَان — never Idgham; restricting to word boundaries encodes that.)
const IDGHAM_GHUNNAH_LETTERS = new Set([YA, NOON, MEEM, WAW]);
// Ikhfa: the 15 letters before which noon sakinah/tanween is "hidden"
// into a nasal hum (everything except the Izhar six, ي ن م و, ل ر, and ب).
const IKHFA_LETTERS = new Set([
  "ت", "ث", "ج", "د", "ذ",
  "ز", "س", "ش", "ص", "ض",
  "ط", "ظ", "ف", "ق", "ك",
]);

// Marks that mean a noon is NOT sakinah (it carries a vowel/shaddah), or
// is one of the isolated muqatta'at letters (maddah — نٓ in 68:1, which
// Hafs recites with Izhar). Sukun and the small meems are deliberately
// absent from this set: an explicit sukun IS noon sakinah (plain-script
// style), and a completely bare noon is how the Uthmani script writes an
// assimilated (Iqlab/Idgham/Ikhfa) noon sakinah.
const NOON_VOWEL_MARKS = new Set([FATHA, DAMMA, KASRA, SHADDA, TANWEEN_FATH, TANWEEN_DAMM, TANWEEN_KASR, MADDAH, "ٰ"]);

function isDiacritic(ch) {
  return DIACRITICS.has(ch);
}

export function splitAyahIntoWords(arabicText) {
  return arabicText.trim().split(/\s+/).filter(Boolean);
}

// Walks one word's characters (base letters + trailing diacritics grouped
// together) and returns Tajweed rule hits within it. `nextWord` (if any)
// is used to check for Madd Munfasil across a word boundary.
function analyzeWord(word, wordIndex, nextWord) {
  const hits = [];
  const chars = Array.from(word);

  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i];
    if (isDiacritic(ch)) continue;

    // Collect the diacritics attached to this base letter.
    let j = i + 1;
    const marks = [];
    while (j < chars.length && isDiacritic(chars[j])) {
      marks.push(chars[j]);
      j++;
    }

    // --- Ghunnah: noon or meem + shadda ---
    if ((ch === NOON || ch === MEEM) && marks.includes(SHADDA)) {
      hits.push({
        ruleType: "ghunnah",
        label: "Ghunnah (nasal hold)",
        wordIndex,
        charIndex: i,
        expectedCounts: 2,
      });
    }

    // --- Qalqalah: ب ج د ط ق + sukun (mid-word) ---
    if (QALQALAH_LETTERS.has(ch) && marks.includes(SUKUN)) {
      hits.push({
        ruleType: "qalqalah",
        label: "Qalqalah (bounce)",
        wordIndex,
        charIndex: i,
        expectedCounts: 1,
      });
    }

    // Look ahead to the next base letter, whether it's later in this word
    // or (if this letter ends the word) the first letter of the next word.
    // Shared by the Madd and Iqlab checks below.
    const nextBaseIdx = (() => {
      let k = j;
      while (k < chars.length && isDiacritic(chars[k])) k++;
      return k;
    })();
    const isLastLetterOfWord = nextBaseIdx >= chars.length;
    const nextChar = isLastLetterOfWord ? null : chars[nextBaseIdx];
    const nextMarks = [];
    if (!isLastLetterOfWord) {
      let k2 = nextBaseIdx + 1;
      while (k2 < chars.length && isDiacritic(chars[k2])) { nextMarks.push(chars[k2]); k2++; }
    }
    const nextWordFirstChar = isLastLetterOfWord && nextWord ? Array.from(nextWord)[0] : null;

    // --- Noon sakinah / tanween family: Iqlab (before ب), Idgham with
    // Ghunnah (before ي ن م و across words), Ikhfa (before the 15 Ikhfa
    // letters). Idgham *without* ghunnah (before ل ر) is deliberately not
    // detected — it has no nasal hold for the acoustic check to measure.
    // Noon sakinah comes in three written forms (see the encoding note at
    // the top of this file): explicit sukun (plain script, and Uthmani
    // Izhar), completely bare (Uthmani assimilation contexts), or carrying
    // the small high meem (Uthmani Iqlab).
    const noonIsSakinah = ch === NOON && !marks.some((m) => NOON_VOWEL_MARKS.has(m));
    const hasTanween = [...marks].some((m) => TANWEEN_MARKS.has(m));

    // The letter actually recited after this one. A fathatan's silent
    // word-final carrier alef (the trailing alef of "khayran"-style words)
    // isn't recited, so the effective follower there is the next word's
    // first letter.
    let followerChar = isLastLetterOfWord ? nextWordFirstChar : nextChar;
    let followerIsInNextWord = isLastLetterOfWord;
    if (!isLastLetterOfWord && hasTanween && (nextChar === ALEF || nextChar === ALEF_MAKSURA)) {
      let afterCarrier = nextBaseIdx + 1;
      while (afterCarrier < chars.length && isDiacritic(chars[afterCarrier])) afterCarrier++;
      if (afterCarrier >= chars.length) {
        followerChar = nextWord ? Array.from(nextWord)[0] : null;
        followerIsInNextWord = true;
      }
    }

    if (noonIsSakinah || hasTanween) {
      // On a *noon*, the Uthmani small high meem authoritatively marks
      // Iqlab. After a *tanween*, that same mark only means "assimilated
      // tanween" (it appears in Idgham/Ikhfa contexts too), so there the
      // following letter must actually be checked.
      const markedAsIqlab = ch === NOON && marks.includes(SMALL_HIGH_MEEM);
      if (markedAsIqlab || followerChar === BA) {
        hits.push({
          ruleType: "iqlab",
          label: "Iqlab (noon\u2192meem sound)",
          wordIndex,
          charIndex: i,
          expectedCounts: 2,
        });
      } else if (followerIsInNextWord && followerChar && IDGHAM_GHUNNAH_LETTERS.has(followerChar)) {
        // --- Idgham with Ghunnah: noon/tanween merges into the next
        // word's initial letter with a sustained nasal hold ---
        hits.push({
          ruleType: "idgham_ghunnah",
          label: "Idgham with Ghunnah (nasal merge)",
          wordIndex,
          charIndex: i,
          expectedCounts: 2,
        });
      } else if (followerChar && IKHFA_LETTERS.has(followerChar)) {
        // --- Ikhfa: noon/tanween "hidden" into a nasal hum before one of
        // the 15 Ikhfa letters (same word or next word) ---
        hits.push({
          ruleType: "ikhfa",
          label: "Ikhfa (hidden noon)",
          wordIndex,
          charIndex: i,
          expectedCounts: 2,
        });
      }
    }

    // --- Madd: alef / waw+sukun / ya+sukun preceded by matching harakah ---
    const isMaddLetter =
      (ch === ALEF) ||
      (ch === ALEF_MADDA) ||
      (ch === WAW && marks.includes(SUKUN)) ||
      (ch === YA && marks.includes(SUKUN));

    if (isMaddLetter && i > 0) {
      // آ embeds a hamza, so it also counts as a following-hamza trigger.
      const nextIsHamza = nextChar && (HAMZA_CHARS.has(nextChar) || nextChar === ALEF_MADDA);
      const nextIsShaddaOrSukun = nextMarks.includes(SHADDA) || nextMarks.includes(SUKUN);

      // If this madd letter ends the word, whether it's an "extended"
      // Madd Munfasil depends on whether the *next word* starts with a
      // hamza — not on it merely being word-final.
      const nextWordStartsWithHamza = nextWordFirstChar && (HAMZA_CHARS.has(nextWordFirstChar) || nextWordFirstChar === ALEF_MADDA);

      let type = "madd_natural";
      let expectedCounts = 2;
      if (!isLastLetterOfWord && nextIsShaddaOrSukun) {
        type = "madd_obligatory";
        expectedCounts = 6;
      } else if ((!isLastLetterOfWord && nextIsHamza) || (isLastLetterOfWord && nextWordStartsWithHamza)) {
        // Madd Muttasil (hamza within the same word) or Madd Munfasil
        // (next word starts with hamza) — both get a longer elongation.
        type = "madd_extended";
        expectedCounts = 4;
      }

      hits.push({
        ruleType: type,
        label:
          type === "madd_obligatory" ? "Madd Lazim (6 counts)"
          : type === "madd_extended" ? "Madd Muttasil/Munfasil (4-5 counts)"
          : "Madd Tabi'i (2 counts)",
        wordIndex,
        charIndex: i,
        expectedCounts,
      });
    }

    i = j - 1;
  }

  return hits;
}

// Returns all detected rule occurrences across the ayah, in reading order.
export function findTajweedRules(arabicText) {
  const words = splitAyahIntoWords(arabicText);
  const hits = [];
  words.forEach((word, idx) => {
    hits.push(...analyzeWord(word, idx, words[idx + 1]));
  });
  return { words, hits };
}
