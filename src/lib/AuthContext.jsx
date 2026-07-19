import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { supabase } from '@/lib/supabaseClient';
import * as cloudAuth from '@/lib/cloudAuth';
import { setActiveUser } from '@/lib/activeUser';
import { startSync, stopSync } from '@/lib/dataSync';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [authChecked, setAuthChecked] = useState(false);

  // Point localDb (and everything scoped per-user) at the signed-in account,
  // then reconcile their data with the cloud snapshot. Called on first load
  // and on every Supabase auth change.
  const applyUser = useCallback(async (mapped) => {
    setActiveUser(mapped);
    setUser(mapped);
    setIsAuthenticated(!!mapped);
    if (mapped) {
      // Non-fatal: offline or a sync hiccup must never block the app.
      try {
        await startSync();
      } catch {
        /* keep using local data; sync retries on the next change */
      }
    }
  }, []);

  const checkUserAuth = useCallback(async () => {
    setIsLoadingAuth(true);
    let mapped = null;
    try {
      mapped = await cloudAuth.getSessionUser();
    } catch {
      mapped = null;
    }
    await applyUser(mapped);
    setIsLoadingAuth(false);
    setAuthChecked(true);
  }, [applyUser]);

  useEffect(() => {
    checkUserAuth();

    if (!supabase) return undefined;
    // Keep the app in sync with sign-in/sign-out that happens outside the
    // login form too (password reset, token refresh, another tab).
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (event === 'SIGNED_OUT') {
        setActiveUser(null);
        setUser(null);
        setIsAuthenticated(false);
        return;
      }
      if (session?.user) {
        const mapped = await cloudAuth.mapUser(session.user);
        // Only (re)start sync on a real identity change, not on every token
        // refresh for the already-active user.
        setActiveUser(mapped);
        setUser((prev) => {
          if (prev?.id !== mapped.id) {
            startSync().catch(() => {});
          }
          return mapped;
        });
        setIsAuthenticated(true);
      }
    });
    return () => subscription.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const logout = async () => {
    try {
      await stopSync();
    } catch {
      /* best-effort flush */
    }
    try {
      await cloudAuth.logout();
    } catch {
      /* clearing local state below is the important part */
    }
    setActiveUser(null);
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
