"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath } from "@/lib/db/paths";
import type { Profile } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";

import CheckInForm from "@/components/checkin/CheckInForm";
import {
  backfillMinDate,
  isWithinBackfillWindow,
} from "@/components/checkin/DatePicker";

/**
 * `/check-in` route.
 *
 * Subscribes to the user's profile (needed for tz + unit display) and renders
 * the daily check-in form once it resolves. The form itself owns the daily
 * doc subscription, submission, and merge logic.
 *
 * URL contract:
 *   - `?date=YYYY-MM-DD` selects a backfill day. Honored only if the date
 *     sits within the last 7 days (per the profile's IANA tz). Out-of-window
 *     values are rejected with a banner pointing the user at /history; we
 *     never silently rewrite the URL so the user can copy/paste and see the
 *     same banner.
 *   - No param → today.
 */
const DATE_PARAM = "date";
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export default function CheckInPage() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  // ---- Parse + validate the `?date=` param ----------------------------------
  // We resolve it relative to the profile's IANA tz so a user travelling
  // through tz boundaries still gets the same "is this within 7 days" answer
  // they'd get on their primary device.
  const rawDateParam = searchParams.get(DATE_PARAM);
  const { activeDate, outOfRange } = useMemo(() => {
    if (!profile || !rawDateParam) {
      return { activeDate: undefined, outOfRange: null as string | null };
    }
    if (!DATE_RE.test(rawDateParam)) {
      return { activeDate: undefined, outOfRange: rawDateParam };
    }
    const today = computeLocalDate(new Date(), profile.timezone);
    const min = backfillMinDate(today);
    if (isWithinBackfillWindow(rawDateParam, today, min)) {
      return { activeDate: rawDateParam, outOfRange: null };
    }
    return { activeDate: undefined, outOfRange: rawDateParam };
  }, [profile, rawDateParam]);

  // Picker callback: write the new date back into the URL so reload / share
  // / back-forward all work. `router.replace` (not push) keeps the back-stack
  // from filling up as the user scrubs through days.
  const handleDateChange = useCallback(
    (next: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set(DATE_PARAM, next);
      router.replace(`/check-in?${params.toString()}`);
    },
    [router, searchParams],
  );

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

  return (
    <>
      {outOfRange ? (
        <div
          role="alert"
          aria-live="polite"
          className="mb-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-sm text-amber-200"
        >
          <strong className="font-medium">{outOfRange}</strong> is outside the
          7-day backfill window — it&apos;s read-only.{" "}
          <a
            href={`/history/${outOfRange}`}
            className="underline underline-offset-2"
          >
            Open in History →
          </a>
        </div>
      ) : null}
      <CheckInForm
        profile={profile}
        initialLocalDate={activeDate}
        onDateChange={handleDateChange}
      />
    </>
  );
}
