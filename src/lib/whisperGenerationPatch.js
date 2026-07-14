// Community ONNX conversions of tarteel-ai/whisper-base-ar-quran ship a
// stripped generation_config.json (no lang_to_id/task_to_id/alignment_heads),
// which makes transformers.js refuse `language: "arabic"` ("English-only
// model") and breaks word-level timestamps. The fine-tune is architecturally
// plain multilingual whisper-base, so the canonical metadata from the
// official Xenova/whisper-base conversion applies verbatim — these values
// are copied from that repo's generation_config.json.
const WHISPER_BASE_MULTILINGUAL_METADATA = {
  is_multilingual: true,
  // Only the tokens this app ever forces; the full lang_to_id map isn't needed.
  lang_to_id: { "<|ar|>": 50272 },
  task_to_id: { transcribe: 50359, translate: 50358 },
  no_timestamps_token_id: 50363,
  // Cross-attention heads used for word-timestamp DTW alignment.
  alignment_heads: [[3, 1], [4, 2], [4, 3], [4, 7], [5, 1], [5, 2], [5, 4], [5, 6]],
};

// Merges the missing metadata into a loaded pipeline's generation config
// when absent. No-op for models that already carry it (e.g. Xenova/whisper-tiny).
export function patchWhisperGenerationConfig(transcriber) {
  const gc = transcriber?.model?.generation_config;
  if (!gc || gc.lang_to_id) return;
  Object.assign(gc, WHISPER_BASE_MULTILINGUAL_METADATA);
}
