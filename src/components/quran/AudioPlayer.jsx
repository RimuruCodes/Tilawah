import React, { useState, useRef, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, RotateCcw, Captions } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECITERS, getAudioUrl } from "@/lib/quranData";
import { getQuaWordWindowsForAyah } from "@/lib/quaReferenceData";
import { isIosWebKit } from "@/lib/asrEngine";
import { findActiveWord } from "@/hooks/useWordHighlight";
import { buildLetterTimings } from "@/lib/letterTiming";
import { getPlaybackRate } from "@/lib/playbackSpeed";
import { getOfflineAudioBlob } from "@/lib/offlinePacks";

// A sticky element fails to recomposite correctly while content changes
// underneath it (e.g. ayah auto-advance during playback) whenever that
// element has ANY non-opaque background, leaving ghosted stale content
// bleeding through — verified on-device: a translateZ/will-change
// compositing-layer hint doesn't fix it, and dropping just the blur
// (keeping bg-slate-900/95) doesn't either, only a fully opaque background
// sidesteps the bug. Originally found on Android's native WebView, but
// confirmed via real WebKit (iPhone profile) against the live production
// site that it also reproduces — as an outright page crash, not just
// ghosting — on iOS, in BOTH the native app AND the plain web browser
// (Chrome-for-iOS is WebKit under the hood too; Apple mandates it). So the
// real risk population is "WebKit-family engine", not "native wrapper".
const IS_RISKY_ENGINE = Capacitor.isNativePlatform() || isIosWebKit();

