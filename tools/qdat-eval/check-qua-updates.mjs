// Phase 2 review cycle (2026-07, see README.md "QUA update-checking"):
// a small, manually-triggered check for whether QUA has published reciter
// coverage that could expand ground-truth Tajweed timing beyond the
// current two (Husary, Minshawi) -- see src/lib/quaReferenceData.js for
// the existing validation methodology and why Alafasy/Abdul Basit are
// deliberately NOT in that set.
//
// This ONLY flags candidates. It never auto-validates anything: adding a
// reciter to quaReferenceData.js still requires the same offline
// cross-correlation check (comparing QUA's source audio against Tilawah's
// actual everyayah.com file) that Husary/Minshawi passed and Alafasy
// failed. Does not touch Alafasy (permanently closed, quaReferenceData.js
// header) or Abdul Basit (pending a separate Tarteel licensing question)
// -- both are reported as "already decided", not re-opened.
//
// Data source: the public hetchyy/quranic-universal-ayahs Hugging Face
// mirror's real datasets-server API (no auth, no download needed) -- this
// mirror is a CURATED SUBSET of QUA's much larger claimed reciter catalog
// (1,213 reciters per their GitHub README as of 2026-07), so "not found
// here" means "not in this easily-queryable subset yet", not a definitive
// "QUA has no data for this reciter anywhere".
//
//   npx vite-node tools/qdat-eval/check-qua-updates.mjs
import { RECITERS } from "@/lib/quranData";
import { QUA_SUPPORTED_RECITER_FOLDERS } from "@/lib/quaReferenceData";

const QUA_API = "https://datasets-server.huggingface.co/splits?dataset=hetchyy/quranic-universal-ayahs";

// A simple keyword per reciter to substring-match against QUA's slug
// names (e.g. "mahmoud_khalil_al_husary_mp3quran") -- QUA's slugs don't
// follow Tilawah's own folder-name convention, so this is a deliberately
// loose, human-reviewable match, not an exact lookup.
const RECITER_KEYWORDS = {
  Alafasy_128kbps: "afasy",
  Abdul_Basit_Murattal_192kbps: "abdulbasit",
  Husary_128kbps: "husary",
  Minshawy_Murattal_128kbps: "minshaw",
  "Abdurrahmaan_As-Sudais_192kbps": "sudais",
};

// Reciters where the coverage question is already a settled, documented
// decision -- this script reports their QUA presence for context, but
// explicitly does not treat either as something to act on.
const ALREADY_DECIDED = {
  Alafasy_128kbps: "CLOSED permanently (2026-07-25) -- genuine audio-source mismatch, not a coverage gap. Do not re-open without a materially new reason.",
  Abdul_Basit_Murattal_192kbps: "PENDING -- blocked on a direct Tarteel licensing clarification (human/business action), not a data question.",
};

async function main() {
  console.log("Fetching current QUA reciter coverage (hetchyy/quranic-universal-ayahs)...");
  const res = await fetch(QUA_API);
  if (!res.ok) {
    console.error(`Failed to fetch QUA reciter list: HTTP ${res.status}`);
    process.exit(1);
  }
  const data = await res.json();
  const quaConfigs = [...new Set(data.splits.map((s) => s.config))].sort();
  console.log(`Found ${quaConfigs.length} reciter configs in the public HF mirror.\n`);

  console.log("=== Tilawah roster vs. QUA coverage ===");
  for (const reciter of RECITERS) {
    const keyword = RECITER_KEYWORDS[reciter.folder];
    const matches = keyword ? quaConfigs.filter((c) => c.includes(keyword)) : [];
    const alreadyValidated = QUA_SUPPORTED_RECITER_FOLDERS.has(reciter.folder);
    const decided = ALREADY_DECIDED[reciter.folder];

    console.log(`\n${reciter.name} (${reciter.folder})`);
    if (alreadyValidated) {
      console.log(`  Status: already validated and in use (quaReferenceData.js).`);
    } else if (decided) {
      console.log(`  Status: ${decided}`);
    } else if (matches.length > 0) {
      console.log(`  Status: NOT yet validated -- candidate found in QUA mirror: ${matches.join(", ")}`);
      console.log(`  Next step (manual, not automated): run the same offline cross-correlation check used for Husary/Minshawi before trusting this as ground truth.`);
    } else {
      console.log(`  Status: not found in this HF mirror (checked keyword "${keyword}"). May still exist in QUA's broader catalog -- this mirror is a subset, not the full platform.`);
    }
  }

  console.log("\n=== Full current QUA reciter list (public mirror) ===");
  quaConfigs.forEach((c) => console.log(`  ${c}`));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
