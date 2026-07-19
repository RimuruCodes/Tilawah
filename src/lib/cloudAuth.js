// Server-side accounts via Supabase Auth (email + password). This replaces
// the old on-device-only localAuth as the app's primary login, so the same
// credentials work on any device and a user's synced data (see dataSync.js)
// follows them.
//
// The app already used Supabase for the subscriber session; now that session
// IS the account session — one identity instead of two, so the old
// local/subscriber reconciliation is no longer needed.
//
// User shape returned to the app is kept compatible with what the UI already
// consumes: { id, full_name, email, emailHash }. `emailHash` is still derived
// (SHA-256 of the normalized email) so the owner-comp check in entitlements.js
// keeps working unchanged.

import { supabase } from "@/lib/supabaseClient";
import { hashEmail } from "@/lib/localAuth";

const DEFAULT_DISPLAY_NAME = "Reciter";

function requireBackend() {
  if (!supabase) throw new Error("Accounts aren't available in this build.");
}

// Maps a Supabase Auth user to the shape the app expects. Async because the
// email hash (used for the owner check) is derived with WebCrypto.
export async function mapUser(supaUser) {
  if (!supaUser) return null;
  const email = supaUser.email || "";
  return {
    id: supaUser.id,
    email,
    full_name: supaUser.user_metadata?.full_name?.trim() || DEFAULT_DISPLAY_NAME,
    emailHash: email ? await hashEmail(email) : null,
  };
}

// Turns Supabase's auth errors into the short messages the pages already show.
function friendly(error) {
  const msg = (error?.message || "").toLowerCase();
  if (msg.includes("already registered") || msg.includes("already been registered")) {
    return "An account with this email already exists. Try logging in instead.";
  }
  if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
    return "Invalid email or password";
  }
  if (msg.includes("email not confirmed")) {
    return "Please confirm your email address, then log in.";
  }
  return error?.message || "Something went wrong. Please try again.";
}

export async function register({ email, password, display_name }) {
  requireBackend();
  const { data, error } = await supabase.auth.signUp({
    email: String(email).trim().toLowerCase(),
    password,
    options: { data: { full_name: display_name?.trim() || DEFAULT_DISPLAY_NAME } },
  });
  if (error) throw new Error(friendly(error));
  // With email confirmations disabled (supabase/config.toml) signUp returns a
  // live session immediately. If a project ever re-enables confirmations,
  // `session` is null here and the caller should tell the user to confirm.
  if (!data.session) {
    const err = new Error("Check your email to confirm your account, then log in.");
    err.needsConfirmation = true;
    throw err;
  }
  return mapUser(data.user);
}

export async function login(email, password) {
  requireBackend();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: String(email).trim().toLowerCase(),
    password,
  });
  if (error) throw new Error(friendly(error));
  return mapUser(data.user);
}

// Reads the current session's user without a network round-trip (Supabase
// caches the session in localStorage). Returns null when signed out.
export async function getSessionUser() {
  if (!supabase) return null;
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session ? mapUser(session.user) : null;
}

export async function logout() {
  if (!supabase) return;
  await supabase.auth.signOut();
}

export async function updateDisplayName(fullName) {
  requireBackend();
  const { error } = await supabase.auth.updateUser({
    data: { full_name: fullName?.trim() || DEFAULT_DISPLAY_NAME },
  });
  if (error) throw new Error(friendly(error));
}

// Sends a real password-reset email (now that tilawah1.com email delivers).
// The link lands on /reset-password, where the recovery session lets the user
// set a new password.
export async function sendPasswordReset(email, redirectTo) {
  requireBackend();
  const { error } = await supabase.auth.resetPasswordForEmail(
    String(email).trim().toLowerCase(),
    redirectTo ? { redirectTo } : undefined
  );
  if (error) throw new Error(friendly(error));
}

// Called on the /reset-password page while the recovery session is active.
export async function setNewPassword(newPassword) {
  requireBackend();
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) throw new Error(friendly(error));
}
