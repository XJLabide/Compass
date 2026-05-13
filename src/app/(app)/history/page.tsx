"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { onSnapshot, orderBy, query } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { dailyCollectionPath } from "@/lib/db/paths";
import type { DailyDoc } from "@/lib/db/types";

/**
 * `/history` — listing of every saved daily check-in, newest first.
 *
 * Rendering strategy: we subscribe to the whole `daily` collection ordered by
 * `localDate desc`. The collection is tiny (one doc per day, capped by user
 * lifetime), so an `onSnapshot` over the whole thing is cheaper and simpler
 * than paginating in v1. If this ever crosses ~1y the next iteration should
 * add a `limit()` + "load more".
 *
 * Each row is a tap target that routes to `/history/[date]` for the read-only
 * view. We keep the row dense: date + a short summary of which fields were
 * captured so the user can spot blanks at a glance.
 */
export default function HistoryPage() {
  const { user } = useAuth();
  const [docs, setDocs] = useState<DailyDoc[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user?.uid) return;
    const q = query(dailyCollectionPath(user.uid), orderBy("localDate", "desc"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setDocs(snap.docs.map((d) => d.data()));
        setError(null);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  return (
    <section>
      <h1 className="text-2xl font-semibold text-neutral-100">History</h1>
      <p className="mt-1 text-sm text-muted">
        Past daily check-ins. Tap any row to view.
      </p>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {docs === null && !error ? (
        <p className="mt-4 text-sm text-muted">Loading…</p>
      ) : null}

      {docs && docs.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No check-ins yet. Once you save one it&apos;ll appear here.
        </p>
      ) : null}

      {docs && docs.length > 0 ? (
        <ul className="mt-5 divide-y divide-border overflow-hidden rounded-xl border border-border bg-neutral-900/40">
          {docs.map((d) => (
            <li key={d.localDate}>
              <Link
                href={`/history/${d.localDate}`}
                className="flex items-center justify-between gap-3 px-4 py-3 active:bg-neutral-800/50"
              >
                <div>
                  <div className="text-sm font-medium text-neutral-100">
                    {d.localDate}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {summarizeDay(d)}
                  </div>
                </div>
                <span aria-hidden className="text-muted">
                  ›
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

/**
 * Compact one-liner of which fields the user logged that day. Returns a
 * comma-separated list of short tags (`BW`, `Sleep`, `Cal`, …) rather than the
 * raw numbers — keeps the row scannable at a glance and avoids the unit-system
 * branching that the dedicated day view already does.
 */
function summarizeDay(d: DailyDoc): string {
  const tags: string[] = [];
  if (d.bodyweightKg !== undefined) tags.push("BW");
  if (d.sleepHours !== undefined || d.sleepQuality !== undefined)
    tags.push("Sleep");
  if (d.calories !== undefined) tags.push("Cal");
  if (d.proteinG !== undefined) tags.push("Protein");
  if (d.waterMl !== undefined) tags.push("Water");
  if (d.steps !== undefined) tags.push("Steps");
  if (d.mood !== undefined) tags.push("Mood");
  if (d.note) tags.push("Note");
  return tags.length === 0 ? "(empty)" : tags.join(" · ");
}
