import React, { createContext, useContext, useState, useEffect, useCallback } from "react";
import { supabase, isSubscriptionBackendConfigured } from "@/lib/supabaseClient";
import { getSubscriptionStatus } from "@/lib/subscriptionApi";
import { isOwnerEmail, OWNER_SUBSCRIPTION } from "@/lib/entitlements";
import { useAuth } from "@/lib/AuthContext";

const SubscriptionContext = createContext();

// Mostly independent of AuthContext: a free user never has a Supabase
// session, so this resolves to `subscription: null` immediately and every
// gated-feature check (see src/lib/entitlements.js) behaves as expected.
// The one auth-derived exception: the app owner's own local account gets a
// synthetic always-active subscription, so every gate/Settings display
// treats them as subscribed without touching the backend.
export const SubscriptionProvider = ({ children }) => {
  const { user } = useAuth();
  const [subscription, setSubscription] = useState(null);
  const [isLoadingSubscription, setIsLoadingSubscription] = useState(true);

  // Returns the freshly-fetched subscription (not just setting state) so
  // callers that just completed the email-verification step — see
  // UpgradeModal — can immediately decide "already entitled" vs "needs
  // checkout" without waiting on a re-render.
  const refreshSubscription = useCallback(async () => {
    if (!isSubscriptionBackendConfigured) {
      setSubscription(null);
      setIsLoadingSubscription(false);
      return null;
    }
    setIsLoadingSubscription(true);
    try {
      const data = await getSubscriptionStatus();
      setSubscription(data);
      return data;
    } catch (err) {
      console.error("Couldn't load subscription status:", err);
      setSubscription(null);
      return null;
    } finally {
      setIsLoadingSubscription(false);
    }
  }, []);

  useEffect(() => {
    refreshSubscription();
    if (!supabase) return;
    // Covers both directions: signing in on this device (e.g. right after
    // verifying an email code) and signing out of the subscriber identity.
    const { data: listener } = supabase.auth.onAuthStateChange(() => {
      refreshSubscription();
    });
    return () => listener.subscription.unsubscribe();
  }, [refreshSubscription]);

  // Derived at render time (not stored) so it tracks local login/logout:
  // the moment the owner's account signs in, `user` updates and every
  // consumer re-renders with the comped subscription.
  const isOwner = isOwnerEmail(user?.email);
  const effectiveSubscription = isOwner ? OWNER_SUBSCRIPTION : subscription;

  return (
    <SubscriptionContext.Provider
      value={{
        subscription: effectiveSubscription,
        isLoadingSubscription: isOwner ? false : isLoadingSubscription,
        refreshSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (!context) {
    throw new Error("useSubscription must be used within a SubscriptionProvider");
  }
  return context;
};
