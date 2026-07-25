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
//
// Word-by-word follow-along: BOTH sides highlight their own currently-
// spoken word at once, in visibly different styles (color AND shape, not
// color alone) — using useWordHighlight against whichever timing data the
// caller already has (QUA ground truth, ASR-estimated, or the user's own
// Tajweed-analysis word timing). Purely additive: with no word data for a
// side, that side just shows plain text, exactly like before this feature.
import React, { useEffect, useRef, useState, useCallback } from "react";
import { Play, Pause, Volume2 } from "lucide-react";
import { splitAyahIntoWords } from "@/lib/tajweedRules";
import { useWordHighlight } from "@/hooks/useWordHighlight";

const LOUD = 1.0;
const QUIET = 0.15;
const LOW_CONFIDENCE_THRESHOLD = 0.7; // matches AyahDisplay.jsx / tajweedAnalysis.js's "shaky" cutoff

// One color-coded, word-highlighted line of Arabic text. `side` picks the
// color scheme so "reciter" and "you" are never visually ambiguous even
// without color (reciter: solid underline; you: solid background box) —
// mirrors AyahDisplay's low-confidence dashed treatment for estimated timing.
function HighlightedText({ text, activeWord, side }) {
  if (!text) return null;
  const words = splitAyahIntoWords(text);
  const activeIdx = activeWord?.wordIndex ?? null;
  const lowConfidence = activeWord != null && activeWord.confidence != null && activeWord.confidence < LOW_CONFIDENCE_THRESHOLD;

  return (
    <p
      dir="rtl"
      lang="ar"
      className="text-base leading-loose text-right"
      style={{ fontFamily: "var(--font-arabic)", lineHeight: "2.4" }}
    >
      {words.map((word, i) => {
        const active = i === activeIdx;
        let cls = "transition-colors duration-150 rounded px-0.5 ";
        if (active && lowConfidence) {
          cls += side === "reference"
            ? "text-sky-300/90 border-b-2 border-dashed border-sky-400/60"
            : "text-emerald-300/90 border-b-2 border-dashed border-emerald-400/60";
        } else if (active) {
          cls += side === "reference"
            ? "bg-sky-500/20 text-sky-300 underline decoration-2 underline-offset-4"
            : "bg-emerald-500/20 text-emerald-300";
        } else {
          cls += "text-slate-300";
        }
        return (
          <span key={i}>
            <span className={cls}>{word}</span>
            {" "}
          </span>
        );
      })}
    </p>
  );
}

export default function ComparePlayback({
  userUrl,
  referenceUrls,
  onPlayhead,
  userAyahText = null,
  userWords = null,
  referenceAyahTexts = null,
  referenceWordsByAyah = null,
}) {
  const userAudioRef = useRef(null);
  const refAudioRef = useRef(null);
  const refQueueRef = useRef(0);
  const [playing, setPlaying] = useState(false);
  const [focus, setFocus] = useState("user"); // which side is loud: "user" | "reference"
  const [userTime, setUserTime] = useState(0);
  const [refTime, setRefTime] = useState(0);
  const [refPlayingIndex, setRefPlayingIndex] = useState(0);

  const userActiveWord = useWordHighlight(userWords, playing ? userTime : null);
  const refWordsForCurrentAyah = referenceWordsByAyah?.[refPlayingIndex] ?? null;
  const refActiveWord = useWordHighlight(refWordsForCurrentAyah, playing ? refTime : null);
  const refTextForCurrentAyah = referenceAyahTexts?.[refPlayingIndex] ?? null;

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
    setUserTime(0);
    setRefTime(0);
    onPlayhead?.(null);
  }, [onPlayhead]);

  // Full teardown when the result screen unmounts.
  useEffect(() => stopAll, [stopAll]);

  const start = () => {
    stopAll();
    const user = new Audio(userUrl);
    userAudioRef.current = user;
    user.ontimeupdate = () => {
      onPlayhead?.(user.currentTime);
      setUserTime(user.currentTime);
    };
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
      setRefPlayingIndex(i);
      setRefTime(0);
      const ref = new Audio(referenceUrls[i]);
      refAudioRef.current = ref;
      ref.volume = focus === "reference" ? LOUD : QUIET;
      ref.ontimeupdate = () => setRefTime(ref.currentTime);
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

  const hasAnyWordData = !!(userWords?.length || refWordsForCurrentAyah?.length);

  return (
    <div className="rounded-xl bg-slate-800/30 border border-slate-700/30 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <button
          onClick={() => (playing ? stopAll() : start())}
          className="p-2 rounded-lg bg-emerald-500 text-slate-900 hover:bg-emerald-400 transition-colors flex-shrink-0"
          aria-label={playing ? "Stop comparison playback" : "Play your recording alongside the reference"}
        >
          {playing ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4 ml-0.5" />}
        </button>
        <p className="text-xs text-slate-400 flex-1">Hear the difference — both play together; pick which is louder.</p>
      </div>

      {playing && (userAyahText || refTextForCurrentAyah) && (
        <div className="space-y-2 py-1">
          {refTextForCurrentAyah && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] uppercase tracking-wide text-sky-400/80 font-medium pt-1.5 flex-shrink-0">Reciter</span>
              <HighlightedText text={refTextForCurrentAyah} activeWord={refActiveWord} side="reference" />
            </div>
          )}
          {userAyahText && (
            <div className="flex items-start gap-2">
              <span className="text-[10px] uppercase tracking-wide text-emerald-400/80 font-medium pt-1.5 flex-shrink-0">You</span>
              <HighlightedText text={userAyahText} activeWord={userActiveWord} side="user" />
            </div>
          )}
          {!hasAnyWordData && (
            <p className="text-[10px] text-slate-600">Word-by-word timing isn't available for this reciter/ayah yet — text shown without highlighting.</p>
          )}
        </div>
      )}

      <div className="grid grid-cols-2 gap-2">
        {[
          { key: "user", label: "My recording" },
          { key: "reference", label: "Reference reciter" },
        ].map((side) => (
          <button
            key={side.key}
            onClick={() => toggleFocus(side.key)}
            aria-pressed={focus === side.key}
            aria-label={`Make ${side.label.toLowerCase()} the louder one`}
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
