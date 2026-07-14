// Side-by-side playback on the result screen: the user's recording and the
// reference reciter play together so the difference can be HEARD, not just
// read as a score. Uses plain <audio> elements (the recording's existing
// blob URL + the reference MP3 URLs the analysis already used, served from
// the browser's HTTP cache) — nothing is re-decoded into memory, which
// matters on the phones that OOM'd when we kept decoded buffers around.
//
// Honest simplicity: the two recordings usually have different lengths, so
// they are started together and each plays at its natural pace ("synced" at
// the start, not time-stretched). The A/B toggle switches which one is loud
// (the other stays quietly audible underneath) and the playhead follows
// YOUR recording on the waveform.
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2 } from "lucide-react";

const LOUD = 1.0;
const QUIET = 0.15;

export default function ComparePlayback({ userUrl, referenceUrls, onPlayhead }) {
  const userAudioRef = useRef(null);
  const refAudioRef = useRef(null);
  const refQueueRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState("user"); // which side is loud: "user" | "reference"

  const applyVolumes = useCallback((focusSide) => {
    if (userAudioRef.current) userAudioRef.current.volume = focusSide === "user" ? LOUD : QUIET;
    if (refAudioRef.current) refAudioRef.current.volume = focusSide === "reference" ? LOUD : QUIET;
  }, []);

  const stopAll = useCallback(() => {
    for (const ref of [userAudioRef, refAudioRef]) {
      if (ref.current) {
        ref.current.pause();
        ref.current.src = "";
        ref.current = null;
      }
    }
    setPlaying(false);
    onPlayhead?.(null);
  }, [onPlayhead]);

  // Full teardown when the result screen unmounts.
  useEffect(() => stopAll, [stopAll]);

  const start = () => {
    stopAll();
    const user = new Audio(userUrl);
    userAudioRef.current = user;
    user.ontimeupdate = () => onPlayhead?.(user.currentTime);
    user.onended = () => {
      // The reference may still be running; leave it to finish quietly.
      onPlayhead?.(null);
      if (!refAudioRef.current || refAudioRef.current.ended) setPlaying(false);
    };

    // Reference: continuous mode has one file per ayah — chain them.
    refQueueRef.current = 0;
    const playNextRef = () => {
      const i = refQueueRef.current++;
      if (i >= referenceUrls.length) {
        refAudioRef.current = null;
        if (!userAudioRef.current || userAudioRef.current.ended) setPlaying(false);
        return;
      }
      const ref = new Audio(referenceUrls[i]);
      refAudioRef.current = ref;
      ref.volume = focus === "reference" ? LOUD : QUIET;
      ref.onended = playNextRef;
      ref.play().catch(() => { refAudioRef.current = null; });
    };

    applyVolumes(focus);
    user.volume = focus === "user" ? LOUD : QUIET;
    user.play().catch(() => setPlaying(false));
    if (referenceUrls.length) playNextRef();
    setPlaying(true);
  };

  const toggleFocus = (side) => {
    setFocus(side);
    applyVolumes(side);
  };

  if (!userUrl) return null;

  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (playing ? stopAll() : start())}
          className="p-2 rounded-lg bg-emerald-500 text-white hover:bg-emerald-400 transition-colors flex-shrink-0"
          aria-label={playing ? "Stop comparison playback" : "Play your recording alongside the reference"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <p className="text-xs text-slate-400 flex-1">Hear the difference — both play together; pick which is louder.</p>
      </div>
      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "user", label: "My recording" },
          { key: "reference", label: "Reference reciter" },
        ].map((side) => (
          <button
            key={side.key}
            onClick={() => toggleFocus(side.key)}
            className={`flex items-center justify-center gap-1.5 py-1.5 rounded-lg text-[11px] font-medium transition-all border ${
              focus === side.key
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-slate-800/50 border-slate-700/30 text-slate-500 hover:text-slate-300"
            }`}
          >
            {focus === side.key && <Volume2 className="w-3 h-3" />}
            {side.label}
          </button>
        ))}
      </div>
      <p className="text-[10px] text-slate-600">
        Both start together and play at their natural pace — pacing differences are part of what you're hearing.
      </p>
    </div>
  );
}
