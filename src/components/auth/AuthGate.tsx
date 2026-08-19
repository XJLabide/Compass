"use client";

import { useEffect, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth/useAuth";
import CompassLoader from "@/components/ui/CompassLoader";

/**
 * Client-side auth gate for the protected `(app)` route group.
 *
 * Behavior:
 *  - while `loading`: render full-screen Spinning Compass Loader
 *  - signed-out: replace to `/login` and return null (prevents loader lockup)
 *  - signed-in: render app children
 */
export default function AuthGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const { user, loading } = useAuth();

  useEffect(() => {
    if (loading) return;
    if (!user) {
      router.replace("/login");
      return;
    }
  }, [loading, user, router]);

  if (loading) {
    return (
      <CompassLoader mode="fullscreen" size="xl" label="Navigating Compass..." />
    );
  }

  if (!user) {
    return null;
  }

  return <>{children}</>;
}
