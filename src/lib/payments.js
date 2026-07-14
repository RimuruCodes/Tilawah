// Cash App is used for voluntary DONATIONS only (DonationCard,
// SupportModal). Subscription payments go through Stripe Checkout — see
// src/lib/subscriptionApi.js and supabase/functions/.
export const CASH_APP_CASHTAG = "$AlAminOyeyemi64";

// cash.app/$cashtag/<amount> opens Cash App with the amount pre-filled.
export function cashAppUrl(amount) {
  const base = `https://cash.app/${CASH_APP_CASHTAG}`;
  return amount == null ? base : `${base}/${amount}`;
}

export const SUBSCRIPTION_PLANS = [
  { id: "yearly", label: "Yearly", amount: 39.99, price: "$39.99/year", badge: "Best value" },
  { id: "monthly", label: "Monthly", amount: 4.99, price: "$4.99/month", badge: null },
];
