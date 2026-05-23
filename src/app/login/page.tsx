"use client";

import Image from "next/image";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { useAuth } from "@/lib/auth/useAuth";
import { isAllowed } from "@/lib/auth/allowlist";
import EmailPasswordForm from "@/components/auth/EmailPasswordForm";
import GoogleSignInButton from "@/components/auth/GoogleSignInButton";
import LoginBackground from "@/components/auth/LoginBackground";
import LoginHero from "@/components/auth/LoginHero";

/**
 * `/login` — single centered card with form (left) and hero (right) over an
 * animated mesh-gradient background. The two halves share the same rounded
 * outer container with no gap between them, like the reference template.
 */
export default function LoginPage() {
  const router = useRouter();
  const { user, loading, signInGoogle, signInEmail, signOut } = useAuth();
  const [error, setError] = useState<string | null>(null);
  const [authNotice, setAuthNotice] = useState<string | null>(null);

  useEffect(() => {
    if (loading || !user) return;

    if (isAllowed(user.email)) {
      router.replace("/");
      return;
    }

    const email = user.email ?? "that Google account";
    setAuthNotice(null);
    setError(
      `${email} signed in successfully, but it is not on this app's allowlist. Use the allowlisted account or add this email to NEXT_PUBLIC_ALLOWED_EMAILS, then restart the dev server.`,
    );
    void signOut();
  }, [loading, user, router, signOut]);

  const showForm = !loading && !user;

  return (
    <>
      <LoginBackground />

      <main className="relative z-10 flex min-h-dvh items-center justify-center px-4 py-8">
        <div className="grid w-full max-w-4xl overflow-hidden rounded-2xl border border-white/10 bg-neutral-950/70 shadow-2xl shadow-black/50 backdrop-blur-xl lg:grid-cols-[1fr_1fr]">
          {/* Form half */}
          <section className="relative flex flex-col border-white/10 lg:border-r">
            <div className="flex items-center gap-2.5 border-b border-white/10 px-6 py-3.5">
              <Image
                src="/logo-mark.svg"
                alt=""
                width={22}
                height={22}
                priority
                unoptimized
                className="h-[22px] w-[22px]"
              />
              <span className="text-[13px] font-semibold tracking-tight text-neutral-100">
                Compass
              </span>
            </div>

            <div className="flex flex-1 flex-col justify-center px-6 py-8 sm:px-8">
              <h1 className="text-[26px] font-semibold leading-tight tracking-tight text-neutral-100">
                Welcome back
              </h1>
              <p className="mt-2 text-xs leading-relaxed text-muted">
                Compass is single-user. Use the allowlisted account to continue.
              </p>

              {showForm ? (
                <div className="mt-6 space-y-4">
                  <EmailPasswordForm
                    onSubmit={async (email, password) => {
                      setError(null);
                      setAuthNotice("Checking your account…");
                      await signInEmail(email, password);
                    }}
                    onError={(msg) => {
                      setAuthNotice(null);
                      setError(msg);
                    }}
                  />

                  <div className="flex items-center gap-3 text-[10px] font-medium uppercase tracking-[0.15em] text-muted">
                    <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                    <span>or</span>
                    <span className="h-px flex-1 bg-white/10" aria-hidden="true" />
                  </div>

                  <GoogleSignInButton
                    onSignIn={async () => {
                      setError(null);
                      setAuthNotice("Waiting for Google…");
                      await signInGoogle();
                      setAuthNotice("Checking your account…");
                    }}
                    onError={(msg) => {
                      setAuthNotice(null);
                      setError(msg);
                    }}
                  />

                  {authNotice ? (
                    <div
                      role="status"
                      aria-live="polite"
                      className="rounded-lg border border-accent/30 bg-accent/10 px-3 py-2 text-sm text-accent"
                    >
                      {authNotice}
                    </div>
                  ) : null}

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
                <div className="mt-6 space-y-3">
                  <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
                  <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
                  <div className="h-12 w-full animate-pulse rounded-lg bg-white/5" />
                </div>
              )}
            </div>
          </section>

          {/* Hero half (lg+) */}
          <LoginHero />
        </div>
      </main>
    </>
  );
}
