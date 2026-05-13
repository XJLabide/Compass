"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { dailyPath, profilePath } from "@/lib/db/paths";
import type { DailyDoc, Profile } from "@/lib/db/types";
import {
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";

/**
 * `/history/[date]` — read-only view of a single past check-in.
 *
 * Read-only by design: the spec keeps backfill edits inside the 7-day window
 * of `/check-in`; anything older shows up here for inspection only. That
 * constraint lets us render a static dl/dt table with no form state, which is
 * both simpler and a clearer affordance to the user that they can't edit.
 *
 * Client component so we can subscribe to live updates of the doc (e.g.
 * edits made from another device on the same day).
 */
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

interface PageProps {
  params: { date: string };
}

export default function HistoryDayPage({ params }: PageProps) {
  const { date } = params;
  const { user } = useAuth();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [doc, setDoc] = useState<DailyDoc | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);

  const validDate = DATE_RE.test(date);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => setProfile(snap.data() ?? null),
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid || !validDate) return;
    const unsub = onSnapshot(
      dailyPath(user.uid, date),
      (snap) => {
        setDoc(snap.exists() ? (snap.data() ?? null) : null);
        setError(null);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid, date, validDate]);

  if (!validDate) {
    return (
      <section>
        <BackLink />
        <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
          Invalid date
        </h1>
        <p className="mt-2 text-sm text-muted">
          Expected <code>YYYY-MM-DD</code>, got <code>{date}</code>.
        </p>
      </section>
    );
  }

  return (
    <section>
      <BackLink />
      <header className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-100">{date}</h1>
        <span className="rounded-full border border-border bg-neutral-900/60 px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
          Read-only
        </span>
      </header>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {doc === undefined && !error ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : null}

      {doc === null ? (
        <p className="mt-6 text-sm text-muted">
          No check-in recorded for this day.
        </p>
      ) : null}

      {doc && profile ? <DayReadOut doc={doc} profile={profile} /> : null}
    </section>
  );
}

function BackLink() {
  return (
    <Link
      href="/history"
      className="inline-flex items-center gap-1 text-xs text-muted hover:text-neutral-200"
    >
      ‹ Back to history
    </Link>
  );
}

interface DayReadOutProps {
  doc: DailyDoc;
  profile: Profile;
}

function DayReadOut({ doc, profile }: DayReadOutProps) {
  const weightUnit = weightUnitLabel(profile.unitSystem);
  const waterUnit = profile.unitSystem === "imperial" ? "fl oz" : "ml";
  const bodyweightDisplay =
    doc.bodyweightKg !== undefined
      ? `${roundDisplayWeight(kgToDisplay(doc.bodyweightKg, profile.unitSystem))} ${weightUnit}`
      : null;
  const waterDisplay =
    doc.waterMl !== undefined
      ? profile.unitSystem === "imperial"
        ? `${(doc.waterMl / 29.5735).toFixed(0)} ${waterUnit}`
        : `${doc.waterMl} ${waterUnit}`
      : null;

  // Keep the order matching the check-in form so users build muscle memory
  // scanning across days.
  const rows: { label: string; value: string | null }[] = [
    { label: "Bodyweight", value: bodyweightDisplay },
    {
      label: "Sleep",
      value:
        doc.sleepHours !== undefined ? `${doc.sleepHours} hours` : null,
    },
    {
      label: "Sleep quality",
      value: doc.sleepQuality !== undefined ? `${doc.sleepQuality} / 5` : null,
    },
    {
      label: "Calories",
      value: doc.calories !== undefined ? `${doc.calories} kcal` : null,
    },
    {
      label: "Protein",
      value: doc.proteinG !== undefined ? `${doc.proteinG} g` : null,
    },
    { label: "Water", value: waterDisplay },
    {
      label: "Steps",
      value:
        doc.steps !== undefined ? doc.steps.toLocaleString() : null,
    },
    {
      label: "Mood",
      value: doc.mood !== undefined ? `${doc.mood} / 5` : null,
    },
  ];

  return (
    <div className="mt-5 space-y-4">
      <dl className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-neutral-900/40">
        {rows.map((r) => (
          <div key={r.label} className="flex items-baseline justify-between px-4 py-2.5">
            <dt className="text-sm text-muted">{r.label}</dt>
            <dd className="text-sm text-neutral-100">{r.value ?? "—"}</dd>
          </div>
        ))}
      </dl>
      {doc.note ? (
        <div className="rounded-xl border border-border bg-neutral-900/40 p-4">
          <div className="text-xs uppercase tracking-wide text-muted">Note</div>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-100">
            {doc.note}
          </p>
        </div>
      ) : null}
    </div>
  );
}
