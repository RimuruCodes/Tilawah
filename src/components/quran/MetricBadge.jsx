import React from "react";

const EXPLANATIONS = {
  Rhythm: "How closely your pacing/timing pattern matched the reference reciter, measured via waveform alignment (DTW).",
  Loudness: "How closely your loudness/emphasis pattern over time matched the reference reciter's.",
  Pitch: "How closely your intonation (the rise and fall of your voice) matched the reference reciter's.",
  "Style Match": "How closely your Madd elongation, nasal-hold pacing, and pitch-contour volatility matched this specific reciter's typical style, based on a statistical profile built from many of their recordings. Only shown for reciters with a built profile.",
};

export default function MetricBadge({ label, value }) {
  if (value == null) return null;
  return (
    <div
      className="bg-slate-800/50 rounded-lg p-2 border border-slate-700/30 cursor-help"
      title={EXPLANATIONS[label] || label}
    >
      <div className="text-sm font-semibold text-white">{value}</div>
      <div className="text-[10px] text-slate-500">{label}</div>
    </div>
  );
}
