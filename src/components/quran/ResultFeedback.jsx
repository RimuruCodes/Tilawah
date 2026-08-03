import React, { useState } from "react";
import { Flag, CheckCircle2 } from "lucide-react";
import { FeedbackReport } from "@/lib/localDb";
import { buildFlagOptions, buildFeedbackReport } from "@/lib/feedbackReports";

// Small, explicit "This result seems off" affordance for the result
// screens: pick which verdict felt wrong, optionally say why, stored
// locally only (see src/lib/feedbackReports.js). Not analytics — nothing
// leaves the device.
export default function ResultFeedback({ surahNumber, surahName, ayahNumbers, score, ruleChecks, mode }) {
  const [state, setState] = useState("idle"); // idle, picking, saved
  const [selectedId, setSelectedId] = useState("overall");
  const [note, setNote] = useState("");

  const options = buildFlagOptions({ score, ruleChecks });

  const handleSubmit = async () => {
    const option = options.find((o) => o.id === selectedId) || options[0];
    await FeedbackReport.create(
      buildFeedbackReport({ option, note, surahNumber, surahName, ayahNumbers, score, mode })
    );
    setState("saved");
  };

  if (state === "saved") {
    return (
      <div className="flex items-center gap-2 text-xs text-ink-text-3 px-1">
        <CheckCircle2 className="w-3.5 h-3.5 text-ink-accent" />
        Noted — saved on this device. You can export feedback reports from Settings.
      </div>
    );
  }

  if (state === "idle") {
    return (
      <button
        onClick={() => setState("picking")}
        className="flex items-center gap-1.5 text-xs text-ink-text-3 hover:text-ink-text-2 underline underline-offset-2 px-1"
      >
        <Flag className="w-3 h-3" />
        This result seems off
      </button>
    );
  }

  return (
    <div className="bg-ink-surface-2/30 rounded-xl p-3 border border-ink-border/60 space-y-2">
      <p className="text-xs text-ink-text-2">Which part felt wrong? Saved only on this device — no audio, nothing uploaded.</p>
      <div className="space-y-1 max-h-40 overflow-y-auto">
        {options.map((o) => (
          <label key={o.id} className="flex items-start gap-2 text-xs text-ink-text-2 cursor-pointer py-0.5">
            <input
              type="radio"
              name="feedback-flag"
              checked={selectedId === o.id}
              onChange={() => setSelectedId(o.id)}
              className="mt-0.5 accent-ink-accent"
            />
            <span>{o.label}</span>
          </label>
        ))}
      </div>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="Optional: what did you expect instead?"
        rows={2}
        maxLength={500}
        className="w-full bg-ink-bg border border-ink-border rounded-lg px-2.5 py-1.5 text-xs text-ink-text placeholder:text-ink-text-3 resize-none"
      />
      <div className="flex gap-2">
        <button
          onClick={handleSubmit}
          className="flex-1 py-1.5 rounded-lg bg-ink-surface-2 text-ink-text-2 text-xs font-medium hover:brightness-110 transition-colors"
        >
          Save report
        </button>
        <button
          onClick={() => setState("idle")}
          className="px-3 py-1.5 rounded-lg text-ink-text-3 text-xs hover:text-ink-text-2"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
