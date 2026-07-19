// Local-first persistence layer. The working copy of a user's data lives in
// this browser's localStorage, scoped per account — so the app runs fully
// offline. When a Supabase account is signed in, this same data is also backed
// up to the cloud and restored on other devices (see src/lib/dataSync.js),
// which subscribes to the change notifier below.

import { getActiveUser } from "@/lib/activeUser";

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

// Change notifier: dataSync subscribes to push a cloud backup (debounced)
// whenever local data is mutated. Kept dead-simple — a set of callbacks.
const changeListeners = new Set();

export function onLocalDataChange(listener) {
  changeListeners.add(listener);
  return () => changeListeners.delete(listener);
}

function notifyChange() {
  changeListeners.forEach((fn) => {
    try {
      fn();
    } catch {
      /* a listener throwing must never break a local write */
    }
  });
}

function storageKey(collection) {
  const scope = getActiveUser()?.id || "anon";
  return `qc_data_${scope}_${collection}`;
}

function readAll(collection) {
  try {
    const raw = localStorage.getItem(storageKey(collection));
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

// `silent` skips the change notification — used by the sync layer when it
// writes data it just pulled FROM the cloud, so restoring doesn't immediately
// trigger a push back up.
function writeAll(collection, records, { silent = false } = {}) {
  localStorage.setItem(storageKey(collection), JSON.stringify(records));
  if (!silent) notifyChange();
}

function matches(record, query) {
  return Object.entries(query).every(([key, value]) => record[key] === value);
}

function applySort(records, sortStr) {
  if (!sortStr) return records;
  const desc = sortStr.startsWith("-");
  const field = desc ? sortStr.slice(1) : sortStr;
  const dir = desc ? -1 : 1;
  return [...records].sort((a, b) => {
    const av = a[field];
    const bv = b[field];
    if (av === bv) return 0;
    // Records missing the sort field always sink to the end, regardless of
    // direction, instead of comparing as undefined (unstable order).
    if (av == null) return 1;
    if (bv == null) return -1;
    return (av > bv ? 1 : -1) * dir;
  });
}

// Creates an entity client with the same shape the app already used
// (list/filter/create/update/deleteMany), so pages barely need to change.
export function createEntity(collectionName) {
  return {
    async list(sortStr = "-created_date", limit) {
      const all = readAll(collectionName);
      const sorted = applySort(all, sortStr);
      return typeof limit === "number" ? sorted.slice(0, limit) : sorted;
    },

    async filter(query = {}) {
      const all = readAll(collectionName);
      return all.filter((r) => matches(r, query));
    },

    async create(data) {
      const all = readAll(collectionName);
      const record = {
        id: uid(),
        created_date: new Date().toISOString(),
        updated_date: new Date().toISOString(),
        created_by_id: getActiveUser()?.id || null,
        ...data,
      };
      all.push(record);
      writeAll(collectionName, all);
      return record;
    },

    async update(id, data) {
      const all = readAll(collectionName);
      const idx = all.findIndex((r) => r.id === id);
      if (idx === -1) return null;
      all[idx] = { ...all[idx], ...data, updated_date: new Date().toISOString() };
      writeAll(collectionName, all);
      return all[idx];
    },

    async delete(id) {
      const all = readAll(collectionName);
      writeAll(collectionName, all.filter((r) => r.id !== id));
    },

    async deleteMany(query = {}) {
      const all = readAll(collectionName);
      writeAll(collectionName, all.filter((r) => !matches(r, query)));
    },
  };
}

export const RecitationLog = createEntity("recitation_logs");
export const DailyStreak = createEntity("daily_streaks");
export const MemorizationProgress = createEntity("memorization_progress");
// Explicit, per-result "this verdict seems off" flags (text only, stored
// locally, exportable from Settings) — see src/lib/feedbackReports.js.
export const FeedbackReport = createEntity("feedback_reports");
// Active structured recitation plan (one row: plan id + start date);
// day-by-day completion is derived from RecitationLog, not stored — see
// src/lib/recitationPlans.js.
export const RecitationPlanState = createEntity("recitation_plans");

const EXPORTABLE_COLLECTIONS = ["recitation_logs", "daily_streaks", "memorization_progress", "feedback_reports", "recitation_plans"];

// Bundles all of the current user's locally-stored data into a plain
// object suitable for JSON.stringify + download, so people aren't
// completely stuck if they clear browser storage or switch browsers.
export function exportUserData() {
  const user = getActiveUser();
  const data = {};
  EXPORTABLE_COLLECTIONS.forEach((c) => { data[c] = readAll(c); });
  return {
    exportedAt: new Date().toISOString(),
    // Only the display name is included — the app never holds a readable
    // copy of the email (localAuth.js stores a one-way hash), so a backup
    // file can't leak one either.
    user: user ? { full_name: user.full_name } : null,
    data,
  };
}

// Restores previously-exported data for the current user. Merges by
// record id (import wins on conflicts) rather than wiping existing data.
// `silent` (used by the cloud-sync restore) suppresses the change notifier so
// pulling from the cloud doesn't immediately schedule a push back up.
export function importUserData(payload, { silent = false } = {}) {
  if (!payload?.data) throw new Error("This file doesn't look like a valid export.");
  EXPORTABLE_COLLECTIONS.forEach((c) => {
    const incoming = payload.data[c];
    if (!Array.isArray(incoming)) return;
    const existing = readAll(c);
    const byId = new Map(existing.map((r) => [r.id, r]));
    incoming.forEach((rec) => { if (rec?.id) byId.set(rec.id, rec); });
    writeAll(c, Array.from(byId.values()), { silent });
  });
}

// Copies another local scope's collections into the current user's scope
// (non-destructive merge by id). Used once, when an existing on-device account
// signs into a fresh cloud account on the same device, so their history isn't
// stranded under the old local user id. Returns true if anything was copied.
export function importFromLocalScope(scopeId) {
  if (!scopeId) return false;
  let copiedAny = false;
  EXPORTABLE_COLLECTIONS.forEach((c) => {
    let incoming;
    try {
      incoming = JSON.parse(localStorage.getItem(`qc_data_${scopeId}_${c}`) || "[]");
    } catch {
      incoming = [];
    }
    if (!Array.isArray(incoming) || incoming.length === 0) return;
    const existing = readAll(c);
    const byId = new Map(existing.map((r) => [r.id, r]));
    incoming.forEach((rec) => { if (rec?.id) byId.set(rec.id, rec); });
    writeAll(c, Array.from(byId.values()), { silent: true });
    copiedAny = true;
  });
  return copiedAny;
}

// Finds local data scopes on THIS device that aren't the given active user id,
// ranked by how many records they hold (richest first). Used to locate a
// pre-cloud on-device account's data to migrate. Returns an array of scope ids.
export function findLegacyLocalScopes(excludeScopeId) {
  const counts = new Map();
  for (let i = 0; i < localStorage.length; i += 1) {
    const key = localStorage.key(i);
    const m = key && key.match(/^qc_data_(.+?)_(recitation_logs|daily_streaks|memorization_progress|feedback_reports|recitation_plans)$/);
    if (!m) continue;
    const scope = m[1];
    if (scope === excludeScopeId || scope === "anon") continue;
    let n = 0;
    try {
      n = (JSON.parse(localStorage.getItem(key) || "[]") || []).length;
    } catch {
      n = 0;
    }
    counts.set(scope, (counts.get(scope) || 0) + n);
  }
  return Array.from(counts.entries())
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .map(([scope]) => scope);
}
