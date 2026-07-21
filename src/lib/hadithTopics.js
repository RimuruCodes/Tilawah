// Curated "Topics" front door into the existing Bukhari/Muslim data. Rather
// than fabricating a list of individual hadith (risking mis-citation), each
// topic points at the classical book(s) — from hadithBooks.json, the same
// baked-in structure Browse mode uses — whose subject matter matches the
// topic. The Topics UI then fetches those specific books live via the
// existing getBookHadiths(), so every entry shown is exactly what's already
// verified and cited in Browse/Search mode, just reached by theme instead of
// by book name.
export const HADITH_TOPICS = [
  {
    id: "good-deeds",
    label: "Good Deeds & Charity",
    description: "Kindness, charity, and the good deeds Islam calls for.",
    books: [
      { collectionId: "bukhari", bookNumber: 78 }, // Good Manners and Form (Al-Adab)
      { collectionId: "muslim", bookNumber: 45 }, // Virtue, Enjoining Good Manners, and Joining of the Ties of Kinship
    ],
  },
  {
    id: "prayer",
    label: "Prayer",
    description: "The virtues and etiquette of Salah.",
    books: [
      { collectionId: "bukhari", bookNumber: 8 }, // Prayers (Salat)
      { collectionId: "muslim", bookNumber: 4 }, // The Book of Prayers
    ],
  },
  {
    id: "patience",
    label: "Patience & Gratitude",
    description: "Softening the heart — patience, gratitude, and reliance on Allah.",
    books: [
      { collectionId: "bukhari", bookNumber: 81 }, // To make the Heart Tender (Ar-Riqaq)
      { collectionId: "muslim", bookNumber: 55 }, // Zuhd and Softening of Hearts
    ],
  },
  {
    id: "remembrance",
    label: "Remembrance & Repentance",
    description: "Dhikr, supplication, and turning back to Allah.",
    books: [
      { collectionId: "bukhari", bookNumber: 80 }, // Invocations
      { collectionId: "muslim", bookNumber: 48 }, // Remembrance, Supplication, Repentance and Seeking Forgiveness
    ],
  },
  {
    id: "knowledge",
    label: "Seeking Knowledge",
    description: "The virtue and etiquette of seeking sacred knowledge.",
    books: [
      { collectionId: "bukhari", bookNumber: 3 }, // Knowledge
      { collectionId: "muslim", bookNumber: 47 }, // Knowledge
    ],
  },
];

// Cap per book so a topic reads as a curated highlight, not a full book dump
// (people can always tap through to Browse for the rest).
export const TOPIC_ENTRIES_PER_BOOK = 8;
