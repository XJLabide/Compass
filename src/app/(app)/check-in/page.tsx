"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath } from "@/lib/db/paths";
import type { Profile } from "@/lib/db/types";

import CheckInForm from "@/components/checkin/CheckInForm";

/**
 * `/check-in` route.
 *
 * Subscribes to the user's profile (needed for tz + unit display) and renders
 * the daily check-in form once it resolves. The form itself owns the daily
 * doc subscription, submission, and merge logic.
 */
export default function CheckInPage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => {
        const data = snap.data();
        if (data) {
          setProfile(data);
          setError(null);
        } else {
          setError(
            "Profile not found. Sign out and back in to re-run setup.",
          );
        }
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  if (error) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-neutral-100">Check-in</h1>
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      </section>
    );
  }

  if (!profile) {
    return (
      <section>
        <h1 className="text-2xl font-semibold text-neutral-100">Check-in</h1>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </section>
    );
  }

  return <CheckInForm profile={profile} />;
}
