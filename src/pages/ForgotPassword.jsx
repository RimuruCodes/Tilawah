import React, { useState } from "react";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Mail, ArrowLeft, Loader2, AlertTriangle } from "lucide-react";
import AuthLayout from "@/components/AuthLayout";
import { hashEmail } from "@/lib/localAuth";

// Matches by the one-way email hash (with a legacy plaintext fallback) so
// account existence is confirmed WITHOUT the app ever holding — or echoing
// back — a readable copy of the address.
async function findLocalUserByEmail(email) {
  try {
    const normalized = email.trim().toLowerCase();
    const emailHash = await hashEmail(normalized);
    const users = JSON.parse(localStorage.getItem("qc_users") || "[]");
    return (
      users.find((u) => u.emailHash === emailHash) ||
      users.find((u) => u.email === normalized) ||
      null
    );
  } catch {
    return null;
  }
}

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  // Holds the matched account so deletion can target it by id without
  // re-deriving anything from the (never-displayed) email.
  const [foundUser, setFoundUser] = useState(null);
  const [confirmingDelete, setConfirmingDelete] = useState(false);
  const [done, setDone] = useState(false);
  const found = !!foundUser;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    const user = await findLocalUserByEmail(email);
    setFoundUser(user);
    setChecked(true);
    setLoading(false);
  };

  const handleDeleteAndRestart = () => {
    if (foundUser) {
      const users = JSON.parse(localStorage.getItem("qc_users") || "[]");
      const remaining = users.filter((u) => u.id !== foundUser.id);
      localStorage.setItem("qc_users", JSON.stringify(remaining));
      // Also clear that account's stored recitation/progress data.
      Object.keys(localStorage)
        .filter((k) => k.startsWith(`qc_data_${foundUser.id}_`))
        .forEach((k) => localStorage.removeItem(k));
    }
    setDone(true);
  };

  return (
    <AuthLayout
      icon={Mail}
      title="Reset password"
      subtitle="This app has no server, so there's no email to send"
      footer={
        <Link to="/login" className="text-primary font-medium hover:underline">
          <ArrowLeft className="w-3 h-3 inline mr-1" />Back to log in
        </Link>
      }
    >
      {done ? (
        <div className="space-y-4 text-center">
          <p className="text-sm text-foreground">
            That local account and its saved data have been removed from this device.
          </p>
          <Button asChild className="w-full h-12 font-medium">
            <Link to="/register">Create a new account</Link>
          </Button>
        </div>
      ) : !checked ? (
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="p-3 rounded-lg bg-muted text-muted-foreground text-xs flex gap-2">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <span>
              Your account and password live only in this browser — there's no backend to send a
              reset link. If you've forgotten your password, the only option is to remove the
              local account and start fresh (this deletes its saved recitations and progress).
            </span>
          </div>
          <div className="space-y-2">
            <Label htmlFor="email">Email address</Label>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" aria-hidden="true" />
              <Input
                id="email"
                type="email"
                autoComplete="email"
                autoFocus
                placeholder="you@example.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="pl-10 h-12"
                required
              />
            </div>
          </div>
          <Button type="submit" className="w-full h-12 font-medium" disabled={loading}>
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Checking...
              </>
            ) : (
              "Check this device"
            )}
          </Button>
        </form>
      ) : !found ? (
        <p className="text-sm text-foreground text-center">
          No local account with that email was found on this device.
        </p>
      ) : !confirmingDelete ? (
        <div className="space-y-4">
          <p className="text-sm text-foreground text-center">
            Found a local account on this device for that email. There's no way to recover the
            password — only to remove it and start over.
          </p>
          <Button
            variant="destructive"
            className="w-full h-12 font-medium"
            onClick={() => setConfirmingDelete(true)}
          >
            Delete account &amp; start over
          </Button>
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-destructive text-center font-medium">
            This permanently deletes this account's saved recitations and progress on this device.
            Are you sure?
          </p>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1 h-12" onClick={() => setConfirmingDelete(false)}>
              Cancel
            </Button>
            <Button variant="destructive" className="flex-1 h-12" onClick={handleDeleteAndRestart}>
              Yes, delete it
            </Button>
          </div>
        </div>
      )}
    </AuthLayout>
  );
}
