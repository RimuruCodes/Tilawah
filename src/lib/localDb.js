// Lightweight local persistence layer that replaces the Base44 entities SDK.
// Data is stored per-user in localStorage. No network/server involved —
// everything lives on this device/browser only.

import { getCurrentUser } from "@/lib/localAuth";

const uid = () =>
  `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;

function storageKey(collection) {
  const user = getCurrentUser();
  const scope = user?.id || "anon";
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

function writeAll(collection, records) {
  localStorage.setItem(storageKey(collection), JSON.stringify(records));
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
        created_by_id: getCurrentUser()?.id || null,
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
  const user = getCurrentUser();
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
export function importUserData(payload) {
  if (!payload?.data) throw new Error("This file doesn't look like a valid export.");
  EXPORTABLE_COLLECTIONS.forEach((c) => {
    const incoming = payload.data[c];
    if (!Array.isArray(incoming)) return;
    const existing = readAll(c);
    const byId = new Map(existing.map((r) => [r.id, r]));
    incoming.forEach((rec) => { if (rec?.id) byId.set(rec.id, rec); });
    writeAll(c, Array.from(byId.values()));
  });
}
