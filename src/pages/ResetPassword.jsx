import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Lock, Loader2, CheckCircle2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { supabase } from "@/lib/supabaseClient";
import { setNewPassword } from "@/lib/cloudAuth";

// Landing page for the password-reset email link. Supabase parses the
// recovery token from the URL and establishes a short-lived recovery session,
// during which updateUser({ password }) is allowed.
export default function ResetPassword() {
  const [ready, setReady] = useState(false); // recovery session present?
  const [checking, setChecking] = useState(true);
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    if (!supabase) {
      setChecking(false);
      return undefined;
    }
    let settled = false;
    // The recovery session may already be parsed by the time we mount, or it
    // may arrive via the PASSWORD_RECOVERY event a moment later.
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        settled = true;
        setReady(true);
        setChecking(false);
      }
    });
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY" || session) {
        settled = true;
        setReady(true);
        setChecking(false);
      }
    });
    // If nothing arrives shortly, the link is missing/expired.
    const t = setTimeout(() => {
      if (!settled) setChecking(false);
    }, 2500);
    return () => {
      subscription.unsubscribe();
      clearTimeout(t);
    };
  }, []);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError("");
    if (password.length < 6) {
      setError("Password must be at least 6 characters.");
      return;
    }
    if (password !== confirm) {
      setError("Passwords don't match.");
      return;
    }
    setLoading(true);
    try {
      await setNewPassword(password);
      setDone(true);
      // The recovery session is now a normal session — send them into the app.
      setTimeout(() => {
        window.location.href = "/";
      }, 1200);
    } catch (err) {
      setError(err.message || "Couldn't update your password. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <AuthLayout icon={CheckCircle2} title="Password updated" subtitle="Signing you in…">
        <p className="text-sm text-foreground text-center">
          Your password has been changed. Taking you to the app…
        </p>
      </AuthLayout>
    );
  }

  if (!checking && !ready) {
    return (
      <AuthLayout
        icon={AlertTriangle}
        title="Reset link invalid or expired"
        subtitle="Please request a new one"
        footer={
          <Link to="/forgot-password" className="text-primary font-medium hover:underline">
            Request a new reset link
          </Link>
        }
      >
        <p className="text-sm text-foreground text-center">
          This password-reset link is missing or has expired. Request a fresh one and try again.
        </p>
      </AuthLayout>
    );
  }

  return (
    <AuthLayout icon={Lock} title="Set a new password" subtitle="Choose a new password for your account">
      {checking ? (
        <div className="flex justify-center py-4">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm">{error}</div>
          )}
          <div className="space-y-2">
            <Label htmlFor="password">New password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="password"
                type="password"
                autoComplete="new-password"
                autoFocus
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <div className="space-y-2">
            <Label htmlFor="confirm">Confirm new password</Label>
            <div className="relative">
              <Lock className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="confirm"
                type="password"
                autoComplete="new-password"
                placeholder="••••••••"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Updating…
              </>
            ) : (
              "Update password"
            )}
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
