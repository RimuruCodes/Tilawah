// Cloud backup/restore sync for a signed-in Supabase account (Option A:
// whole-account snapshot, newest write wins — not a per-record merge engine).
//
// The app stays local-first: the working copy is always localStorage, so
// everything runs offline. This layer just keeps a JSON snapshot of that data
// in the `user_data` table (see supabase/migrations/0002_user_data.sql):
//   - on login it PULLS the cloud snapshot and merges it in (by record id),
//   - on any local change it PUSHES an updated snapshot (debounced),
//   - it flushes a push when the app is backgrounded.
//
// A per-user meta marker (qc_sync_meta_<id>) records the updated_at we last
// synced with, so we can tell whether the cloud is ahead of us (another device
// pushed) or we're ahead (offline edits to upload). importUserData merges by
// id, so a pull never drops local-only records — it unions them.

import { supabase } from "@/lib/supabaseClient";
import {
  exportUserData,
  importUserData,
  onLocalDataChange,
  findLegacyLocalScopes,
  importFromLocalScope,
} from "@/lib/localDb";
import { getActiveUserId } from "@/lib/activeUser";

const PUSH_DEBOUNCE_MS = 4000;

let pushTimer = null;
let pushInFlight = false;
let pushQueuedWhileInFlight = false;
let unsubscribeChanges = null;
let backgroundHandler = null;

function metaKey(userId) {
  return `qc_sync_meta_${userId}`;
}
function readMeta(userId) {
  try {
    return JSON.parse(localStorage.getItem(metaKey(userId)) || "null");
  } catch {
    return null;
  }
}
function writeMeta(userId, updatedAt) {
  localStorage.setItem(metaKey(userId), JSON.stringify({ updatedAt }));
}

function currentScopeIsEmpty() {
  const bundle = exportUserData();
  return Object.values(bundle.data || {}).every((arr) => !Array.isArray(arr) || arr.length === 0);
}

// Uploads the current local snapshot to the cloud. Serialized so two pushes
// never race; a change during a push re-queues one.
async function pushNow() {
  if (!supabase) return;
  const userId = getActiveUserId();
  if (!userId) return;
  if (pushInFlight) {
    pushQueuedWhileInFlight = true;
    return;
  }
  pushInFlight = true;
  try {
    const updated_at = new Date().toISOString();
    const payload = exportUserData();
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: userId, payload, updated_at }, { onConflict: "user_id" });
    if (!error) {
      writeMeta(userId, updated_at);
    }
    // On error we simply keep the local copy and retry on the next change /
    // background flush — offline or transient failures must never lose data.
  } finally {
    pushInFlight = false;
    if (pushQueuedWhileInFlight) {
      pushQueuedWhileInFlight = false;
      schedulePush();
    }
  }
}

function schedulePush() {
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = setTimeout(() => {
    pushTimer = null;
    pushNow();
  }, PUSH_DEBOUNCE_MS);
}

async function flushPush() {
  if (pushTimer) {
    clearTimeout(pushTimer);
    pushTimer = null;
  }
  await pushNow();
}

// Called once per signed-in session (from AuthContext, after the user is set).
// Reconciles the cloud snapshot with local data, then starts listening for
// changes to push. Safe to call when offline — the pull just fails softly.
export async function startSync() {
  if (!supabase) return;
  const userId = getActiveUserId();
  if (!userId) return;

  // First run for a brand-new cloud account on a device that already has
  // pre-cloud (local-only) data: adopt that history into this account.
  if (!readMeta(userId) && currentScopeIsEmpty()) {
    const [richest] = findLegacyLocalScopes(userId);
    if (richest) importFromLocalScope(richest);
  }

  try {
    const { data, error } = await supabase
      .from("user_data")
      .select("payload, updated_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!error && data) {
      const meta = readMeta(userId);
      const cloudIsAhead = !meta || new Date(data.updated_at) > new Date(meta.updatedAt || 0);
      if (cloudIsAhead) {
        // Another device pushed newer data — merge it in (union by id), and
        // record its timestamp. Local-only records survive the merge.
        importUserData(data.payload, { silent: true });
        writeMeta(userId, data.updated_at);
        // Re-upload the merged union so the cloud reflects both sides.
        await pushNow();
      } else {
        // We're level or ahead (e.g. offline edits) — upload local.
        await pushNow();
      }
    } else {
      // No cloud snapshot yet (or unreadable) — seed it from local.
      await pushNow();
    }
  } catch {
    /* offline / transient: keep using local; next change will retry a push */
  }

  // Subscribe to local mutations → debounced push.
  if (unsubscribeChanges) unsubscribeChanges();
  unsubscribeChanges = onLocalDataChange(schedulePush);

  // Flush a push when the app is hidden/backgrounded (best-effort).
  if (!backgroundHandler) {
    backgroundHandler = () => {
      if (document.visibilityState === "hidden") flushPush();
    };
    document.addEventListener("visibilitychange", backgroundHandler);
  }
}

// Called on logout: flush anything pending, then stop listening.
export async function stopSync() {
  try {
    await flushPush();
  } catch {
    /* best-effort */
  }
  if (unsubscribeChanges) {
    unsubscribeChanges();
    unsubscribeChanges = null;
  }
  if (backgroundHandler) {
    document.removeEventListener("visibilitychange", backgroundHandler);
    backgroundHandler = null;
  }
}
