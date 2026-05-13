"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";

export default function SettingsPage() {
  const router = useRouter();
  const { user, signOut } = useAuth();
  const [signingOut, setSigningOut] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSignOut = async () => {
    setError(null);
    setSigningOut(true);
    try {
      await signOut();
      router.replace("/login");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to sign out. Try again.";
      setError(message);
      setSigningOut(false);
    }
  };

  return (
    <section>
      <h1 className="text-2xl font-semibold text-neutral-100">Settings</h1>
      <p className="mt-2 text-sm text-muted">
        Preferences, units, and account controls will live here.
      </p>

      <div className="mt-8 space-y-3 rounded-xl border border-border bg-neutral-900/40 p-4">
        <div>
          <h2 className="text-sm font-medium text-neutral-200">Account</h2>
          {user?.email ? (
            <p className="mt-1 text-xs text-muted break-all">{user.email}</p>
          ) : null}
        </div>

        <button
          type="button"
          onClick={handleSignOut}
          disabled={signingOut}
          className="inline-flex h-10 w-full items-center justify-center rounded-lg border border-border bg-neutral-900 px-4 text-sm font-medium text-neutral-100 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {signingOut ? "Signing out…" : "Sign out"}
        </button>

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
          >
            {error}
          </div>
        ) : null}
      </div>
    </section>
  );
}
