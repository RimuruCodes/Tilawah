// Reduces a set of RecitationLog rows (already filtered to one surah) to
// each ayah's most recent score, for the per-ayah "last score" badge in the
// reader. Works the same whether a row came from single-ayah or continuous
// recitation (continuous logs one row per ayah recited, with that attempt's
// composite score).
export function summarizeLastScores(logs) {
  const lastByAyah = {};
  const lastSeenAt = {};

  logs.forEach((log) => {
    const ayahNumber = log.ayah_number;
    const score = log.accuracy_score;
    if (ayahNumber == null || score == null) return;

    const seenAt = new Date(log.created_date).getTime();
    if (lastSeenAt[ayahNumber] == null || seenAt > lastSeenAt[ayahNumber]) {
      lastSeenAt[ayahNumber] = seenAt;
      lastByAyah[ayahNumber] = score;
    }
  });

  return lastByAyah;
}
