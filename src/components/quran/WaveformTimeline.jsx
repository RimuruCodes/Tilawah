import React, { useState } from "react";

const WIDTH = 600;
const HEIGHT = 90;
const MARKER_COLORS = {
  pass: "#34d399", // emerald-400
  warn: "#fbbf24", // amber-400
  unchecked: "#64748b", // slate-500
};

// `playheadSec` (optional): current playback position — drawn as a solid
// vertical line so compare-playback can sweep across the waveform.
export default function WaveformTimeline({ envelope, ruleMarkers = [], playheadSec = null }) {
  const [selected, setSelected] = useState(null);

  if (!envelope || envelope.points.length === 0) return null;

  const { points, durationSec } = envelope;
  const barWidth = WIDTH / points.length;
  const timeToX = (t) => (durationSec > 0 ? (t / durationSec) * WIDTH : 0);

  const markersWithPosition = ruleMarkers
    .filter((m) => m.startSec != null && m.endSec != null)
    .map((m, i) => ({ ...m, x: timeToX((m.startSec + m.endSec) / 2), key: i }));

  return (
    <div className="space-y-2">
      <svg
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-20 rounded-lg bg-slate-900/60 border border-slate-700/30"
      >
        {points.map((v, i) => {
          const barHeight = Math.max(2, v * (HEIGHT - 16));
          return (
            <rect
              key={i}
              x={i * barWidth}
              y={(HEIGHT - barHeight) / 2}
              width={Math.max(1, barWidth - 0.5)}
              height={barHeight}
              fill="#10b981"
              opacity={0.45}
            />
          );
        })}

        {playheadSec != null && playheadSec >= 0 && (
          <line
            x1={timeToX(Math.min(playheadSec, durationSec))}
            y1={0}
            x2={timeToX(Math.min(playheadSec, durationSec))}
            y2={HEIGHT}
            stroke="#f8fafc"
            strokeWidth={1.5}
            opacity={0.9}
          />
        )}

        {markersWithPosition.map((m) => (
          <g
            key={m.key}
            onClick={() => setSelected(selected === m.key ? null : m.key)}
            style={{ cursor: "pointer" }}
          >
            <line x1={m.x} y1={0} x2={m.x} y2={HEIGHT} stroke={MARKER_COLORS[m.verdict] || MARKER_COLORS.unchecked} strokeWidth={selected === m.key ? 2 : 1} strokeDasharray="3,2" opacity={0.9} />
            <circle cx={m.x} cy={8} r={selected === m.key ? 6 : 5} fill={MARKER_COLORS[m.verdict] || MARKER_COLORS.unchecked} stroke="#0f172a" strokeWidth={1.5} />
          </g>
        ))}
      </svg>

      {markersWithPosition.length > 0 && (
        <p className="text-[10px] text-slate-500 text-center">Tap a marker on the timeline to see what it means</p>
      )}

      {selected != null && (() => {
        const m = markersWithPosition.find((x) => x.key === selected);
        if (!m) return null;
        return (
          <div className="bg-slate-800/50 rounded-lg p-3 border border-slate-700/30 flex items-start gap-2">
            <span className="text-sm mt-0.5">{m.verdict === "pass" ? "✅" : m.verdict === "warn" ? "⚠️" : "➖"}</span>
            <div>
              <p className="text-xs font-medium text-slate-300">{m.label} — "{m.word}"</p>
              <p className="text-[11px] text-slate-500 leading-relaxed mt-0.5">{m.note}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
