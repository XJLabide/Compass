"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import EmailPasswordForm from "@/components/auth/EmailPasswordForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";

export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signInGoogle, signInEmail } = useAuth();
  const [error, setError] = useState<string | null>(null);

  // If we land on /login while already signed in (refresh after auth, redirect
  // flow finishing, etc.), route to the home page.
  useEffect(() => {
    if (!loading && user) {
      router.replace("/");
    }
  }, [loading, user, router]);

  // While we don't yet know whether the user is signed-in, keep the form out
  // of the way to avoid the flash-of-form on a refresh.
  const showForm = !loading && !user;

  return (
    <section className="flex flex-1 flex-col">
      <header className="mb-8">
        <h1 className="text-2xl font-semibold text-neutral-100">Sign in</h1>
        <p className="mt-2 text-sm text-muted">
          Personal Tracker is single-user. Use the allowlisted account to
          continue.
        </p>
      </header>

      {showForm ? (
        <div className="space-y-6">
          <GoogleSignInButton
            onSignIn={signInGoogle}
            onError={(msg) => setError(msg)}
          />

          <div className="flex items-center gap-3 text-xs text-muted">
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
            <span className="uppercase tracking-wide">or</span>
            <span className="h-px flex-1 bg-border" aria-hidden="true" />
          </div>

          <EmailPasswordForm
            onSubmit={async (email, password) => {
              setError(null);
              await signInEmail(email, password);
            }}
            onError={(msg) => setError(msg)}
          />

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
      ) : (
        <div className="text-sm text-muted">Loading…</div>
      )}
    </section>
  );
}
