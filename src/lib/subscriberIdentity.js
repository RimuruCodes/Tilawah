// Keeps the Supabase "subscriber" identity from getting out of sync with
// the local per-device account.
//
// The bug this exists to prevent: the app is gated behind a LOCAL account
// (localAuth.js), while a *separate* Supabase session carries subscription
// entitlements. Those two are independent, so a Supabase session that
// outlives a local logout/account-switch used to leak one person's paid
// features to whoever logged in locally next.
//
// The fix: whenever a Supabase session is established for the current local
// account (subscribing via UpgradeModal, or restoring on a new device via
// the Restore flow), we record WHICH local account owns it here. On every
// local auth transition we reconcile: if the recorded owner isn't the
// currently signed-in local account, the Supabase session is signed out.
//
// This module is deliberately I/O-free and pure so the decision is unit
// tested directly; the async orchestration that talks to Supabase lives in
// src/lib/subscriptionApi.js (reconcileSubscriberSession).

const SUBSCRIBER_OWNER_KEY = "qc_subscriber_owner"; // local user id that owns the Supabase session

export function getSubscriberOwner() {
  return localStorage.getItem(SUBSCRIBER_OWNER_KEY);
}

export function setSubscriberOwner(localUserId) {
  if (localUserId) localStorage.setItem(SUBSCRIBER_OWNER_KEY, String(localUserId));
}

export function clearSubscriberOwner() {
  localStorage.removeItem(SUBSCRIBER_OWNER_KEY);
}

// Pure decision: should the current Supabase subscriber session be signed
// out because it doesn't belong to the currently signed-in local account?
//
//   - No Supabase session at all -> nothing to do.
//   - A session with no recorded owner -> not provably the current user's
//     (e.g. it lingered from before this fix), so sign out to be safe.
//   - A session owned by a different local account (including the
//     logged-out state, currentLocalId == null) -> sign out.
//   - A session owned by the current local account -> keep it.
export function shouldSignOutSubscriber({ hasSubscriberSession, ownerLocalId, currentLocalId }) {
  if (!hasSubscriberSession) return false;
  if (!ownerLocalId) return true;
  return ownerLocalId !== currentLocalId;
}
