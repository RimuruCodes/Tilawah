// Pure validation for the account-creation forms — local registration and
// the subscription (Supabase) signup — so the age gate and the Terms/Privacy
// acceptance (clickwrap) rules live in one tested place and behave
// identically wherever they're used.

// COPPA: accounts may not be created for children under 13.
export const MINIMUM_AGE = 13;

// Rejects obvious typos (e.g. 1800) without excluding any real user.
const OLDEST_BIRTH_YEAR = 1900;

export function ageFromBirthYear(birthYear, now = new Date()) {
  return now.getFullYear() - Number(birthYear);
}

// Returns an error string, or null if the birth year clears the minimum-age
// gate. Year-only is deliberate: it's the least personal data that still
// enforces the gate, and matches the "13 or older" self-attestation COPPA
// relies on. It treats anyone reaching the minimum age within the current
// calendar year as eligible; the subscription flow separately requires an
// adult payment method. `now` is injectable so tests are deterministic.
export function validateBirthYear(birthYear, now = new Date()) {
  const year = Number(birthYear);
  if (birthYear === "" || birthYear == null || !Number.isInteger(year)) {
    return "Please enter your birth year.";
  }
  const currentYear = now.getFullYear();
  if (year < OLDEST_BIRTH_YEAR || year > currentYear) {
    return "Please enter a valid birth year.";
  }
  if (currentYear - year < MINIMUM_AGE) {
    return `You must be at least ${MINIMUM_AGE} to create an account.`;
  }
  return null;
}

// Clickwrap: the Terms/Privacy acceptance must be actively checked, not
// assumed. Returns an error string or null.
export function validateTermsAccepted(agreedToTerms) {
  return agreedToTerms ? null : "Please agree to the Terms of Service and Privacy Policy to continue.";
}

// Backend/subscription signup gate (age + clickwrap). Returns the first
// blocking error, or null when clear — age is checked before acceptance so
// an under-13 visitor is told the real reason rather than nagged about a
// checkbox.
export function validateSubscriptionSignup({ birthYear, agreedToTerms }, now = new Date()) {
  return validateBirthYear(birthYear, now) ?? validateTermsAccepted(agreedToTerms);
}

// Local registration gate: existing password rules plus clickwrap. No age
// gate here — the local account stores no server-side personal data (email
// is hashed on-device); the COPPA age gate lives on the backend/subscription
// signup, matching the Privacy Policy's Children's Privacy section.
export function validateLocalRegistration({ password, confirmPassword, agreedToTerms }) {
  if (password !== confirmPassword) return "Passwords do not match";
  if (!password || password.length < 6) return "Password must be at least 6 characters";
  return validateTermsAccepted(agreedToTerms);
}

// Checkout gate: the EU/UK immediate-delivery / withdrawal-waiver consent
// must be actively checked before a Stripe Checkout session is created.
export function validateCheckoutConsent({ immediateDeliveryConsent }) {
  return immediateDeliveryConsent
    ? null
    : "Please confirm you want immediate access to continue.";
}
