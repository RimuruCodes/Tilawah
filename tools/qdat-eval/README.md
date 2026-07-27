# QDAT evaluation harness

Offline tooling (not shipped in the app bundle) that validates the app's
Tajweed heuristics in `src/lib/tajweedAnalysis.js` against **QDAT** — a
public academic dataset of ~1,500 recordings of the Surah Al-Ma'idah 5:109
fragment «قَالُوا۟ لَا عِلْمَ لَنَآ إِنَّكَ أَنتَ عَلَّٰمُ ٱلْغُيُوبِ», each expert-labeled
correct/incorrect for three rules:

| QDAT label | Rule | App check on this fragment |
|---|---|---|
| S1 "separate stretching" | Madd Munfasil | `madd_extended` on لَنَآ → إِنَّكَ |
| S2 "tight noon" | Ghunnah | `ghunnah` on إِنَّكَ |
| S3 "hide" | Ikhfa | `ikhfa` on أَنتَ |

Source: Osman, Mustafa & Faisal, *QDAT: A data set for Reciting the Quran*,
IJASAT vol. 9 (2021). Hosted on Kaggle: `annealdahi/quran-recitation`
(anonymously downloadable).

## Usage

```bash
# 1. Download QDAT (~1.4 GB; needs a drive with space — set KAGGLEHUB_CACHE)
python -c "import kagglehub; print(kagglehub.dataset_download('annealdahi/quran-recitation'))"

# 2. Run the app's real pipeline (ASR + heuristics) over the recordings.
#    Slow (real Whisper inference per file); resumable; writes features.json.
npx vite-node tools/qdat-eval/extract-features.mjs -- --data <download-dir>

# 3. Score current thresholds and grid-search better ones (fast, offline).
npx vite-node tools/qdat-eval/tune-thresholds.mjs

# --- Reference-anchored variant (validates the OTHER threshold set: the one
#     used when a DTW-aligned reference-reciter window is available) ---

# 2b. Same idea, but also builds a real referenceAlignment (fetches Husary's
#     everyayah.com audio for 5:109, trims to the QDAT fragment) so
#     checkTajweedRules exercises its reference-anchored branch for real.
npx vite-node tools/qdat-eval/extract-features-ref.mjs -- --data <download-dir>

# 3b. Same tune/holdout method, for the reference-anchored constants.
npx vite-node tools/qdat-eval/tune-thresholds-ref.mjs
```

## Other tools in this folder

- `probe-models.mjs` — checks candidate ASR repos for what the app needs:
  loadable encoder+decoder, Arabic forcing, and word-level timestamps. As of
  2026-07 the app's "accurate" slot uses a real from-scratch export (see
  "Converting the Quran-tuned model yourself" below); this script's `REPOS`
  list is pre-existing candidates from before that export, kept for
  regression-checking new community conversions, not the model currently
  shipping.
- `bench-decoding.mjs` — greedy vs `num_beams` decoding. Finding:
  transformers.js v4 does not implement real beam search for Whisper —
  passing `num_beams` produces byte-identical transcripts at identical
  latency, so there is nothing to gain by exposing a beam-search setting.
- `build-reciter-profile.mjs` + `compile-reciter-profile.mjs` — not QDAT
  tools (no labels involved); builds statistical per-reciter style profiles
  (Madd/nasal-hold pacing, pitch-contour volatility) for reciters with no QUA
  ground-truth timing, into `src/lib/reciterStyleProfiles.js`. See that
  script's header comment for scope and the fairness reasoning behind what
  it deliberately does NOT profile.
- `validate-reciter-style.mjs` — validates whether a reciter style profile
  should be allowed to shift threshold-mode Madd/nasal-hold pass/warn
  verdicts (reuses the cached `features.json`, no re-extraction). Finding
  (2026-07, Alafasy): it made holdout accuracy WORSE across the board —
  Madd 69.4%→66.5%, Ghunnah 79.9%→**38.4%** (far below the 81.1% always-pass
  baseline), Ikhfa 54.0%→51.9%. QDAT labels track canonical correctness, not
  similarity to one reciter's personal pacing, so a reciter's own typical
  timing is NOT a safe stand-in for "correct" — the app now uses reciter
  style profiles for the Style Match sub-score only (an honest similarity
  signal, not a correctness claim), never for verdicts. See the
  `styleTargetRatio`/`styleTargetMinSec` comments in `tajweedAnalysis.js`.