export default function AudioPlayer({ surahNumber, ayahs, onAyahHighlight, onWordHighlight, selectedReciter, onReciterChange }) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentAyahIndex, setCurrentAyahIndex] = useState(0);
  const [volume, setVolume] = useState(80);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isLoading, setIsLoading] = useState(false);
  // Drives the passive "word highlighting available for this ayah" indicator
  // — purely informational, set alongside currentAyahWordWindowsRef so the
  // UI can react to it (a ref alone wouldn't trigger a re-render).
  const [hasWordHighlighting, setHasWordHighlighting] = useState(false);
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
  // loaded. currentAyahLetterTimingsRef is the even-divided per-letter
  // breakdown of the SAME windows (see letterTiming.js) — null whenever
  // word windows themselves are null, or the ayah text wasn't available to
  // divide against. lastWordRef dedupes onWordHighlight calls so it only
  // fires on an actual word/letter transition, not every 100ms poll tick.
  const currentAyahWordWindowsRef = useRef(null);
  const currentAyahLetterTimingsRef = useRef(null);
  const lastWordRef = useRef(null);
  // Object URL currently assigned to audio.src when playing from a
  // downloaded offline pack (see offlinePacks.js) — revoked whenever
  // replaced or on unmount, so a long session doesn't leak one Object URL
  // per ayah played. null whenever the current src is a plain remote URL.
  const currentObjectUrlRef = useRef(null);
  // Guards loadAyah's async offline-cache lookup against out-of-order
  // completion (e.g. rapid skip-next taps): only the MOST RECENT call's
  // result is ever applied to audio.src.
  const loadSeqRef = useRef(0);

  useEffect(() => {
    ayahsRef.current = ayahs;
  }, [ayahs]);

  useEffect(() => {
    reciterFolderRef.current = reciter.folder;
    surahNumberRef.current = surahNumber;
    onAyahHighlightRef.current = onAyahHighlight;
    onWordHighlightRef.current = onWordHighlight;
  }, [reciter.folder, surahNumber, onAyahHighlight, onWordHighlight]);

  // Recomputes the active ayah's word windows and clears any stale word
  // highlight from the previous ayah — called every time playback moves to
  // a different ayah (loadAyah, and the `ended` auto-advance). QUA ground
  // truth only: word-level highlighting is either free and immediate, or
  // not offered for that ayah — no on-device ASR estimation is triggered
  // from the playback screen (that path used to exist behind a manual
  // "follow along" toggle; removed as a real, confirmed iOS/WebKit crash
  // risk for a small win — casual playback shouldn't be able to crash the
  // page it's running on).
  const primeWordHighlightForAyah = useCallback((ayahNumber) => {
    lastWordRef.current = null;
    onWordHighlightRef.current?.(ayahNumber, null);

    const ayah = ayahsRef.current?.find((a) => a.number === ayahNumber);

    // Letter timing is derived from the word windows (see letterTiming.js
    // for why letter position is itself an estimate even against real QUA
    // word boundaries).
    const quaWindows = getQuaWordWindowsForAyah(reciterFolderRef.current, surahNumberRef.current, ayahNumber);
    currentAyahWordWindowsRef.current = quaWindows;
    currentAyahLetterTimingsRef.current = quaWindows && ayah?.arabic ? buildLetterTimings(quaWindows, ayah.arabic) : null;
    setHasWordHighlighting(!!quaWindows);
  }, []);

  // Async: checks a downloaded offline pack before falling back to the
  // remote URL (see offlinePacks.js's header comment for why this is an
  // explicit lookup here rather than relying on service-worker routing).
  // The synchronous UI-state updates (loading indicator, ayah index,
  // highlight callbacks) still happen immediately, before the await, so the
  // player feels exactly as responsive as before this existed — only the
  // actual audio.src assignment waits on the (normally very fast) cache
  // lookup.
  const loadAyah = useCallback(async (index) => {
    const list = ayahsRef.current;
    if (!list || index < 0 || index >= list.length) return;
    const ayah = list[index];
    const remoteUrl = getAudioUrl(reciterFolderRef.current, surahNumberRef.current, ayah.number);
    if (!audioRef.current) return;

    const seq = ++loadSeqRef.current;
    audioRef.current.pause();
    setIsLoading(true);
    setProgress(0);
    setCurrentAyahIndex(index);
    currentIndexRef.current = index;
    onAyahHighlightRef.current?.(ayah.number);
    primeWordHighlightForAyah(ayah.number);

    const offlineBlob = await getOfflineAudioBlob(reciterFolderRef.current, surahNumberRef.current, ayah.number);
    // A newer loadAyah call has since started (e.g. a rapid second skip
    // tap) — abandon this one rather than clobber the newer src.
    if (loadSeqRef.current !== seq || !audioRef.current) return;

    if (currentObjectUrlRef.current) {
      URL.revokeObjectURL(currentObjectUrlRef.current);
      currentObjectUrlRef.current = null;
    }
    const src = offlineBlob ? URL.createObjectURL(offlineBlob) : remoteUrl;
    if (offlineBlob) currentObjectUrlRef.current = src;

    audioRef.current.src = src;
    // Defensive re-apply: some engines reset playbackRate on a src change,
    // and this project has real cross-browser/WebKit quirks history —
    // cheap enough to just always re-assert it here.
    audioRef.current.playbackRate = getPlaybackRate();
  }, [primeWordHighlightForAyah]);

  useEffect(() => {
    const audio = new Audio();
    // Without this, the browser fetches everyayah.com audio as a no-cors
    // request and the service worker's runtime cache (vite.config.js,
    // CacheFirst on everyayah.com, cacheableResponse statuses [0, 200])
    // stores the resulting OPAQUE response. A later cors-mode fetch() for
    // the same URL (Voice Comparison's reference-audio scoring, see
    // audioAnalysis.js's fetchArrayBuffer) then gets served that cached
    // opaque entry — which the Fetch spec forbids for a non-no-cors
    // request, failing with "net::ERR_FAILED" / "TypeError: Failed to
    // fetch" for an ayah that's actually perfectly fetchable. everyayah.com
    // sends Access-Control-Allow-Origin: * reliably, so requesting CORS
    // here makes every cached entry for these URLs fully readable
    // regardless of which code path fetches it first.
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;
    audio.volume = volume / 100;
    audio.playbackRate = getPlaybackRate();

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
        // Reuses loadAyah (declared above) rather than duplicating its
        // offline-pack-lookup logic — auto-advance gets offline playback
        // for free this way, not as a separately-maintained code path.
        loadAyah(idx + 1).then(() => {
          audio.play().then(() => setIsPlaying(true)).catch(() => setIsPlaying(false));
        });
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
      if (currentObjectUrlRef.current) {
        URL.revokeObjectURL(currentObjectUrlRef.current);
        currentObjectUrlRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primeWordHighlightForAyah/loadAyah have no deps beyond it, stable for the component's lifetime; re-subscribing this effect would tear down the <audio> element.
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

          // Letter granularity when available, falling back to word
          // granularity — never both at once, since currentAyahLetterTimingsRef
          // is only ever non-null when it was successfully derived from the
          // exact word windows currently in currentAyahWordWindowsRef.
          const activeItem = currentAyahLetterTimingsRef.current
            ? findActiveWord(currentAyahLetterTimingsRef.current, t)
            : findActiveWord(currentAyahWordWindowsRef.current, t);
          // Dedupe key includes charIndex: moving between two letters of the
          // SAME word must still fire an update, which a wordIndex-only
          // comparison would miss.
          const activeKey = activeItem ? `${activeItem.wordIndex}:${activeItem.charIndex ?? ""}` : null;
          const lastKey = lastWordRef.current ? `${lastWordRef.current.wordIndex}:${lastWordRef.current.charIndex ?? ""}` : null;
          if (activeKey !== lastKey) {
            lastWordRef.current = activeItem;
            const ayah = ayahsRef.current?.[currentIndexRef.current];
            if (ayah) onWordHighlightRef.current?.(ayah.number, activeItem);
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
    <div className={`${IS_RISKY_ENGINE ? "bg-ink-surface" : "bg-ink-surface/80 backdrop-blur-xl"} border border-ink-border/60 rounded-2xl p-4 space-y-3`}>
      <div className="flex items-center justify-between gap-4">
        <Select value={selectedReciter} onValueChange={onReciterChange}>
          <SelectTrigger aria-label="Choose reciter" className="flex-1 min-w-0 max-w-56 bg-ink-surface-2/50 border-ink-border text-sm text-ink-text-2 h-9">
            <SelectValue />
          </SelectTrigger>
          <SelectContent className="bg-ink-surface-2 border-ink-border">
            {RECITERS.map(r => (
              <SelectItem key={r.id} value={r.id} className="text-ink-text-2 focus:bg-ink-border/50 focus:text-ink-text">
                {r.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {/* Passive status only — never triggers work. Word-level highlighting
            is free (QUA ground truth) or not offered for this ayah; this
            used to be a manual toggle that could trigger fresh on-device ASR
            estimation, which is a confirmed iOS/WebKit crash risk (see
            AudioPlayer.jsx history) for a feature nobody needs to opt into. */}
        <span
          aria-hidden="true"
          title={hasWordHighlighting ? "Word-level highlighting is available for this ayah" : "Word-level highlighting isn't available for this ayah"}
          className={`p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border flex-shrink-0 ${
            hasWordHighlighting
              ? "bg-ink-accent/15 border-ink-accent/40 text-ink-accent"
              : "bg-ink-surface-2/50 border-ink-border text-ink-text-3"
          }`}
        >
          <Captions className="w-4 h-4" />
        </span>

        {ayahs && (
          <span className="text-xs text-ink-text-3">
            Ayah {ayahs[currentAyahIndex]?.number || 1} of {ayahs.length}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2">
        <span className="text-[10px] text-ink-text-3 font-mono w-10 text-right">{formatTime(progress)}</span>
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
        <span className="text-[10px] text-ink-text-3 font-mono w-10">{formatTime(duration)}</span>
      </div>

      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1">
          <button onClick={() => setIsMuted(!isMuted)} aria-label={isMuted ? "Unmute" : "Mute"} className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-text-2 hover:text-ink-text transition-colors">
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
          <button onClick={restart} aria-label="Restart from first ayah" className="p-2 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-text-2 hover:text-ink-text transition-colors">
            <RotateCcw className="w-4 h-4" />
          </button>
          <button onClick={skipPrev} aria-label="Previous ayah" className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-text-2 hover:text-ink-text hover:bg-ink-surface-2/50 transition-colors">
            <SkipBack className="w-5 h-5" />
          </button>
          <button
            onClick={togglePlay}
            disabled={isLoading}
            aria-label={isPlaying ? "Pause" : "Play"}
            className="p-3 rounded-xl bg-ink-accent text-ink-bg hover:brightness-110 transition-all shadow-ink disabled:opacity-50"
          >
            {isLoading ? (
              <div className="w-5 h-5 border-2 border-ink-bg/30 border-t-ink-bg rounded-full animate-spin" />
            ) : isPlaying ? (
              <Pause className="w-5 h-5" />
            ) : (
              <Play className="w-5 h-5 ml-0.5" />
            )}
          </button>
          <button onClick={skipNext} aria-label="Next ayah" className="p-2.5 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-ink-text-2 hover:text-ink-text hover:bg-ink-surface-2/50 transition-colors">
            <SkipForward className="w-5 h-5" />
          </button>
        </div>

        <div className="w-24" />
      </div>
    </div>
  );
}
