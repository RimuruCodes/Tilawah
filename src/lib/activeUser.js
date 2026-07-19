// The signed-in account, held in a module-level variable so synchronous
// callers (notably src/lib/localDb.js, which scopes localStorage keys per
// user) can read the current user id without awaiting a Supabase call.
//
// AuthContext is the authority: it resolves the Supabase session on load and
// on every auth change and calls setActiveUser(). localDb only ever reads
// data inside protected routes, which don't render until AuthContext has
// finished its first check — so the id is set before any scoped read happens.

let activeUser = null;

export function setActiveUser(user) {
  activeUser = user || null;
}

export function getActiveUser() {
  return activeUser;
}

export function getActiveUserId() {
  return activeUser?.id || null;
}
