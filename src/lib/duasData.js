// Curated daily duas. Content policy (matches the Hadith section's):
// every entry is sourced from the Quran or from Sahih al-Bukhari / Sahih
// Muslim, cited per entry. The Arabic follows the standard texts of those
// sources as printed in common editions; as with everything in this app,
// it's a reference aid — recitation should be checked with a teacher.
//
// Deliberately static and small: no open dua API with clear licensing and
// reliable sourcing exists (researched), and a short vetted list beats a
// large unverifiable one.

export const DUA_CATEGORIES = [
  { id: "daily", label: "Morning & Evening" },
  { id: "eating", label: "Eating" },
  { id: "mosque", label: "Mosque" },
  { id: "travel", label: "Travel" },
  { id: "forgiveness", label: "Forgiveness & Distress" },
];

export const DUAS = [
  {
    id: "waking",
    category: "daily",
    title: "On waking up",
    arabic: "الْحَمْدُ لِلَّهِ الَّذِي أَحْيَانَا بَعْدَ مَا أَمَاتَنَا وَإِلَيْهِ النُّشُورُ",
    transliteration: "Alhamdu lillahil-ladhi ahyana ba'da ma amatana wa ilayhin-nushur",
    translation: "All praise is for Allah who gave us life after causing us to die, and to Him is the resurrection.",
    source: "Sahih al-Bukhari 6312",
  },
  {
    id: "sleeping",
    category: "daily",
    title: "Before sleeping",
    arabic: "بِاسْمِكَ اللَّهُمَّ أَمُوتُ وَأَحْيَا",
    transliteration: "Bismika Allahumma amutu wa ahya",
    translation: "In Your name, O Allah, I die and I live.",
    source: "Sahih al-Bukhari 6324",
  },
  {
    id: "tasbih",
    category: "daily",
    title: "Morning and evening remembrance",
    arabic: "سُبْحَانَ اللَّهِ وَبِحَمْدِهِ",
    transliteration: "Subhanallahi wa bihamdih",
    translation: "Glory be to Allah and praise Him. (Said one hundred times: sins are wiped away even if like the foam of the sea.)",
    source: "Sahih al-Bukhari 6405; Sahih Muslim 2691",
  },
  {
    id: "before-eating",
    category: "eating",
    title: "Before eating",
    arabic: "بِسْمِ اللَّهِ",
    transliteration: "Bismillah",
    translation: "In the name of Allah. (The Prophet ﷺ instructed: mention Allah's name, eat with your right hand, and eat from what is nearest to you.)",
    source: "Sahih al-Bukhari 5376",
  },
  {
    id: "after-eating",
    category: "eating",
    title: "After eating",
    arabic: "الْحَمْدُ لِلَّهِ حَمْدًا كَثِيرًا طَيِّبًا مُبَارَكًا فِيهِ",
    transliteration: "Alhamdu lillahi hamdan kathiran tayyiban mubarakan fih",
    translation: "All praise is for Allah — abundant, good, and blessed praise.",
    source: "Sahih al-Bukhari 5458",
  },
  {
    id: "enter-mosque",
    category: "mosque",
    title: "Entering the mosque",
    arabic: "اللَّهُمَّ افْتَحْ لِي أَبْوَابَ رَحْمَتِكَ",
    transliteration: "Allahumma-ftah li abwaba rahmatik",
    translation: "O Allah, open the gates of Your mercy for me.",
    source: "Sahih Muslim 713",
  },
  {
    id: "leave-mosque",
    category: "mosque",
    title: "Leaving the mosque",
    arabic: "اللَّهُمَّ إِنِّي أَسْأَلُكَ مِنْ فَضْلِكَ",
    transliteration: "Allahumma inni as'aluka min fadlik",
    translation: "O Allah, I ask You of Your bounty.",
    source: "Sahih Muslim 713",
  },
  {
    id: "travel",
    category: "travel",
    title: "Setting out on a journey",
    arabic: "سُبْحَانَ الَّذِي سَخَّرَ لَنَا هَذَا وَمَا كُنَّا لَهُ مُقْرِنِينَ وَإِنَّا إِلَى رَبِّنَا لَمُنْقَلِبُونَ",
    transliteration: "Subhanal-ladhi sakhkhara lana hadha wa ma kunna lahu muqrinin, wa inna ila rabbina lamunqalibun",
    translation: "Glory be to the One who subjected this for us, for we could never have done so ourselves — and to our Lord we will surely return.",
    source: "Quran 43:13-14; Sahih Muslim 1342",
  },
  {
    id: "rabbana-dunya",
    category: "forgiveness",
    title: "For good in both worlds",
    arabic: "رَبَّنَا آتِنَا فِي الدُّنْيَا حَسَنَةً وَفِي الْآخِرَةِ حَسَنَةً وَقِنَا عَذَابَ النَّارِ",
    transliteration: "Rabbana atina fid-dunya hasanah wa fil-akhirati hasanah wa qina 'adhaban-nar",
    translation: "Our Lord, give us good in this world and good in the Hereafter, and protect us from the punishment of the Fire.",
    source: "Quran 2:201; Sahih al-Bukhari 6389",
  },
  {
    id: "sayyid-istighfar",
    category: "forgiveness",
    title: "The master supplication for forgiveness (Sayyid al-Istighfar)",
    arabic:
      "اللَّهُمَّ أَنْتَ رَبِّي لَا إِلَهَ إِلَّا أَنْتَ، خَلَقْتَنِي وَأَنَا عَبْدُكَ، وَأَنَا عَلَى عَهْدِكَ وَوَعْدِكَ مَا اسْتَطَعْتُ، أَعُوذُ بِكَ مِنْ شَرِّ مَا صَنَعْتُ، أَبُوءُ لَكَ بِنِعْمَتِكَ عَلَيَّ، وَأَبُوءُ لَكَ بِذَنْبِي فَاغْفِرْ لِي، فَإِنَّهُ لَا يَغْفِرُ الذُّنُوبَ إِلَّا أَنْتَ",
    transliteration:
      "Allahumma anta rabbi la ilaha illa ant, khalaqtani wa ana 'abduk, wa ana 'ala 'ahdika wa wa'dika mas-tata't, a'udhu bika min sharri ma sana't, abu'u laka bini'matika 'alayya, wa abu'u laka bidhanbi faghfir li, fa innahu la yaghfirudh-dhunuba illa ant",
    translation:
      "O Allah, You are my Lord — there is no god but You. You created me and I am Your servant, and I keep Your covenant and promise as best I can. I seek refuge in You from the evil of what I have done. I acknowledge Your favor upon me, and I acknowledge my sin — so forgive me, for none forgives sins but You.",
    source: "Sahih al-Bukhari 6306",
  },
  {
    id: "distress",
    category: "forgiveness",
    title: "In distress",
    arabic:
      "لَا إِلَهَ إِلَّا اللَّهُ الْعَظِيمُ الْحَلِيمُ، لَا إِلَهَ إِلَّا اللَّهُ رَبُّ الْعَرْشِ الْعَظِيمِ، لَا إِلَهَ إِلَّا اللَّهُ رَبُّ السَّمَوَاتِ وَرَبُّ الْأَرْضِ وَرَبُّ الْعَرْشِ الْكَرِيمِ",
    transliteration:
      "La ilaha illallahul-'azimul-halim, la ilaha illallahu rabbul-'arshil-'azim, la ilaha illallahu rabbus-samawati wa rabbul-ardi wa rabbul-'arshil-karim",
    translation:
      "There is no god but Allah, the Magnificent, the Forbearing. There is no god but Allah, Lord of the Magnificent Throne. There is no god but Allah, Lord of the heavens, Lord of the earth, and Lord of the Noble Throne.",
    source: "Sahih al-Bukhari 6346; Sahih Muslim 2730",
  },
  {
    id: "guidance",
    category: "forgiveness",
    title: "For guidance",
    arabic: "اللَّهُمَّ اهْدِنِي وَسَدِّدْنِي",
    transliteration: "Allahumma-hdini wa saddidni",
    translation: "O Allah, guide me and keep me on the straight path.",
    source: "Sahih Muslim 2725",
  },
];
