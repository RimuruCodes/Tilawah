// On-device auth that replaces Base44's hosted auth.
// There is no backend: accounts, password hashes and session tokens all
// live in this browser's localStorage. That means:
//   - no cross-device sync (each browser/device has its own account)
//   - "forgot password" can't email a reset link (there's no mail server)
//   - this is fine for a personal/offline app, but is NOT the same
//     security bar as a real server-side auth system.
//
// Email storage: we never keep a readable copy of the address. Only a
// one-way SHA-256 hash of the normalized email is stored (see hashEmail),
// used as the account's lookup/identity key. Honest limit: because the
// hash must be deterministic to look an account up, there's no per-user
// salt, so someone who *guesses* a specific address can confirm it's
// registered by hashing it themselves. This hides the email from a casual
// glance at localStorage; it is NOT strong protection against someone with
// full access to the device — same spirit as the password notes below.

const USERS_KEY = "qc_users";
const SESSION_KEY = "qc_session";

// Shown when someone registers without choosing a display name, so the UI
// never has to fall back to any part of the email address.
const DEFAULT_DISPLAY_NAME = "Reciter";

function readUsers() {
  try {
    return JSON.parse(localStorage.getItem(USERS_KEY) || "[]");
  } catch {
    return [];
  }
}

function writeUsers(users) {
  localStorage.setItem(USERS_KEY, JSON.stringify(users));
}

function uid() {
  return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 10)}`;
}

// PBKDF2 work factor. OWASP's current recommendation for PBKDF2-SHA-256;
// stored per-user so it can be raised later without breaking old hashes.
const PBKDF2_ITERATIONS = 600_000;

function toHex(buffer) {
  return Array.from(new Uint8Array(buffer))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// Deterministic one-way hash of the normalized email, used as the account
// key so localStorage never holds a readable email. Deliberately unsalted:
// login/lookup has to reproduce the same hash from the typed address. See
// the file header for the honest security properties.
export async function hashEmail(email) {
  const normalized = String(email).trim().toLowerCase();
  const data = new TextEncoder().encode(normalized);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

function normalizeEmail(email) {
  return String(email).trim().toLowerCase();
}

// Legacy scheme (v1): a single unsalted-ish SHA-256 round. Kept only to
// verify accounts created before the PBKDF2 upgrade; those are transparently
// re-hashed on their next successful login (see login below).
async function legacyHashPassword(password, saltHex) {
  const data = new TextEncoder().encode(`${saltHex}:${password}`);
  return toHex(await crypto.subtle.digest("SHA-256", data));
}

async function hashPassword(password, saltHex, iterations = PBKDF2_ITERATIONS) {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: enc.encode(saltHex),
      iterations,
    },
    keyMaterial,
    256
  );
  return toHex(bits);
}

async function verifyPassword(password, user) {
  if (user.kdf === "pbkdf2") {
    const candidate = await hashPassword(password, user.salt, user.kdfIterations || PBKDF2_ITERATIONS);
    return candidate === user.passwordHash;
  }
  return (await legacyHashPassword(password, user.salt)) === user.passwordHash;
}

function randomSaltHex() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

export async function register({ email, password, display_name }) {
  const normalizedEmail = normalizeEmail(email);
  const emailHash = await hashEmail(normalizedEmail);
  const users = readUsers();
  if (users.find((u) => u.emailHash === emailHash)) {
    throw new Error("An account with this email already exists.");
  }
  const salt = randomSaltHex();
  const passwordHash = await hashPassword(password, salt);
  const user = {
    id: uid(),
    emailHash, // no plaintext email is ever stored
    full_name: display_name?.trim() || DEFAULT_DISPLAY_NAME,
    role: "user",
    salt,
    passwordHash,
    kdf: "pbkdf2",
    kdfIterations: PBKDF2_ITERATIONS,
    created_date: new Date().toISOString(),
  };
  users.push(user);
  writeUsers(users);
  setSession(user.id);
  return publicUser(user);
}

// Migrates a legacy account (stored the plaintext `email` and, in older
// builds, a display name derived from the email's local-part) to the
// hashed-email scheme. Called on login, while we've just been given the
// address, so the plaintext copy can be replaced with its hash and any
// email-derived display name scrubbed. Mutates `user` in place.
async function migrateLegacyEmail(user, normalizedEmail) {
  if (user.emailHash) return; // already migrated
  user.emailHash = await hashEmail(normalizedEmail);
  if (user.full_name === normalizedEmail.split("@")[0]) {
    user.full_name = DEFAULT_DISPLAY_NAME;
  }
  delete user.email;
}

export async function login(email, password) {
  const normalizedEmail = normalizeEmail(email);
  const emailHash = await hashEmail(normalizedEmail);
  const users = readUsers();
  // Prefer the hashed key; fall back to a legacy plaintext match so
  // accounts created before the hash-and-drop change can still log in
  // (they get migrated below, once the password checks out).
  const user =
    users.find((u) => u.emailHash === emailHash) ||
    users.find((u) => u.email === normalizedEmail);
  if (!user) throw new Error("Invalid email or password");
  if (!(await verifyPassword(password, user))) {
    throw new Error("Invalid email or password");
  }
  // Accounts created under the legacy scheme get silently upgraded to
  // PBKDF2 now, while we briefly know the correct plaintext password.
  if (user.kdf !== "pbkdf2") {
    const salt = randomSaltHex();
    user.salt = salt;
    user.passwordHash = await hashPassword(password, salt);
    user.kdf = "pbkdf2";
    user.kdfIterations = PBKDF2_ITERATIONS;
  }
  await migrateLegacyEmail(user, normalizedEmail);
  writeUsers(users);
  setSession(user.id);
  return publicUser(user);
}

export async function changePassword(userId, newPassword) {
  const users = readUsers();
  const idx = users.findIndex((u) => u.id === userId);
  if (idx === -1) throw new Error("Account not found");
  const salt = randomSaltHex();
  users[idx].salt = salt;
  users[idx].passwordHash = await hashPassword(newPassword, salt);
  users[idx].kdf = "pbkdf2";
  users[idx].kdfIterations = PBKDF2_ITERATIONS;
  writeUsers(users);
}

export function setSession(userId) {
  localStorage.setItem(SESSION_KEY, JSON.stringify({ userId, token: uid() }));
}

export function clearSession() {
  localStorage.removeItem(SESSION_KEY);
}

function publicUser(user) {
  if (!user) return null;
  // Strip the secret hash material AND any legacy plaintext `email` field,
  // so nothing downstream can rely on a readable address — the app uses
  // `emailHash` (owner comp, OTP match) and `full_name` (display) instead.
  const { salt, passwordHash, kdf, kdfIterations, email, ...rest } = user;
  return rest;
}

export function getCurrentUser() {
  try {
    const session = JSON.parse(localStorage.getItem(SESSION_KEY) || "null");
    if (!session?.userId) return null;
    const users = readUsers();
    const user = users.find((u) => u.id === session.userId);
    return publicUser(user);
  } catch {
    return null;
  }
}

export async function me() {
  const user = getCurrentUser();
  if (!user) {
    const err = new Error("Not authenticated");
    err.status = 401;
    throw err;
  }
  return user;
}

export function logout() {
  clearSession();
}

export function deleteAccount(userId) {
  const users = readUsers().filter((u) => u.id !== userId);
  writeUsers(users);
  clearSession();
}
