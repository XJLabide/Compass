"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { isAllowed } from "@/lib/auth/allowlist";

/**
 * Client-side auth gate for the protected `(app)` route group.
 *
 * Behavior:
 *  - while `loading`: render a centered spinner (no flash of app shell)
 *  - signed-out: replace to `/login`
 *  - signed-in but not allowlisted: `signOut()` then replace to `/not-authorized`
 *  - signed-in and allowlisted: render children
 *
 * Server-side enforcement lives in Firestore rules — this is only a UX gate.
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading, signOut } = useAuth();

  const allowed = user ? isAllowed(user.email) : false;

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
    if (!allowed) {
      // Sign out first so the user lands on /not-authorized in a clean state
      // and a refresh doesn't bounce them straight back into the gate.
      void signOut().finally(() => {
        router.replace("/not-authorized");
      });
    }
  }, [loading, user, allowed, router, signOut]);

  if (loading || !user || !allowed) {
    return (
      <div
        className="flex min-h-screen items-center justify-center"
        role="status"
        aria-live="polite"
        aria-busy="true"
      >
        <span
          className="h-8 w-8 animate-spin rounded-full border-2 border-neutral-700 border-t-neutral-200"
          aria-hidden="true"
        />
        <span className="sr-only">Loading…</span>
      </div>
    );
  }

  return <>{children}</>;
}
