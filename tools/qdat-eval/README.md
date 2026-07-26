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
  loadable encoder+decoder, Arabic forcing, and word-level timestamps.
  Finding (2026-07): **no public ONNX conversion of
  `tarteel-ai/whisper-base-ar-quran` supports word timestamps** (none were
  exported with `output_attentions`), so the app's "accurate" slot uses
  `onnx-community/whisper-base_timestamped` (generic multilingual base)
  until a proper conversion is hosted.
- `bench-decoding.mjs` — greedy vs `num_beams` decoding. Finding:
  transformers.js v4 does not implement real beam search for Whisper —
  passing `num_beams` produces byte-identical transcripts at identical
  latency, so there is nothing to gain by exposing a beam-search setting.
## Converting the Quran-tuned model yourself

To get a Quran-tuned model with word timestamps, export
`tarteel-ai/whisper-base-ar-quran` with attention outputs (transformers.js
conversion script, pinned at v3.3.3 — see `convert.py` +
`convert-requirements.txt` in this folder):

```bash
python -m venv venv && venv/Scripts/pip install -r convert-requirements.txt
venv/Scripts/python convert.py --model_id tarteel-ai/whisper-base-ar-quran \
  --output_attentions --quantize --output_parent_dir converted
```

Upload the resulting folder to a Hugging Face repo, then point
`ASR_MODELS.accurate` (src/workers/asrWorker.js) and `ASR_MODEL_OPTIONS`
(src/lib/asrEngine.js) at it. `src/lib/whisperGenerationPatch.js` fills in
the multilingual metadata these exports tend to drop.

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
