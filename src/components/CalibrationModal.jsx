import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Loader2, CheckCircle2, AlertTriangle, RotateCcw } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { decodeUserRecording } from "@/lib/recitationService";
import { calibrateFromSamples } from "@/lib/micCalibration";
import { TARGET_SAMPLE_RATE } from "@/lib/audioAnalysis";
import { getSupportedRecorderMimeType } from "@/lib/mediaUtils";

const CALIBRATION_SECONDS = 3;

export default function CalibrationModal({ open, onClose }) {
  const [state, setState] = useState("idle"); // idle, recording, processing, done, error
  const [secondsLeft, setSecondsLeft] = useState(CALIBRATION_SECONDS);
  const [result, setResult] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");
  const streamRef = useRef(null);
  const countdownRef = useRef(null);

  useEffect(() => {
    if (!open) reset();
    return () => {
      if (countdownRef.current) clearInterval(countdownRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
  }, [open]);

  const reset = () => {
    setState("idle");
    setSecondsLeft(CALIBRATION_SECONDS);
    setResult(null);
    setErrorMessage("");
    if (countdownRef.current) clearInterval(countdownRef.current);
  };

  const startCalibration = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      const mimeType = getSupportedRecorderMimeType();
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType } : undefined);
      const chunks = [];
      recorder.ondataavailable = (e) => { if (e.data.size > 0) chunks.push(e.data); };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        setState("processing");
        try {
          const blob = new Blob(chunks, { type: recorder.mimeType || "audio/webm" });
          const samples = await decodeUserRecording(blob);
          const calibration = calibrateFromSamples(samples, TARGET_SAMPLE_RATE);
          setResult(calibration);
          setState("done");
        } catch (err) {
          console.error(err);
          setErrorMessage("Couldn't process that recording. Please try again.");
          setState("error");
        }
      };

      recorder.start();
      setState("recording");
      setSecondsLeft(CALIBRATION_SECONDS);
      countdownRef.current = setInterval(() => {
        setSecondsLeft((s) => {
          if (s <= 1) {
            clearInterval(countdownRef.current);
            if (recorder.state === "recording") recorder.stop();
            return 0;
          }
          return s - 1;
        });
      }, 1000);
    } catch (err) {
      setErrorMessage("Couldn't access your microphone. Please check permissions and try again.");
      setState("error");
    }
  };

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="bg-slate-900 border-slate-700/50 max-w-md p-0">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-1.5">
            <h3 className="text-lg font-semibold text-white">Calibrate Microphone</h3>
            <p className="text-sm text-slate-400">
              Helps the app tell real speech apart from background noise on your specific device/room.
            </p>
          </div>

          <AnimatePresence mode="wait">
            {state === "idle" && (
              <motion.div key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-4">
                <p className="text-xs text-slate-500 text-center">
                  Stay quiet for {CALIBRATION_SECONDS} seconds after tapping start — this just measures your room's ambient noise level.
                </p>
                <button onClick={startCalibration} className="w-16 h-16 rounded-full bg-emerald-500/20 border-2 border-emerald-500/50 flex items-center justify-center hover:bg-emerald-500/30 transition-all">
                  <Mic className="w-7 h-7 text-emerald-400" />
                </button>
              </motion.div>
            )}

            {state === "recording" && (
              <motion.div key="recording" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-4">
                <div className="w-16 h-16 rounded-full bg-red-500/20 border-2 border-red-500/50 flex items-center justify-center">
                  <span className="text-2xl font-bold text-red-400">{secondsLeft}</span>
                </div>
                <p className="text-sm text-slate-400">Stay quiet...</p>
              </motion.div>
            )}

            {state === "processing" && (
              <motion.div key="processing" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-4">
                <Loader2 className="w-8 h-8 text-emerald-400 animate-spin" />
                <p className="text-sm text-slate-400">Measuring...</p>
              </motion.div>
            )}

            {state === "error" && (
              <motion.div key="error" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-4 text-center">
                <AlertTriangle className="w-8 h-8 text-orange-400" />
                <p className="text-sm text-slate-300">{errorMessage}</p>
                <button onClick={reset} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors">
                  Try Again
                </button>
              </motion.div>
            )}

            {state === "done" && result && (
              <motion.div key="done" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex flex-col items-center gap-3 py-2 text-center">
                <CheckCircle2 className="w-9 h-9 text-emerald-400" />
                <p className="text-sm text-slate-300">Calibrated — noise floor: {result.noiseFloorDb.toFixed(1)} dB</p>
                <p className="text-xs text-slate-500">This will be used automatically in future recordings.</p>
                <div className="flex gap-2 pt-2">
                  <button onClick={reset} className="px-4 py-2 rounded-xl bg-slate-800 text-slate-300 text-sm font-medium hover:bg-slate-700 transition-colors flex items-center gap-1.5">
                    <RotateCcw className="w-3.5 h-3.5" />
                    Redo
                  </button>
                  <button onClick={onClose} className="px-4 py-2 rounded-xl bg-emerald-500/20 text-emerald-400 text-sm font-medium hover:bg-emerald-500/30 transition-colors">
                    Done
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </DialogContent>
    </Dialog>
  );
}
