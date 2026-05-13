"use client";

import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath } from "@/lib/db/paths";
import type { Profile } from "@/lib/db/types";

import TodayCard from "@/components/dashboard/TodayCard";
import GoalBanner from "@/components/dashboard/GoalBanner";
import EmptyState from "@/components/dashboard/EmptyState";

/**
 * `/` — dashboard home.
 *
 * Layout (top → bottom, single column, mobile-first):
 *   1. TodayCard — date + workout CTA + check-in CTA (both above the fold on
 *      a ~6.1" phone).
 *   2. GoalBanner — bodyweight trend vs. weekly gain target. Renders an
 *      empty-state CTA when <3 weigh-ins exist.
 *
 * Subsequent dashboard sections (this-week stats, trends, recent PRs) ship in
 * sibling tasks fn-6-kra.2 and fn-6-kra.3.
 *
 * The page itself owns the profile subscription so child components don't
 * each open one; TodayCard and GoalBanner then own their own per-doc /
 * per-collection listeners against the canonical Firestore paths.
 */
export default function HomePage() {
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    setProfileLoaded(false);
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => {
        setProfile(snap.data() ?? null);
        setProfileLoaded(true);
        setError(null);
      },
      (err) => {
        setProfileLoaded(true);
        setError(err.message);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  if (!user) {
    // AuthGate normally prevents this, but render a no-op shell to keep TS
    // happy and avoid a flash if it ever does.
    return null;
  }

  return (
    <section className="space-y-4">
      <header>
        <h1 className="text-2xl font-semibold text-neutral-100">Home</h1>
      </header>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      <TodayCard uid={user.uid} timezone={profile?.timezone ?? "UTC"} />

      {profileLoaded && profile ? (
        <GoalBanner
          uid={user.uid}
          timezone={profile.timezone}
          weeklyGainLb={profile.weeklyGainLb}
          unitSystem={profile.unitSystem}
        />
      ) : profileLoaded && !profile ? (
        <EmptyState
          title="Finish setup"
          description="Set your weekly gain target to track your trend."
          ctaLabel="Open settings"
          href="/settings"
        />
      ) : (
        <div className="rounded-xl border border-border bg-neutral-900/40 px-4 py-3 text-sm text-muted">
          Loading…
        </div>
      )}
    </section>
  );
}
