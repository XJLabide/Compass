"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import { isAllowed } from "@/lib/auth/allowlist";
import CompassLoader from "@/components/ui/CompassLoader";

/**
 * Client-side auth gate for the protected `(app)` route group.
 *
 * Behavior:
 *  - while `loading`: render full-screen Spinning Compass Loader
 *  - signed-out: replace to `/login` and return null (prevents loader lockup)
 *  - signed-in but not allowlisted: `signOut()` then replace to `/not-authorized`
 *  - signed-in and allowlisted: render app children
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
      void signOut().finally(() => {
        router.replace("/not-authorized");
      });
    }
  }, [loading, user, allowed, router, signOut]);

  if (loading) {
    return (
      <CompassLoader mode="fullscreen" size="xl" label="Navigating Compass..." />
    );
  }

  if (!user || !allowed) {
    return null;
  }

  return <>{children}</>;
}
