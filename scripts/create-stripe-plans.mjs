// ============================================================================
// One-off setup script: creates the Tilawah subscription plans in Stripe.
//
// What this does, in plain English:
//   1. Safety check: makes sure the Stripe key you provided is a TEST key.
//      If it is a live key (real money), the script refuses to run.
//   2. Looks in the Stripe account for a product called "Tilawah Premium".
//      If it already exists (e.g. this script was run before), it is reused —
//      nothing is duplicated.
//   3. Makes sure that product has two prices: one monthly, one yearly.
//      Again, if a price already exists it is reused, not duplicated.
//   4. Prints the two "Price IDs" at the end. Those two values are the only
//      output that matters — they get copied into the app's .env file.
//
// This script only CREATES catalog entries (a product and two prices) in
// TEST MODE. It does not charge anyone, does not touch customers, and does
// not delete or modify anything that already exists.
//
// Requires Node.js 18 or newer (it uses the built-in fetch). No installs.
// ============================================================================

// ---- The placeholder pricing. Change these two lines to set real prices
// ---- later (amounts are in the smallest currency unit, i.e. cents:
// ---- 499 means $4.99). The currency can be changed too (e.g. "gbp").
const MONTHLY_AMOUNT_CENTS = 499;   // $4.99 per month  (placeholder)
const YEARLY_AMOUNT_CENTS = 3999;   // $39.99 per year  (placeholder)
const CURRENCY = "usd";

const PRODUCT_NAME = "Tilawah Premium";

// ---- Step 0: read the secret key from the environment. The key is never
// ---- written into this file, so the file stays safe to share/commit.
const key = process.env.STRIPE_SECRET_KEY;

if (!key) {
  console.error(
    "\nNo Stripe key found.\n\n" +
      "Set it in this terminal first (type it yourself; don't share it):\n\n" +
      '  PowerShell:  $env:STRIPE_SECRET_KEY = "sk_test_...your test key..."\n' +
      '  Mac/Linux:   export STRIPE_SECRET_KEY="sk_test_...your test key..."\n\n' +
      "then run this script again.\n"
  );
  process.exit(1);
}

// ---- Step 1: THE SAFETY CHECK. Stripe test keys always start with
// ---- "sk_test_". Live keys (real money) start with "sk_live_". This script
// ---- only ever runs with a test key.
if (!key.startsWith("sk_test_")) {
  console.error(
    "\nREFUSING TO RUN: the key provided is NOT a Stripe TEST key.\n" +
      'Test keys start with "sk_test_". This script must never run against\n' +
      "a live account. Nothing was created or changed.\n"
  );
  process.exit(1);
}

// ---- Small helper that talks to Stripe's API over HTTPS. Stripe expects
// ---- form-encoded requests with the key sent as a Bearer token.
async function stripe(method, path, params) {
  const options = {
    method,
    headers: { Authorization: `Bearer ${key}` },
  };
  if (params) {
    options.headers["Content-Type"] = "application/x-www-form-urlencoded";
    options.body = new URLSearchParams(params).toString();
  }
  const res = await fetch(`https://api.stripe.com/v1${path}`, options);
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Stripe error (${res.status}): ${data?.error?.message || "unknown"}`);
  }
  return data;
}

// ---- Step 2: find the product if it already exists (makes the script safe
// ---- to run more than once), otherwise create it.
console.log(`\nLooking for an existing product named "${PRODUCT_NAME}"...`);
const existingProducts = await stripe("GET", "/products?active=true&limit=100");
let product = existingProducts.data.find((p) => p.name === PRODUCT_NAME);

if (product) {
  console.log(`Found it (id: ${product.id}) — reusing, not creating a duplicate.`);
} else {
  console.log("Not found — creating it now...");
  product = await stripe("POST", "/products", {
    name: PRODUCT_NAME,
    description: "Tilawah app subscription: unlocks Continuous Recitation (Recite All).",
  });
  console.log(`Created product (id: ${product.id}).`);
}

// ---- Step 3: make sure the product has a monthly and a yearly price.
// ---- If a recurring price for that interval already exists, reuse it.
const existingPrices = await stripe("GET", `/prices?product=${product.id}&active=true&limit=100`);

async function ensurePrice(interval, amountCents) {
  const found = existingPrices.data.find((p) => p.recurring?.interval === interval);
  if (found) {
    console.log(
      `A ${interval}ly price already exists (${found.id}, ` +
        `${(found.unit_amount / 100).toFixed(2)} ${found.currency.toUpperCase()}) — reusing it.`
    );
    return found;
  }
  const created = await stripe("POST", "/prices", {
    product: product.id,
    currency: CURRENCY,
    unit_amount: String(amountCents),
    "recurring[interval]": interval, // "month" or "year"
    nickname: `Tilawah Premium ${interval}ly`,
  });
  console.log(
    `Created the ${interval}ly price: ${(amountCents / 100).toFixed(2)} ${CURRENCY.toUpperCase()} (${created.id}).`
  );
  return created;
}

const monthly = await ensurePrice("month", MONTHLY_AMOUNT_CENTS);
const yearly = await ensurePrice("year", YEARLY_AMOUNT_CENTS);

// ---- Step 4: print the values that need to go into the app's .env file.
console.log("\n============================================================");
console.log("Done. Copy these two lines into supabase/functions/.env:");
console.log("============================================================\n");
console.log(`STRIPE_PRICE_ID_MONTHLY=${monthly.id}`);
console.log(`STRIPE_PRICE_ID_YEARLY=${yearly.id}`);
console.log(
  "\n(You can see/edit these anytime in the Stripe Dashboard under\n" +
    " Products — make sure the dashboard's 'Test mode' toggle is ON.)\n"
);