## Converting the Quran-tuned model yourself

`tarteel-ai/whisper-base-ar-quran` with word timestamps is exported and
hosted at `An0xity/whisper-base-ar-quran-onnx-timestamped` (currently
`ASR_MODELS.accurate` / `ASR_MODEL_OPTIONS.accurate`). If it ever needs
re-exporting (different quantization, upstream weight update, etc.), the
transformers.js conversion script (`convert.py`, pinned at v3.3.3) needs two
sibling files it doesn't ship with on its own —
`tools/qdat-eval/onnx_convert/{quantize.py,extra/whisper.py}`, pulled from
the same tag — and, as of 2026-07, three fixes beyond just running it that
took real debugging time to find. Skipping any one of them produces a
model that *loads* but breaks partway through generation, which is a much
harder failure to notice than an outright load error:

1. **`transformers` must stay below 4.43.0.** From 4.43 on, optimum adds a
   `cache_position` decoder input ([PR #31166](https://github.com/huggingface/transformers/pull/31166))
   that this project's `@huggingface/transformers` (currently 4.2.0) has no
   code path to supply — session creation fails outright with `Missing the
   following inputs: cache_position`. `convert-requirements.txt` pins
   `4.42.4`, the last minor below that boundary that's still within
   optimum 1.23.3's supported range.
2. **`torch` must be a version with the legacy (non-dynamo) ONNX exporter.**
   `convert-requirements.txt` doesn't pin `torch` directly, so pip resolves
   whatever's compatible — as of 2026-07 that pulled in `torch` 2.13, whose
   `torch.onnx.export` now *requires* `onnxscript` (absent from
   `convert-requirements.txt`) and, once that's installed, still hits a
   Windows-console Unicode crash printing "✅" during tracing and an
   external-data cleanup bug afterward. `torch==2.5.1+cpu` avoids all three
   by using the older exporter path these tools were actually built against.
3. **Must pass `--skip_onnxslim`.** With `output_attentions`, onnxslim's
   graph simplification pass (run by `convert.py` by default) miswires the
   position-embedding offset computation in the merged decoder graph — it
   replaces a dynamic `Gather` over the real past-cache length with an
   unrelated constant borrowed from decoder layer 0's self-attention block,
   found by diffing the ONNX graph node-by-node against a plain export
   (no `output_attentions`) of matching architecture, which worked fine.
   Generation runs for a few tokens on the traced dummy length, then fails
   with `Slice ... Starts must be a 1-D array` once real generation moves
   past whatever length was used at trace time. This looks like a genuine
   onnxslim bug scoped to the cross-attention-output export path, not
   something specific to this model.

```bash
python -m venv venv && venv/Scripts/pip install -r convert-requirements.txt
venv/Scripts/python -m onnx_convert.convert --model_id tarteel-ai/whisper-base-ar-quran \
  --task automatic-speech-recognition-with-past --output_attentions \
  --skip_onnxslim --quantize --output_parent_dir converted
```

`convert.py`'s own generation-config step (its final step) also fails here —
`tarteel-ai/whisper-base-ar-quran` has no `generation_config.json` of its own
(404 on the Hub) — so it needs finishing by hand: load
`GenerationConfig.from_pretrained("openai/whisper-base")` (verified
architecturally identical fine-tune base), set `.alignment_heads` via
`onnx_convert.extra.whisper.get_alignment_heads(config)`, and
`.save_pretrained(output_model_folder)`. Baking it in at export time this way
means no client-side patch is needed for this specific model —
`src/lib/whisperGenerationPatch.js` still exists for other community exports
that ship incomplete configs, but is a no-op for this one (guarded by
`if (gc.lang_to_id) return`).

Only the files the app actually loads need uploading: the config/tokenizer
JSON files, `generation_config.json`, and the `q8`-quantized
`onnx/encoder_model_quantized.onnx` + `onnx/decoder_model_merged_quantized.onnx`
(the only dtype `asrWorker.js` requests — transformers.js loads
`decoder_model_merged`, not the separate pre-merge `decoder_model.onnx` /
`decoder_with_past_model.onnx`, and the other quantization variants
`--quantize` produces go unused). Verify against the real pipeline before
trusting an export, not just that files exist — the bugs above all produce
onnx files that *look* complete:

```js
import { pipeline, env } from "@huggingface/transformers";
env.allowLocalModels = true; env.allowRemoteModels = false;
env.localModelPath = "tools/qdat-eval/converted";
const asr = await pipeline("automatic-speech-recognition",
  "tarteel-ai/whisper-base-ar-quran",
  { dtype: "q8", local_files_only: true });
const res = await asr(audio, { language: "arabic", task: "transcribe", return_timestamps: "word" });
```

## Results (2026-07, model: onnx-community/whisper-base_timestamped, 1,466 recordings)

Holdout-half accuracy of the app's pass/warn verdict vs QDAT's expert
correct/incorrect label:

| Rule | Before | After tuning | Always-pass baseline | Applied? |
|---|---|---|---|---|
| Madd (Munfasil) | 63.8% | **69.4%** (`maddMinRatioFactor` 0.7→0.925) | 58.4% | yes |
| Ghunnah | 79.9% | 78.1% | 81.1% | no — kept 0.5/10 dB |
| Ikhfa | 54.0% | 54.2% | 51.5% | no — kept 0.5/10 dB |

Takeaway: the Madd duration heuristic has real (modest) signal and its
threshold was too lenient; the Ghunnah/Ikhfa duration+energy-spread
heuristics have almost none beyond the label base rates — matching the
literature, where useful Ghunnah/Ikhfa classification comes from spectral
(MFCC/mel) features, not durations. That is the concrete case for training
a small classifier on QDAT (Phase 2) rather than more threshold-fiddling.

### Iqlab coupling (why Ghunnah is not tuned in isolation)

`nasalHoldCountWordFraction` and `nasalSpikeMaxDb` are a **single shared
pair** used by the whole nasal-hold family — `ghunnah`, `iqlab`,
`idgham_ghunnah`, `ikhfa` (`NASAL_HOLD_RULE_TYPES` in tajweedAnalysis.js).
So "tuning Ghunnah's threshold" is physically the same as tuning Iqlab's.
QDAT has **no Iqlab or Idgham labels** (verse 5:109 contains neither), so
Iqlab can't be scored directly; **Ikhfa is its closest labeled analog**
(both are noon-sakinah assimilations on a nasal hold — Iqlab before ب,
Ikhfa before the 15 Ikhfa letters), whereas Ghunnah is the shaddah-noon
full nasalization with a different trigger.

The tuner's "Iqlab coupling check" finds the shared pair that maximizes
**Ghunnah alone**, then reports the effect on **Ikhfa** (the Iqlab proxy):

| Optimize shared pair for… | → thresholds | Ghunnah holdout | Ikhfa holdout (Iqlab rides this) |
|---|---|---|---|
| Ghunnah alone | {0.1, 11} | 79.9% (flat, < 81.1% baseline) | 54.0% → **53.2%** (worse) |

So chasing Ghunnah doesn't even help Ghunnah (it can't beat the base rate)
**and it degrades the Ikhfa/Iqlab side**. That is the concrete, data-backed
reason the nasal pair is judged jointly and **left unchanged** — doing so is
what protects Iqlab from a Ghunnah-driven regression. Verified improvement
"for Iqlab too" is therefore: *no change is the improvement* (any change
available here is net-negative for the Iqlab family).

## Reference-anchored results (2026-07, same model, 1,466 recordings, reference reciter: Husary)

`extract-features-ref.mjs` builds the exact `referenceAlignment` structure
`compareSamples` produces in the shipping app (real DTW against Husary's
everyayah.com audio for 5:109), so `checkTajweedRules` actually exercises its
reference-anchored branch (`measured.mode === "reference"`) instead of always
falling through to the plain-threshold branch. This validates a *different*
set of constants than the table above — the ones `refWindowForRule` uses when
a trustworthy reference-aligned window exists.

| Rule | Before | After tuning | Always-pass baseline | Applied? |
|---|---|---|---|---|
| Madd | 65.2% | **67.5%** (`maddRefMinRatioFactor` 0.85→0.6) | 56.3% | yes |
| Ghunnah | **42.2%** | 83.4% (`nasalHoldRefRatioFactor` 0.75→0.225, `nasalSpikeRefToleranceFactor` 1.5→0.8) | 85.1% | yes |
| Ikhfa | 58.1% | 57.1% (flat, noise-level) | 53.7% | yes (rides the nasal pair above) |

The Ghunnah number before tuning is not a rounding error: the original
hand-picked reference-anchored pair (0.75, 1.5) scored **worse than always
answering "pass"** — actively harmful, not just unhelpful. The tuned pair
fixes that, though it still lands just under the always-pass baseline: the
same weak-duration-signal story as the threshold-mode table above applies
here too (real Ghunnah/Ikhfa gains need spectral features, not different
duration/energy cutoffs) — the fix is "no longer actively wrong," not "now
discriminative." The Iqlab-coupling check (same method as the threshold-mode
one — optimize the shared pair for Ghunnah alone, read off the effect on
Ikhfa/Iqlab) confirmed the applied pair doesn't cost Ikhfa.

