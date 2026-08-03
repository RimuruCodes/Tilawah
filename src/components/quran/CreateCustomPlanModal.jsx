import React, { useState, useMemo } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { BookOpen } from "lucide-react";
import { SURAHS } from "@/lib/quranData";
import { createCustomPlan, validateCustomPlanInput } from "@/lib/recitationPlans";

// Phase 4: lets someone build their own memorization plan (any surah/ayah
// range, any target day count) instead of only the pre-built Juz Amma plan
// — reuses createCustomPlan/validateCustomPlanInput, which reuse the exact
// same {day, surahs} shape and getPlanProgress logic the built-in plan
// already uses (see recitationPlans.js).
export default function CreateCustomPlanModal({ open, onClose, onCreate }) {
  const [startSurah, setStartSurah] = useState(1);
  const [startAyah, setStartAyah] = useState(1);
  const [endSurah, setEndSurah] = useState(1);
  const [endAyah, setEndAyah] = useState(SURAHS[0].ayahs);
  const [targetDays, setTargetDays] = useState(30);

  const startSurahData = SURAHS.find((s) => s.number === startSurah);
  const endSurahData = SURAHS.find((s) => s.number === endSurah);

  const input = {
    startSurah,
    startAyah: Number(startAyah) || 0,
    endSurah,
    endAyah: Number(endAyah) || 0,
    targetDays: Number(targetDays) || 0,
  };
  const error = useMemo(() => validateCustomPlanInput(input), [startSurah, startAyah, endSurah, endAyah, targetDays]);

  const reset = () => {
    setStartSurah(1);
    setStartAyah(1);
    setEndSurah(1);
    setEndAyah(SURAHS[0].ayahs);
    setTargetDays(30);
  };

  const close = () => {
    reset();
    onClose();
  };

  const handleCreate = () => {
    if (error) return;
    const plan = createCustomPlan(input);
    onCreate(plan);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="bg-ink-surface border-ink-border max-w-md p-0">
        <div className="p-6 space-y-4">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-12 h-12 rounded-2xl bg-ink-accent-soft border border-ink-accent/20">
              <BookOpen className="w-6 h-6 text-ink-accent" />
            </div>
            <h3 className="text-lg font-semibold text-ink-text">Create your own plan</h3>
            <p className="text-sm text-ink-text-2">
              Pick a starting point, an ending point, and how many days you want to spread it across.
            </p>
          </div>

          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-ink-text-3">Starting surah</label>
                <Select
                  value={String(startSurah)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    setStartSurah(n);
                    setStartAyah(1);
                    if (n > endSurah) {
                      setEndSurah(n);
                      setEndAyah(SURAHS.find((s) => s.number === n).ayahs);
                    }
                  }}
                >
                  <SelectTrigger aria-label="Starting surah" className="bg-ink-surface-2/50 border-ink-border text-sm text-ink-text-2 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-ink-surface-2 border-ink-border max-h-64">
                    {SURAHS.map((s) => (
                      <SelectItem key={s.number} value={String(s.number)} className="text-ink-text-2 focus:bg-ink-border/50 focus:text-ink-text">
                        {s.number}. {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="start-ayah" className="text-xs text-ink-text-3">Starting ayah</label>
                <input
                  id="start-ayah"
                  type="number"
                  min={1}
                  max={startSurahData?.ayahs || 1}
                  value={startAyah}
                  onChange={(e) => setStartAyah(e.target.value)}
                  className="w-full bg-ink-surface-2/50 border border-ink-border rounded-lg px-3 h-9 text-sm text-ink-text-2 outline-none focus:border-ink-accent/50"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-1">
                <label className="text-xs text-ink-text-3">Ending surah</label>
                <Select
                  value={String(endSurah)}
                  onValueChange={(v) => {
                    const n = Number(v);
                    setEndSurah(n);
                    setEndAyah(SURAHS.find((s) => s.number === n).ayahs);
                  }}
                >
                  <SelectTrigger aria-label="Ending surah" className="bg-ink-surface-2/50 border-ink-border text-sm text-ink-text-2 h-9">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-ink-surface-2 border-ink-border max-h-64">
                    {SURAHS.filter((s) => s.number >= startSurah).map((s) => (
                      <SelectItem key={s.number} value={String(s.number)} className="text-ink-text-2 focus:bg-ink-border/50 focus:text-ink-text">
                        {s.number}. {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <label htmlFor="end-ayah" className="text-xs text-ink-text-3">Ending ayah</label>
                <input
                  id="end-ayah"
                  type="number"
                  min={1}
                  max={endSurahData?.ayahs || 1}
                  value={endAyah}
                  onChange={(e) => setEndAyah(e.target.value)}
                  className="w-full bg-ink-surface-2/50 border border-ink-border rounded-lg px-3 h-9 text-sm text-ink-text-2 outline-none focus:border-ink-accent/50"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label htmlFor="target-days" className="text-xs text-ink-text-3">Target days</label>
              <input
                id="target-days"
                type="number"
                min={1}
                value={targetDays}
                onChange={(e) => setTargetDays(e.target.value)}
                className="w-full bg-ink-surface-2/50 border border-ink-border rounded-lg px-3 h-9 text-sm text-ink-text-2 outline-none focus:border-ink-accent/50"
              />
              <p className="text-[11px] text-ink-text-3">
                Self-paced, like the built-in plan — may finish a little early if the range doesn't divide evenly, never late.
              </p>
            </div>
          </div>

          {error && <p className="text-xs text-ink-danger" role="alert">{error}</p>}

          <div className="flex gap-2">
            <button onClick={close} className="flex-1 py-2.5 rounded-xl bg-ink-surface-2 text-ink-text-2 text-sm font-medium hover:brightness-110 transition-colors">
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={!!error}
              className="flex-1 py-2.5 rounded-xl bg-ink-accent text-ink-bg text-sm font-medium hover:brightness-110 disabled:opacity-50 disabled:hover:brightness-100 transition-colors"
            >
              Create plan
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
