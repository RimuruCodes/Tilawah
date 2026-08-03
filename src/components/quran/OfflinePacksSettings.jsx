import React, { useState, useEffect, useCallback, useRef } from "react";
import { Download, Trash2, HardDrive } from "lucide-react";
import { RECITERS } from "@/lib/quranData";
import {
  listDownloadedPacks,
  downloadReciterPack,
  deletePack,
  estimatedPackSizeLabel,
  formatBytes,
} from "@/lib/offlinePacks";
import { useSubscription } from "@/lib/SubscriptionContext";
import { canAccessFeature, GATED_FEATURES } from "@/lib/entitlements";
import UpgradeModal from "@/components/quran/UpgradeModal";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

// Phase 5: download a reciter's full Quran audio for offline use — see
// src/lib/offlinePacks.js for the storage/entitlement design. The
// entitlement check happens BEFORE the confirm dialog ever shows (a
// controlled dialog gated on confirmReciter, not an uncontrolled Trigger),
// matching the existing check-first pattern (SurahReader.jsx's
// handleContinuousClick) rather than showing a "Download?" prompt to a
// free user only to then swap it for the upgrade prompt.
export default function OfflinePacksSettings() {
  const { subscription } = useSubscription();
  const [packs, setPacks] = useState([]);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [confirmReciter, setConfirmReciter] = useState(null);
  const [downloading, setDownloading] = useState(null); // reciter folder currently downloading
  const [progress, setProgress] = useState(null);
  const abortRef = useRef(null);

  const refresh = useCallback(async () => {
    setPacks(await listDownloadedPacks());
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleDownloadClick = (reciter) => {
    if (!canAccessFeature(GATED_FEATURES.OFFLINE_RECITER_PACKS, subscription)) {
      setUpgradeOpen(true);
      return;
    }
    setConfirmReciter(reciter);
  };

  const confirmDownload = async () => {
    const reciter = confirmReciter;
    setConfirmReciter(null);
    if (!reciter) return;
    const controller = new AbortController();
    abortRef.current = controller;
    setDownloading(reciter.folder);
    setProgress({ completed: 0, total: 1, failed: 0, bytesDownloaded: 0 });
    try {
      await downloadReciterPack(reciter.folder, reciter.name, {
        signal: controller.signal,
        onProgress: setProgress,
      });
    } finally {
      setDownloading(null);
      setProgress(null);
      abortRef.current = null;
      refresh();
    }
  };

  const handleCancel = () => abortRef.current?.abort();

  const handleDelete = async (reciterFolder) => {
    await deletePack(reciterFolder);
    refresh();
  };

  const packFor = (folder) => packs.find((p) => p.reciter_folder === folder);

  return (
    <div className="bg-ink-surface/50 border border-ink-border/40 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 text-ink-text-2">
        <HardDrive className="w-4 h-4" />
        <h3 className="text-sm font-medium text-ink-text">Offline reciter packs</h3>
      </div>
      <p className="text-xs text-ink-text-3">
        Download a reciter's full Quran audio (roughly 600 MB&ndash;900 MB per reciter) to use without an
        internet connection. A subscription is needed to start a new download; anything already downloaded
        keeps working offline even if your subscription later lapses.
      </p>

      <div className="space-y-2">
        {RECITERS.map((r) => {
          const pack = packFor(r.folder);
          const isDownloading = downloading === r.folder;
          return (
            <div
              key={r.id}
              className="flex items-center justify-between gap-3 p-3 rounded-xl bg-ink-surface-2/30 border border-ink-border/60"
            >
              <div className="min-w-0 flex-1">
                <p className="text-sm text-ink-text-2 truncate">{r.name}</p>
                {pack ? (
                  <p className="text-[11px] text-ink-accent">
                    Downloaded &middot; {formatBytes(pack.size_bytes)} &middot;{" "}
                    {new Date(pack.downloaded_at).toLocaleDateString()}
                    {pack.failed_count > 0 ? ` · ${pack.failed_count} ayahs couldn't be downloaded` : ""}
                  </p>
                ) : isDownloading ? (
                  <>
                    <p className="text-[11px] text-ink-text-3">
                      Downloading&hellip; {progress ? `${progress.completed}/${progress.total}` : ""}
                    </p>
                    {progress && (
                      <div className="mt-1.5 h-1 bg-ink-border rounded-full overflow-hidden w-full max-w-40">
                        <div
                          className="h-full bg-ink-accent transition-all"
                          style={{ width: `${Math.round((progress.completed / progress.total) * 100)}%` }}
                        />
                      </div>
                    )}
                  </>
                ) : (
                  <p className="text-[11px] text-ink-text-3">Not downloaded &middot; approx. {estimatedPackSizeLabel(r.folder)}</p>
                )}
              </div>

              {pack ? (
                <AlertDialog>
                  <AlertDialogTrigger asChild>
                    <button
                      aria-label={`Delete offline pack for ${r.name}`}
                      className="p-2 rounded-lg text-ink-text-2 hover:text-ink-danger hover:bg-ink-danger/10 transition-colors flex-shrink-0"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </AlertDialogTrigger>
                  <AlertDialogContent className="bg-ink-surface border-ink-border">
                    <AlertDialogHeader>
                      <AlertDialogTitle className="text-ink-text">Delete {r.name}'s offline pack?</AlertDialogTitle>
                      <AlertDialogDescription className="text-ink-text-2">
                        Frees up {formatBytes(pack.size_bytes)}. You can download it again anytime.
                      </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                      <AlertDialogCancel className="bg-ink-surface-2 text-ink-text-2 border-ink-border hover:brightness-110">
                        Cancel
                      </AlertDialogCancel>
                      <AlertDialogAction
                        onClick={() => handleDelete(r.folder)}
                        className="bg-ink-danger text-ink-bg hover:brightness-110 border-ink-danger"
                      >
                        Delete
                      </AlertDialogAction>
                    </AlertDialogFooter>
                  </AlertDialogContent>
                </AlertDialog>
              ) : isDownloading ? (
                <button
                  onClick={handleCancel}
                  className="px-3 py-1.5 rounded-lg bg-ink-surface-2/50 text-ink-text-2 text-xs font-medium hover:bg-ink-surface-2 transition-colors flex-shrink-0"
                >
                  Cancel
                </button>
              ) : (
                <button
                  onClick={() => handleDownloadClick(r)}
                  disabled={downloading != null}
                  aria-label={`Download ${r.name} for offline use`}
                  className="p-2 rounded-lg text-ink-text-2 hover:text-ink-accent hover:bg-ink-accent/10 disabled:opacity-30 transition-colors flex-shrink-0"
                >
                  <Download className="w-4 h-4" />
                </button>
              )}
            </div>
          );
        })}
      </div>

      <AlertDialog open={!!confirmReciter} onOpenChange={(open) => !open && setConfirmReciter(null)}>
        <AlertDialogContent className="bg-ink-surface border-ink-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-ink-text">Download {confirmReciter?.name} for offline use?</AlertDialogTitle>
            <AlertDialogDescription className="text-ink-text-2">
              This downloads approximately {confirmReciter ? estimatedPackSizeLabel(confirmReciter.folder) : ""} — the
              reciter's entire Quran audio, ayah by ayah. Make sure you're on Wi-Fi and have enough free storage.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="bg-ink-surface-2 text-ink-text-2 border-ink-border hover:brightness-110">
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={confirmDownload} className="bg-ink-accent text-ink-bg hover:brightness-110 border-ink-accent">
              Download
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <UpgradeModal open={upgradeOpen} onClose={() => setUpgradeOpen(false)} featureLabel="Offline reciter packs" />
    </div>
  );
}