QDAT has no Qalqalah or Idgham-without-Ghunnah labels, so
`qalqalahRefRatioFactor`/`qalqalahRefMinDb` and
`idghamNoGhunnahTransientDb`/`idghamNoGhunnahRefToleranceFactor` remain
hand-picked, same limitation as the threshold-mode table.

## Phase 1: spectral (frequency-based) Ghunnah/Ikhfa detection (2026-07)

Duration and RMS energy (the existing Ghunnah/Ikhfa check) can't distinguish
"a genuine nasal hum happened here" from "any sound was just held a bit
long" — both look identical on those two measurements. Two spectral
candidates were implemented (`frameSpectralFeatures` in `audioAnalysis.js`,
via a hand-rolled FFT — deterministic DSP, not a trained model) and
validated against the same QDAT data as an ADDITION alongside the existing
check, never replacing it:

- **Low/high-band energy ratio** (dB): low band 150-1000 Hz (where a nasal
  murmur concentrates), high band 1000-4000 Hz (oral vowel/consonant
  energy), compared against the recording's own average ratio (a
  self-relative baseline, matching how every other threshold in this file
  compares against the user's own average word duration rather than a fixed
  physical constant — phone mic frequency response varies too much
  device-to-device for an absolute cutoff to be safe).
- **Spectral centroid** (Hz): energy-weighted mean frequency, same
  self-relative comparison.

