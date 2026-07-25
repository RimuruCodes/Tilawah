import React, { useState, useRef, useEffect, useCallback } from "react";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, RotateCcw } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECITERS, getAudioUrl } from "@/lib/quranData";
import { getQuaWordWindowsForAyah } from "@/lib/quaReferenceData";

// Finds which word (if any) is playing at time `t`, from a small sorted
// list of {wordIndex, startSec, endSec}. Linear scan is fine — even the
// longest ayah has well under 100 words.
function findActiveWordIndex(windows, t) {
  if (!windows) return null;
  for (const w of windows) {
    if (t >= w.startSec && t < w.endSec) return w.wordIndex;
  }
  return null;
}

export default function AudioPlayer({ surahNumber, ayahs, onAyahHighlight, onWordHighlight, selectedReciter, onReciterChange }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const ayahsRef = useRef(ayahs);
  const currentIndexRef = useRef(0);

  const reciter = RECITERS.find(r => r.id === selectedReciter) || RECITERS[0];
  const reciterFolderRef = useRef(reciter.folder);
  const surahNumberRef = useRef(surahNumber);
  const onAyahHighlightRef = useRef(onAyahHighlight);
  const onWordHighlightRef = useRef(onWordHighlight);
  // Ground-truth word windows for the CURRENTLY LOADED ayah only (null when
  // this reciter+ayah has no QUA coverage) — recomputed once per ayah
  // change, not per playback tick, since it only depends on which ayah is
  // loaded. lastWordIndexRef dedupes onWordHighlight calls so it only fires
  // on an actual word transition, not every 100ms poll tick.
  const currentAyahWordWindowsRef = useRef(null);
  const lastWordIndexRef = useRef(null);

  useEffect(() => {
    ayahsRef.current = ayahs;
  }, [ayahs]);

  useEffect(() => {
    reciterFolderRef.current = reciter.folder;
    surahNumberRef.current = surahNumber;
    onAyahHighlightRef.current = onAyahHighlight;
    onWordHighlightRef.current = onWordHighlight;
  }, [reciter.folder, surahNumber, onAyahHighlight, onWordHighlight]);

  // Recomputes the active ayah's QUA word windows and clears any stale
  // word highlight from the previous ayah — called every time playback
  // moves to a different ayah (loadAyah, and the `ended` auto-advance).
  const primeWordHighlightForAyah = useCallback((ayahNumber) => {
    currentAyahWordWindowsRef.current = getQuaWordWindowsForAyah(
      reciterFolderRef.current,
      surahNumberRef.current,
      ayahNumber
    );
    lastWordIndexRef.current = null;
    onWordHighlightRef.current?.(ayahNumber, null);
  }, []);

  const loadAyah = useCallback((index) => {
    const list = ayahsRef.current;
    if (!list || index < 0 || index >= list.length) return;
    const ayah = list[index];
    const url = getAudioUrl(reciterFolderRef.current, surahNumberRef.current, ayah.number);

    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = url;
      setIsLoading(true);
      setProgress(0);
      setCurrentAyahIndex(index);
      currentIndexRef.current = index;
      onAyahHighlightRef.current?.(ayah.number);
      primeWordHighlightForAyah(ayah.number);
    }
  }, [primeWordHighlightForAyah]);

  useEffect(() => {
    const audio = new Audio();
    audioRef.current = audio;
    audio.volume = volume / 100;

    audio.addEventListener('loadedmetadata', () => {
      setDuration(audio.duration);
      setIsLoading(false);
    });

    audio.addEventListener('canplay', () => {
      setIsLoading(false);
    });

    audio.addEventListener('ended', () => {
      const list = ayahsRef.current;
      const idx = currentIndexRef.current;
      if (list && idx < list.length - 1) {
        const nextIdx = idx + 1;
        const nextAyah = list[nextIdx];
        const url = getAudioUrl(reciterFolderRef.current, surahNumberRef.current, nextAyah.number);
        audio.src = url;
        setCurrentAyahIndex(nextIdx);
        currentIndexRef.current = nextIdx;
        setProgress(0);
        setIsLoading(true);
        onAyahHighlightRef.current?.(nextAyah.number);
        primeWordHighlightForAyah(nextAyah.number);
        audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
      } else {
        setIsPlaying(false);
      }
    });

    audio.addEventListener('error', () => {
      setIsLoading(false);
      setIsPlaying(false);
    });

    return () => {
      audio.pause();
      audio.src = '';
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.volume = isMuted ? 0 : volume / 100;
    }
  }, [volume, isMuted]);

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        if (audioRef.current) {
          const t = audioRef.current.currentTime;
          setProgress(t);

          const activeIdx = findActiveWordIndex(currentAyahWordWindowsRef.current, t);
          if (activeIdx !== lastWordIndexRef.current) {
            lastWordIndexRef.current = activeIdx;
            const ayah = ayahsRef.current?.[currentIndexRef.current];
            if (ayah) onWordHighlightRef.current?.(ayah.number, activeIdx);
          }
        }
      }, 100);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying]);

  // play() rejects on autoplay-policy blocks or when a new src interrupts a
  // pending load; reflect the real outcome in isPlaying instead of letting
  // the rejection escape and the UI claim it's playing.
  const safePlay = useCallback(() => {
    audioRef.current
      ?.play()
      .then(() => setIsPlaying(true))
      .catch(() => setIsPlaying(false));
  }, []);

  const togglePlay = () => {
    if (!audioRef.current?.src || audioRef.current.src === window.location.href) {
      loadAyah(0);
      setTimeout(safePlay, 500);
      return;
    }
    if (isPlaying) {
      audioRef.current.pause();
      setIsPlaying(false);
    } else {
      safePlay();
    }
  };

  const skipPrev = () => {
    const newIdx = Math.max(0, currentAyahIndex - 1);
    loadAyah(newIdx);
    if (isPlaying) {
      setTimeout(safePlay, 300);
    }
  };

  const skipNext = () => {
    if (!ayahs) return;
    const newIdx = Math.min(ayahs.length - 1, currentAyahIndex + 1);
    loadAyah(newIdx);
    if (isPlaying) {
      setTimeout(safePlay, 300);
    }
  };

  const restart = () => {
    loadAyah(0);
    if (isPlaying) {
      setTimeout(safePlay, 300);
    }
  };

  const formatTime = (secs) => {
    if (!secs || isNaN(secs)) return "0:00";
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  return (
    <div className="bg-slate-900/80 backdrop-blur-xl border border-slate-700/50 rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-4">
        <Select value={selectedReciter} onValueChange={onReciterChange}>
          <SelectTrigger aria-label="Choose reciter" className="flex-1 min-w-0 max-w-56 bg-slate-800/50 border-slate-700 text-sm text-slate-300 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-slate-800 border-slate-700">
            {RECITERS.map(r => (
              <SelectItem key={r.id} value={r.id} className="text-slate-300 focus:bg-slate-700 focus:text-white">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {ayahs && (
          <span className="text-xs text-slate-500">
            Ayah {ayahs[currentAyahIndex]?.number || 1} of {ayahs.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-slate-500 font-mono w-10 text-right">{formatTime(progress)}</span>
        <div className="flex-1">
          <Slider
            label="Seek through the recitation audio"
            value={[progress]}
            max={duration || 1}
            step={0.1}
            onValueChange={([v]) => {
              if (audioRef.current) {
                audioRef.current.currentTime = v;
                setProgress(v);
              }
            }}
            className="cursor-pointer"
          />
        </div>
        <span className="text-[10px] text-slate-500 font-mono w-10">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? "Unmute" : "Mute"} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            {isMuted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
          </button>
          <div className="w-20">
            <Slider
              label="Volume"
              value={[isMuted ? 0 : volume]}
              max={100}
              step={1}
              onValueChange={([v]) => { setVolume(v); setIsMuted(false); }}
              className="cursor-pointer"
            />
          </div>
        </div>

        <div className="flex items-center gap-1">
          <button onClick={restart} aria-label="Restart from first ayah" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-400 hover:text-white transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={skipPrev} aria-label="Previous ayah" className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="p-3 rounded-xl bg-emerald-500 text-slate-900 hover:bg-emerald-400 transition-all shadow-lg shadow-emerald-500/25 disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>
          <button onClick={skipNext} aria-label="Next ayah" className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-slate-300 hover:text-white hover:bg-slate-700/50 transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        <div className="w-24" />
      </div>
    </div>
  );
}