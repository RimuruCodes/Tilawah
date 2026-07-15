import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import * as localAuth from '@/lib/localAuth';
import { reconcileSubscriberSession, subscriberSignOut } from '@/lib/subscriptionApi';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    const current = localAuth.getCurrentUser();
    // Reconcile the Supabase subscriber identity against whoever is signed
    // in locally on THIS load, so a lingering subscription session can't
    // leak paid features across a logout or an account switch. Never let a
    // reconcile failure (offline, etc.) block rendering the app.
    try {
      await reconcileSubscriberSession(current?.id ?? null);
    } catch {
      /* non-fatal: entitlement checks fail closed to the free tier */
    }
    setUser(current);
    setIsAuthenticated(!!current);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, []);

  useEffect(() => {
    checkUserAuth();
  }, [checkUserAuth]);

  const logout = async () => {
    localAuth.logout();
    // Logging out of the app also drops the Supabase subscriber session —
    // otherwise it would outlive the local logout and attach to whoever
    // signs in next on this device.
    try {
      await subscriberSignOut();
    } catch {
      /* best-effort; the reconcile on next load is the backstop */
    }
    setUser(null);
    setIsAuthenticated(false);
    window.location.href = '/login';
  };

  const navigateToLogin = () => {
    window.location.href = '/login';
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings: false,
      authError: null,
      authChecked,
      logout,
      navigateToLogin,
      checkUserAuth,
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
