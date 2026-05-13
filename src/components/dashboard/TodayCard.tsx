"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot } from "firebase/firestore";
import { CheckCircle2, Circle, Dumbbell, ClipboardCheck } from "lucide-react";

import { dailyPath, programPath } from "@/lib/db/paths";
import type { DailyDoc, ProgramDoc } from "@/lib/db/types";
import {
  computeLocalDate,
  getLocalDayOfWeek,
  getTodayScheduled,
} from "@/lib/workout/scheduling";

/**
 * Dashboard "Today" card — date header plus two CTAs:
 *   1. Log workout (shows the active program's scheduled session name for
 *      today, or "Rest day" when nothing is scheduled).
 *   2. Daily check-in (shows a completion badge that flips green as soon as
 *      today's `daily/{localDate}` doc has any logged metric).
 *
 * Both data sources are realtime via `onSnapshot` so the check-in badge flips
 * within ~1s of the user submitting the check-in form (acceptance criterion).
 *
 * Owns its own subscriptions instead of taking props so the home page stays
 * a thin shell.
 */
export interface TodayCardProps {
  uid: string;
  timezone: string;
}

/**
 * Heuristic for "the user has checked in today". We treat the day as logged
 * if the daily doc exists AND at least one user-facing metric field is set.
 * `updatedAt` alone doesn't count because the converter always stamps it.
 */
function hasLoggedAnything(daily: DailyDoc | null): boolean {
  if (!daily) return false;
  return (
    daily.bodyweightKg !== undefined ||
    daily.sleepHours !== undefined ||
    daily.sleepQuality !== undefined ||
    daily.calories !== undefined ||
    daily.proteinG !== undefined ||
    daily.waterMl !== undefined ||
    daily.steps !== undefined ||
    daily.mood !== undefined ||
    (daily.note !== undefined && daily.note.trim().length > 0)
  );
}

export default function TodayCard({ uid, timezone }: TodayCardProps) {
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [programLoaded, setProgramLoaded] = useState(false);
  const [daily, setDaily] = useState<DailyDoc | null>(null);
  const [dailyLoaded, setDailyLoaded] = useState(false);

  // Compute today's localDate once per render. The Date constructor is cheap
  // and stable enough — we don't need a ticker since the home screen is
  // unmounted on tab switch.
  const today = useMemo(() => {
    const now = new Date();
    const tz = timezone || "UTC";
    return {
      localDate: computeLocalDate(now, tz),
      dow: getLocalDayOfWeek(now, tz),
    };
  }, [timezone]);

  // Realtime listener: active program (for today's scheduled session).
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      programPath(uid),
      (snap) => {
        setProgram(snap.data() ?? null);
        setProgramLoaded(true);
      },
      () => {
        setProgramLoaded(true);
      },
    );
    return () => unsub();
  }, [uid]);

  // Realtime listener: today's daily doc (for the check-in completion badge).
  useEffect(() => {
    if (!uid) return;
    setDailyLoaded(false);
    const unsub = onSnapshot(
      dailyPath(uid, today.localDate),
      (snap) => {
        setDaily(snap.data() ?? null);
        setDailyLoaded(true);
      },
      () => {
        setDailyLoaded(true);
      },
    );
    return () => unsub();
  }, [uid, today.localDate]);

  const scheduled = useMemo(
    () => getTodayScheduled(program, today.dow),
    [program, today.dow],
  );
  const checkedIn = hasLoggedAnything(daily);

  // Human-friendly date label: "Mon, May 13"
  const dateLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        weekday: "short",
        month: "short",
        day: "numeric",
      }).format(new Date());
    } catch {
      return today.localDate;
    }
  }, [timezone, today.localDate]);

  return (
    <section
      aria-labelledby="today-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="today-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          Today
        </h2>
        <span className="text-xs text-muted">{dateLabel}</span>
      </div>

      {/* Log workout CTA */}
      <Link
        href="/workout"
        className="mt-3 flex items-center gap-3 rounded-lg border border-border bg-neutral-900/60 px-3 py-3 active:bg-neutral-800/60"
      >
        <Dumbbell aria-hidden className="h-5 w-5 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-100">
            Log workout
          </div>
          <div className="mt-0.5 truncate text-xs text-muted">
            {!programLoaded
              ? "Loading…"
              : scheduled.kind === "session"
                ? scheduled.session.name
                : "Rest day"}
          </div>
        </div>
        <span aria-hidden className="text-muted">
          ›
        </span>
      </Link>

      {/* Daily check-in CTA */}
      <Link
        href="/check-in"
        className="mt-2 flex items-center gap-3 rounded-lg border border-border bg-neutral-900/60 px-3 py-3 active:bg-neutral-800/60"
      >
        <ClipboardCheck aria-hidden className="h-5 w-5 text-accent" />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-neutral-100">
            Daily check-in
          </div>
          <div className="mt-0.5 text-xs text-muted">
            {!dailyLoaded
              ? "Loading…"
              : checkedIn
                ? "Logged for today"
                : "Not yet logged"}
          </div>
        </div>
        {dailyLoaded && checkedIn ? (
          <CheckCircle2
            aria-label="Check-in complete"
            className="h-5 w-5 text-emerald-400"
          />
        ) : (
          <Circle aria-hidden className="h-5 w-5 text-muted" />
        )}
      </Link>
    </section>
  );
}