**Performance** (`bench-spectral-features.mjs`, synthetic 5-minute
Continuous-Recitation-length recording, 80 rule occurrences): the
per-occurrence spectral computation is cheap (~1.5ms/occurrence vs
~0.1ms/occurrence for the existing check), but the recording-wide baseline
(walking every frame once per recording) cost ~780ms — 0.3% of a 5-minute
recording's real time, negligible in absolute terms, but ~127x the existing
approach's total cost and worth knowing about if this is ever revisited for
tighter mobile budgets.

**QDAT validation** (`tune-thresholds-spectral.mjs`, same 1,466 recordings,
same tune/holdout split):

| Rule | Existing (duration/energy) | Band-ratio (tuned) | Centroid (tuned) | Always-pass baseline |
|---|---|---|---|---|
| Ghunnah | 80.0% | 41.0% | 41.6% | 81.1% |
| Ikhfa | 54.2% | 48.0% | 45.5% | 51.8% |

**Neither candidate helps — both are worse than the existing check, and
both are worse than the always-pass baseline.** A quick diagnostic breakdown
of the raw measurements by label (mean low/high ratio for correctly- vs
incorrectly-labeled occurrences) shows the band-ratio's separation is also
in the OPPOSITE direction from the physical hypothesis — correctly-labeled
occurrences average a *lower* low/high ratio than the recording's own
baseline, not higher — and the effect size is small relative to noise (~1 dB
mean difference against a ~2.5 dB standard deviation). Spectral centroid
shows essentially no separation at all (~1.03-1.05 for both labels).

The likely reason isn't that the underlying acoustic theory is wrong, but a
methodological confound specific to this validation: QDAT's fragment
(«قَالُوا۟ لَا عِلْمَ لَنَآ إِنَّكَ أَنتَ عَلَّٰمُ ٱلْغُيُوبِ») is itself dense with other
nasal sounds (عِلْمَ, أَنتَ, عَلَّٰمُ) — so the "recording's own baseline" isn't a
clean "typical oral sound" reference the way it would be for a
nasal-sparser passage; it's already partly nasal-influenced. This is a
plausible explanation, not a proven one — untested further, since chasing
it is out of scope for this phase.

