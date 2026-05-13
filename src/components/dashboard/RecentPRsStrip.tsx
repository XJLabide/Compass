"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { limit, onSnapshot, orderBy, query } from "firebase/firestore";
import { Trophy } from "lucide-react";

import { prsPath } from "@/lib/db/paths";
import type { PRDoc, UnitSystem } from "@/lib/db/types";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";

import EmptyState from "./EmptyState";

/**
 * Recent PRs strip — last 3 personal records via a realtime listener on the
 * `prs` collection. Acts as a "wall of trophies" entry point linking to each
 * exercise's history page.
 *
 * Display: exercise name + e1RM (rounded to integer in display unit) + the
 * raw set bucket (weight × reps) + date. We show both e1RM and the raw bucket
 * so a 1RM-style PR and a 8RM-style PR both make sense at a glance.
 */
export interface RecentPRsStripProps {
  uid: string;
  unitSystem: UnitSystem;
}

const RECENT_PR_LIMIT = 3;

export default function RecentPRsStrip({
  uid,
  unitSystem,
}: RecentPRsStripProps) {
  const [prs, setPrs] = useState<PRDoc[] | null>(null);

  useEffect(() => {
    if (!uid) return;
    // Realtime: a new PR pushes into the strip immediately after a session
    // finish writes to `users/{uid}/prs`. The query is small (limit 3) so the
    // listener is cheap.
    const q = query(prsPath(uid), orderBy("date", "desc"), limit(RECENT_PR_LIMIT));
    const unsub = onSnapshot(
      q,
      (snap) => setPrs(snap.docs.map((d) => d.data())),
      () => setPrs([]),
    );
    return () => unsub();
  }, [uid]);

  const unit = weightUnitLabel(unitSystem);

  if (prs === null) {
    return (
      <section
        aria-labelledby="recent-prs-heading"
        className="rounded-xl border border-border bg-neutral-900/40 p-4"
      >
        <h2
          id="recent-prs-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Recent PRs
        </h2>
        <p className="mt-2 text-sm text-muted">Loading…</p>
      </section>
    );
  }

  if (prs.length === 0) {
    return (
      <EmptyState
        title="No PRs yet"
        description="Finish a workout to start banking personal records."
        ctaLabel="Log workout"
        href="/workout"
      />
    );
  }

  return (
    <section
      aria-labelledby="recent-prs-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <h2
        id="recent-prs-heading"
        className="text-xs font-medium uppercase tracking-wide text-muted"
      >
        Recent PRs
      </h2>
      <ul className="mt-2 divide-y divide-border">
        {prs.map((pr) => (
          <PRRow
            key={`${pr.sessionId}-${pr.exerciseId}-${pr.localDate}`}
            pr={pr}
            unitSystem={unitSystem}
            unit={unit}
          />
        ))}
      </ul>
    </section>
  );
}

interface PRRowProps {
  pr: PRDoc;
  unitSystem: UnitSystem;
  unit: "kg" | "lb";
}

function PRRow({ pr, unitSystem, unit }: PRRowProps) {
  const bucketWeight = useMemo(
    () => kgToDisplay(pr.weightKg, unitSystem),
    [pr.weightKg, unitSystem],
  );
  const e1rm = useMemo(
    () => kgToDisplay(pr.e1RMKg, unitSystem),
    [pr.e1RMKg, unitSystem],
  );

  const bucketLabel = `${formatWeight(bucketWeight)} ${unit} × ${pr.reps}`;
  const e1rmLabel = `e1RM ${formatWeight(e1rm)} ${unit}`;

  // Date label: prefer the `date` Timestamp's toDate (server-stamped) for
  // localized output, fall back to the raw localDate string if the Timestamp
  // hasn't fully hydrated.
  const dateLabel = useMemo(() => {
    try {
      const d = pr.date?.toDate?.() ?? new Date(`${pr.localDate}T12:00:00Z`);
      return new Intl.DateTimeFormat("en-US", {
        month: "short",
        day: "numeric",
      }).format(d);
    } catch {
      return pr.localDate;
    }
  }, [pr.date, pr.localDate]);

  return (
    <li>
      <Link
        href={`/exercise/${pr.exerciseId}`}
        className="flex items-center gap-3 py-2 active:bg-neutral-800/40"
      >
        <Trophy aria-hidden className="h-5 w-5 shrink-0 text-amber-300" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-neutral-100">
            {pr.exerciseName}
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {bucketLabel} · {e1rmLabel}
          </div>
        </div>
        <span className="shrink-0 text-xs text-muted">{dateLabel}</span>
      </Link>
    </li>
  );
}

/** Round to 0.5 for tidier display; PR weights are usually plate-aligned. */
function formatWeight(value: number): string {
  const rounded = Math.round(value * 2) / 2;
  return Number.isInteger(rounded) ? rounded.toFixed(0) : rounded.toFixed(1);
}
