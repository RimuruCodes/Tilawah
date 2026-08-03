import React, { useState } from "react";

const WIDTH = 600;
const HEIGHT = 90;
// Read as raw CSS custom properties (not Tailwind classes) since SVG
// fill/stroke attributes take literal color strings — these still resolve
// per the active theme exactly like the Tailwind ink-* utilities do.
const MARKER_COLORS = {
  pass: "hsl(var(--ink-success))",
  warn: "hsl(var(--ink-warning))",
  unchecked: "hsl(var(--ink-text-tertiary))",
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
      {/* Hidden from assistive tech: the waveform is a visual affordance,
          and every rule marker's label/verdict/note is also presented as
          text in TajweedResultsPanel — screen-reader users lose nothing. */}
      <svg
        aria-hidden="true"
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        preserveAspectRatio="none"
        className="w-full h-20 rounded-lg bg-ink-surface/60 border border-ink-border/60"
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
              fill="hsl(var(--ink-accent-primary))"
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
            stroke="hsl(var(--ink-text-primary))"
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
            <circle cx={m.x} cy={8} r={selected === m.key ? 6 : 5} fill={MARKER_COLORS[m.verdict] || MARKER_COLORS.unchecked} stroke="hsl(var(--ink-bg-surface))" strokeWidth={1.5} />
          </g>
        ))}
      </svg>

      {markersWithPosition.length > 0 && (
        <p className="text-[10px] text-ink-text-3 text-center">Tap a marker on the timeline to see what it means</p>
      )}

      {selected != null && (() => {
        const m = markersWithPosition.find((x) => x.key === selected);
        if (!m) return null;
        return (
          <div className="bg-ink-surface-2/50 rounded-lg p-3 border border-ink-border/60 flex items-start gap-2">
            <span className="text-sm mt-0.5">{m.verdict === "pass" ? "✅" : m.verdict === "warn" ? "⚠️" : "➖"}</span>
            <div>
              <p className="text-xs font-medium text-ink-text-2">{m.label} — "{m.word}"</p>
              <p className="text-[11px] text-ink-text-3 leading-relaxed mt-0.5">{m.note}</p>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