**Verdict: do not adopt.** Ghunnah/Ikhfa stay on the existing duration/energy
check, and their `weak-signal` validation-tier tags stay as they are — this
is a real, negative result, not a failure to find one. The spectral
primitives (`frameSpectralFeatures`, `spectralProfileForCachedWindow`,
`recordingSpectralBaseline` in `audioAnalysis.js`, unit-tested in
`audioAnalysis.test.js`) are kept as general-purpose, validated DSP
utilities — not wired into `checkTajweedRules` (removed after this result,
since it was pure added cost for zero verdict benefit) — because Qalqalah's
planned phonetically-grounded refinement (broadband noise-burst detection)
is expected to need the same FFT infrastructure.

## Phase 3: phonetically-grounded Qalqalah refinement (2026-07)

Qalqalah's check was a blunt "energy rose in the tail" test — which can't
tell a genuine plosive release burst apart from a person just reciting
louder. A real release burst is a short, BROADBAND (noise-like) transient;
a louder tonal sound (a vowel, a sustained note) stays tonal regardless of
loudness. Spectral flatness (`frameSpectralFlatness`/
`flatnessProfileForCachedWindow` in `audioAnalysis.js`, reusing the same FFT
infrastructure built for Phase 1) — near 0 for tonal signals, near 1 for
broadband ones — distinguishes them. The verdict now requires BOTH the
existing energy rise (`bounceDb`) AND a genuine flatness rise in the tail
(`qalqalahBurstFlatnessRise`, new `TAJWEED_THRESHOLDS` constant) — applied
in both threshold and reference-anchored modes, since the burst check is a
property of the user's own window, independent of which baseline the
energy comparison uses.

**No labeled data exists for Qalqalah** (QDAT has none), so this can't be
QDAT-validated the way Phases 1-2 were. Validated instead via synthetic
audio (`tajweedAnalysis.test.js`, "Qalqalah spectral burst refinement"):
a genuine broadband burst passes; a plain louder TONE with the *exact same*
energy rise as the passing case — the false positive the old check could
not tell apart from a real bounce — now correctly warns. This required
updating the shared `makeQalqalahShape` test fixture itself: it previously
used a louder pure tone for its tail (i.e., it was the false-positive case
all along), so the fixture now uses genuine broadband noise, RMS-matched
(scaled by √1.5) to produce numerically equivalent `bounceDb` values to the
original — all ~12 pre-existing Qalqalah tests pass unchanged, since they
were really testing the energy/reference-anchoring logic, not tonality.

**Qalqalah's validation-tier tag stays `unvalidated`** — spectral precision
is not the same as real labeled validation, and no amount of phonetic
rigor changes that without actual data (enforced by a direct test on
`TAJWEED_RULE_DEFINITIONS.qalqalah.validation.status`).

Idgham without Ghunnah shares the identical tail-transient logic (checking
for the transient's *absence* rather than presence) and would likely
benefit from the same refinement — out of scope for this phase, which was
Qalqalah-only, but a natural follow-up.

## Honesty notes

- QDAT's label distribution is skewed (e.g. ~81% of Ghunnah labels are
  "correct"), so the tuner always prints the **always-pass baseline** next
  to each accuracy — a threshold set only means something if it beats that.
- Thresholds are fit on half the data and judged on the other half
  (stable-hash split), so the reported gain isn't just overfitting noise.
- Recordings the ASR can't align ("unchecked" verdicts) are excluded from
  accuracy but reported as a count — that's a coverage limitation of the
  pipeline, not a win.
- QDAT covers only one verse (5:109). The tuned Madd factor could reflect
  that verse's acoustics rather than generalizing; treat it as bounded,
  single-source validation, not proof of broad accuracy.
- Iqlab and Idgham are **not** in QDAT and are only reasoned about through
  the shared nasal threshold + the Ikhfa proxy above — there is no direct
  Iqlab measurement anywhere in these numbers.
- QDAT has no Qalqalah labels; `qalqalahBounceDb` stays hand-picked.
