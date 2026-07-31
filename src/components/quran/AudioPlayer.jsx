import React, { useState, useRef, useEffect, useCallback } from "react";
import { Capacitor } from "@capacitor/core";
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, RotateCcw, Captions, Loader2 } from "lucide-react";
import { Slider } from "@/components/ui/slider";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RECITERS, getAudioUrl } from "@/lib/quranData";
import { getQuaWordWindowsForAyah } from "@/lib/quaReferenceData";
import { getCachedWordTimings } from "@/lib/wordTimingCache";
import { estimateReferenceWordTiming } from "@/lib/recitationService";
import { isAsrEnabled, isIosWebKit } from "@/lib/asrEngine";
import { findActiveWord } from "@/hooks/useWordHighlight";
import { buildLetterTimings } from "@/lib/letterTiming";

const FOLLOW_ALONG_KEY = "qc_follow_along_enabled";

function getStoredFollowAlong() {
  return localStorage.getItem(FOLLOW_ALONG_KEY) === "on";
}

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
  // Opt-in, persisted: gates whether a cache MISS triggers new ASR
  // estimation for a non-QUA ayah. Already-cached/QUA data is always shown
  // regardless of this toggle — it only gates NEW on-device computation.
  const [followAlongEnabled, setFollowAlongEnabled] = useState(getStoredFollowAlong);
  const [estimating, setEstimating] = useState(false);
  const asrDeviceEnabled = isAsrEnabled(); // device-level gate; re-read on mount is enough, Settings changes take effect on next visit
  const audioRef = useRef(null);
  const intervalRef = useRef(null);
  const ayahsRef = useRef(ayahs);
  const currentIndexRef = useRef(0);

  const reciter = RECITERS.find(r => r.id === selectedReciter) || RECITERS[0];
  const reciterFolderRef = useRef(reciter.folder);
  const surahNumberRef = useRef(surahNumber);
  const onAyahHighlightRef = useRef(onAyahHighlight);
  const onWordHighlightRef = useRef(onWordHighlight);
  const followAlongEnabledRef = useRef(followAlongEnabled);
  // Ground-truth/estimated word windows for the CURRENTLY LOADED ayah only
  // (null when nothing is available for this reciter+ayah) — recomputed
  // once per ayah change, not per playback tick, since it only depends on
  // which ayah is loaded. currentAyahLetterTimingsRef is the even-divided
  // per-letter breakdown of the SAME windows (see letterTiming.js) — null
  // whenever word windows themselves are null, or the ayah text wasn't
  // available to divide against. lastWordRef dedupes onWordHighlight calls
  // so it only fires on an actual word/letter transition, not every 100ms
  // poll tick.
  const currentAyahWordWindowsRef = useRef(null);
  const currentAyahLetterTimingsRef = useRef(null);
  const lastWordRef = useRef(null);
  // Invalidates an in-flight async word-timing lookup if the ayah changes
  // again before it resolves (skip/restart while a cache-or-estimate call
  // is still pending) — same pattern as runSeqRef elsewhere in this app.
  const wordTimingSeqRef = useRef(0);

  useEffect(() => {
    ayahsRef.current = ayahs;
  }, [ayahs]);

  useEffect(() => {
    reciterFolderRef.current = reciter.folder;
    surahNumberRef.current = surahNumber;
    onAyahHighlightRef.current = onAyahHighlight;
    onWordHighlightRef.current = onWordHighlight;
    followAlongEnabledRef.current = followAlongEnabled;
  }, [reciter.folder, surahNumber, onAyahHighlight, onWordHighlight, followAlongEnabled]);

  // Recomputes the active ayah's word windows and clears any stale word
  // highlight from the previous ayah — called every time playback moves to
  // a different ayah (loadAyah, and the `ended` auto-advance).
  //
  // Resolution order: QUA ground truth first (synchronous, free) — if
  // absent, an already-cached ASR estimate (async but free — no model
  // work) — if THAT'S also absent and the person has opted into follow-
  // along, a fresh ASR estimate (the only path that can actually trigger
  // on-device transcription, and only then).
  const primeWordHighlightForAyah = useCallback((ayahNumber) => {
    const seq = ++wordTimingSeqRef.current;
    const isStale = () => wordTimingSeqRef.current !== seq;

    lastWordRef.current = null;
    onWordHighlightRef.current?.(ayahNumber, null);

    const ayah = ayahsRef.current?.find((a) => a.number === ayahNumber);

    // Letter timing is always derived from whatever word windows we have —
    // real QUA windows or ASR-estimated ones alike (see letterTiming.js for
    // why letter position is an estimate either way) — so every path below
    // sets both refs together rather than letting them drift out of sync.
    const setWordWindows = (windows) => {
      currentAyahWordWindowsRef.current = windows;
      currentAyahLetterTimingsRef.current = windows && ayah?.arabic ? buildLetterTimings(windows, ayah.arabic) : null;
    };

    const quaWindows = getQuaWordWindowsForAyah(reciterFolderRef.current, surahNumberRef.current, ayahNumber);
    if (quaWindows) {
      setWordWindows(quaWindows);
      return;
    }
    setWordWindows(null);

    if (!ayah?.arabic) return;

    (async () => {
      if (followAlongEnabledRef.current && asrDeviceEnabled) {
        setEstimating(true);
        const result = await estimateReferenceWordTiming({
          reciterFolder: reciterFolderRef.current,
          surahNumber: surahNumberRef.current,
          ayahNumber,
          ayahArabicText: ayah.arabic,
        });
        if (isStale()) return;
        setEstimating(false);
        if (result.words) setWordWindows(result.words);
      } else {
        // Toggle is off (or ASR is off for this device): only ever show
        // data that's ALREADY cached from a previous opted-in session —
        // never trigger new computation.
        const cached = await getCachedWordTimings(reciterFolderRef.current, surahNumberRef.current, ayahNumber);
        if (isStale()) return;
        if (cached?.words?.length) setWordWindows(cached.words);
      }
    })();
  }, [asrDeviceEnabled]);

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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- primeWordHighlightForAyah is stable enough in practice (only asrDeviceEnabled in its deps, fixed for the component's lifetime); re-subscribing this effect would tear down the <audio> element.
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

  const toggleFollowAlong = () => {
    const next = !followAlongEnabled;
    setFollowAlongEnabled(next);
    // Sync the ref immediately, not just via the effect below: the
    // re-prime call right after this needs the NEW value NOW, and effects
    // run after this function returns — reading the stale ref here would
    // silently take the "cache-only" branch on the very click that's
    // supposed to turn estimation on.
    followAlongEnabledRef.current = next;
    localStorage.setItem(FOLLOW_ALONG_KEY, next ? "on" : "off");
    // Turning it on should light up the CURRENT ayah immediately, not wait
    // for the next ayah transition.
    if (next) {
      const ayah = ayahsRef.current?.[currentIndexRef.current];
      if (ayah) primeWordHighlightForAyah(ayah.number);
    }
  };

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
    <div className={`${IS_RISKY_ENGINE ? "bg-slate-900" : "bg-slate-900/80 backdrop-blur-xl"} border border-slate-700/50 rounded-2xl p-4 space-y-3`}>
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

        {/* Only offered when this device allows ASR at all — matches the
            same isAsrEnabled() gate Tajweed's word-level checks use. When
            it's off (e.g. default on iOS), already-QUA-covered ayahs still
            highlight; this control simply doesn't appear, since it can
            only ever trigger NEW on-device work. */}
        {asrDeviceEnabled && (
          <button
            onClick={toggleFollowAlong}
            aria-pressed={followAlongEnabled}
            aria-label={followAlongEnabled ? "Turn off follow-along word highlighting" : "Turn on follow-along word highlighting"}
            title={followAlongEnabled ? "Follow-along highlighting is on" : "Turn on follow-along word highlighting (estimates timing on-device, once per ayah, then remembers it)"}
            className={`p-2 min-h-[36px] min-w-[36px] flex items-center justify-center rounded-lg border transition-colors flex-shrink-0 ${
              followAlongEnabled
                ? "bg-emerald-500/15 border-emerald-500/40 text-emerald-300"
                : "bg-slate-800/50 border-slate-700 text-slate-500 hover:text-slate-300"
            }`}
          >
            {estimating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Captions className="w-4 h-4" />}
          </button>
        )}

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
