"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Flame } from "lucide-react";

import { dailyCollectionPath } from "@/lib/db/paths";
import type { DailyDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Check-in streak — counts consecutive days back from today where the daily
 * doc has at least one logged metric. Surfaces:
 *   - Current streak (days)
 *   - Best streak in the last 60 days (lightweight ceiling)
 *
 * Empty state: shows "Start your streak — log today" CTA when nothing logged.
 */
export interface StreakCardProps {
  uid: string;
  timezone: string;
}

const WINDOW_DAYS = 60;

function hasLoggedAnything(d: DailyDoc): boolean {
  return (
    d.bodyweightKg !== undefined ||
    d.sleepHours !== undefined ||
    d.sleepQuality !== undefined ||
    d.calories !== undefined ||
    d.proteinG !== undefined ||
    d.waterMl !== undefined ||
    d.steps !== undefined ||
    d.mood !== undefined ||
    (d.note !== undefined && d.note.trim().length > 0)
  );
}

function addDaysIso(date: string, delta: number): string {
  const t = Date.parse(`${date}T00:00:00Z`);
  if (Number.isNaN(t)) return date;
  const next = new Date(t + delta * 24 * 60 * 60 * 1000);
  return next.toISOString().slice(0, 10);
}

function computeStreaks(
  loggedDates: Set<string>,
  today: string,
): { current: number; best: number } {
  let current = 0;
  let cursor = today;
  while (loggedDates.has(cursor)) {
    current += 1;
    cursor = addDaysIso(cursor, -1);
  }

  // Best across the window by scanning the loaded set chronologically.
  const sorted = [...loggedDates].sort();
  let best = 0;
  let run = 0;
  let prev: string | null = null;
  for (const d of sorted) {
    if (prev !== null && addDaysIso(prev, 1) === d) {
      run += 1;
    } else {
      run = 1;
    }
    if (run > best) best = run;
    prev = d;
  }
  return { current, best: Math.max(best, current) };
}

export default function StreakCard({ uid, timezone }: StreakCardProps) {
  const [logged, setLogged] = useState<Set<string> | null>(null);

  const today = useMemo(
    () => computeLocalDate(new Date(), timezone || "UTC"),
    [timezone],
  );
  const windowStart = useMemo(
    () => addDaysIso(today, -WINDOW_DAYS),
    [today],
  );

  useEffect(() => {
    if (!uid) return;
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", ">=", windowStart),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next = new Set<string>();
        snap.docs.forEach((d) => {
          const data = d.data();
          if (hasLoggedAnything(data)) next.add(data.localDate);
        });
        setLogged(next);
      },
      () => setLogged(new Set()),
    );
    return () => unsub();
  }, [uid, windowStart]);

  if (logged === null) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Streak
        </div>
        <div className="mt-3 flex items-end gap-4">
          <Skeleton className="h-10 w-20" />
          <Skeleton className="h-6 w-24" />
        </div>
      </section>
    );
  }

  const { current, best } = computeStreaks(logged, today);
  const hot = current >= 3;

  return (
    <section
      aria-labelledby="streak-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="streak-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Streak
        </h2>
        <span className="text-xs text-muted">last {WINDOW_DAYS} days</span>
      </div>

      <div className="mt-3 flex items-end gap-4">
        <div className="flex items-center gap-2">
          <Flame
            aria-hidden
            className={
              hot ? "h-7 w-7 text-amber-400" : "h-7 w-7 text-muted"
            }
          />
          <div>
            <div className="text-2xl font-semibold text-neutral-100">
              {current}
            </div>
            <div className="text-[10px] uppercase tracking-wide text-muted">
              day{current === 1 ? "" : "s"}
            </div>
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-sm font-medium text-neutral-200">{best}</div>
          <div className="text-[10px] uppercase tracking-wide text-muted">
            best
          </div>
        </div>
      </div>

      {current === 0 ? (
        <p className="mt-3 text-xs text-muted">
          Log a check-in today to start a streak.
        </p>
      ) : null}
    </section>
  );
}
