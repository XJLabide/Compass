"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";

import {
  dailyCollectionPath,
  sessionsPath,
  programPath,
} from "@/lib/db/paths";
import type {
  DailyDoc,
  ProgramDoc,
  SessionDoc,
  UnitSystem,
} from "@/lib/db/types";
import {
  avgDailyField,
  countWorkoutsDone,
  getWeekWindow,
  weightDeltaKg,
} from "@/lib/dashboard/weekly";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";
import { getTodayScheduled } from "@/lib/workout/scheduling";

/**
 * Dashboard "This week" card — counters across the Monday-anchored ISO week.
 *
 * Cells:
 *   1. Workouts done / planned (planned = number of non-rest days in the active
 *      program's default schedule; falls back to "—" if there's no program).
 *   2. Avg protein (g/day, averaged over days the user logged protein).
 *   3. Avg sleep (h/day).
 *   4. Weight delta vs. last week (display unit; sign-prefixed).
 *
 * Zero-data cells render "—" instead of "0" (per gap analyst). Realtime
 * listeners cover `daily` (current + previous week for delta) and `sessions`
 * (current week only), so a finished session or check-in submit flips the
 * card within ~1s.
 *
 * Owns its own subscriptions to keep the parent page a thin shell, matching
 * TodayCard / GoalBanner.
 */
export interface ThisWeekCardProps {
  uid: string;
  timezone: string;
  unitSystem: UnitSystem;
}

/** Count weekly planned workouts from the default DOW map (Mon/Tue/Thu/Fri = 4). */
function countPlannedSessions(program: ProgramDoc | null): number | null {
  if (!program || program.sessions.length === 0) return null;
  // The scheduling helper resolves rest vs. session per weekday; we walk a
  // synthetic Mon..Sun week to count non-rest days. This keeps the source of
  // truth for the schedule in `scheduling.ts`.
  let count = 0;
  // ISO weekdays Mon..Sun map to Date.getDay() values 1..6 then 0.
  const dows = [1, 2, 3, 4, 5, 6, 0];
  // We can't construct a Date with a specific tz-weekday cheaply; instead, use
  // the dow integers directly against the scheduling helper by faking a Date.
  // Since `getTodayScheduled` only uses the dow integer, we don't need
  // tz-correct dates — we can pass dow directly.
  for (const dow of dows) {
    const sched = getTodayScheduled(program, dow);
    if (sched.kind === "session") count++;
  }
  return count;
}

function formatNumber(value: number | null, digits = 0): string {
  if (value === null) return "—";
  return value.toFixed(digits);
}

function formatDelta(value: number | null, unit: string): string {
  if (value === null) return "—";
  if (Math.abs(value) < 0.005) return `0.00 ${unit}`;
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(2)} ${unit}`;
}

export default function ThisWeekCard({
  uid,
  timezone,
  unitSystem,
}: ThisWeekCardProps) {
  const [daily, setDaily] = useState<DailyDoc[] | null>(null);
  const [sessions, setSessions] = useState<SessionDoc[] | null>(null);
  const [program, setProgram] = useState<ProgramDoc | null>(null);

  // Compute week window once per (timezone) — stable for the life of the
  // mount. We deliberately don't tick at midnight; the home screen is
  // unmounted on tab switch so a remount re-anchors.
  const window = useMemo(
    () => getWeekWindow(new Date(), timezone || "UTC"),
    [timezone],
  );

  // Daily listener spans BOTH weeks (prev + current) so the weight delta is
  // realtime. The `daily` collection is small (one doc/day) so spanning two
  // weeks costs ~14 docs, well under any quota concern.
  useEffect(() => {
    if (!uid) return;
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", ">=", window.prevStartLocalDate),
      where("localDate", "<=", window.endLocalDate),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setDaily(snap.docs.map((d) => d.data())),
      () => setDaily([]),
    );
    return () => unsub();
  }, [uid, window.prevStartLocalDate, window.endLocalDate]);

  // Sessions listener covers the current week only — we don't need last week
  // for any of the displayed cells.
  useEffect(() => {
    if (!uid) return;
    const q = query(
      sessionsPath(uid),
      where("localDate", ">=", window.startLocalDate),
      where("localDate", "<=", window.endLocalDate),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setSessions(snap.docs.map((d) => d.data())),
      () => setSessions([]),
    );
    return () => unsub();
  }, [uid, window.startLocalDate, window.endLocalDate]);

  // Program listener — needed for "planned workouts" denominator. Snapshot
  // (not one-shot) so a program change updates the count without a reload.
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      programPath(uid),
      (snap) => setProgram(snap.data() ?? null),
      () => setProgram(null),
    );
    return () => unsub();
  }, [uid]);

  // Defer counters until all three subscriptions have produced a value once,
  // to avoid a 0→N flicker on first paint.
  const loaded = daily !== null && sessions !== null;

  const workoutsDone = loaded
    ? countWorkoutsDone(
        sessions!,
        window.startLocalDate,
        window.endLocalDate,
      )
    : null;
  const workoutsPlanned = countPlannedSessions(program);

  const avgProtein = loaded
    ? avgDailyField(
        daily!,
        "proteinG",
        window.startLocalDate,
        window.endLocalDate,
      )
    : null;
  const avgSleep = loaded
    ? avgDailyField(
        daily!,
        "sleepHours",
        window.startLocalDate,
        window.endLocalDate,
      )
    : null;
  const weightDeltaKgVal = loaded ? weightDeltaKg(daily!, window) : null;
  const weightDeltaDisplay =
    weightDeltaKgVal === null
      ? null
      : kgToDisplay(weightDeltaKgVal, unitSystem);
  const weightUnit = weightUnitLabel(unitSystem);

  // Workouts cell renders "—" when fully zero-data: no sessions AND no
  // program. With a program but zero sessions we show "0 / N" because that's
  // a real, informative state ("you haven't lifted yet this week").
  const workoutsLabel = useMemo(() => {
    if (!loaded) return "…";
    if (workoutsPlanned === null) {
      return workoutsDone! > 0 ? String(workoutsDone) : "—";
    }
    return `${workoutsDone} / ${workoutsPlanned}`;
  }, [loaded, workoutsDone, workoutsPlanned]);

  // Compact week range label, e.g. "May 13 – 19".
  const rangeLabel = useMemo(() => {
    try {
      const fmt = new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        month: "short",
        day: "numeric",
      });
      const start = new Date(`${window.startLocalDate}T12:00:00Z`);
      const end = new Date(`${window.endLocalDate}T12:00:00Z`);
      return `${fmt.format(start)} – ${fmt.format(end)}`;
    } catch {
      return `${window.startLocalDate} – ${window.endLocalDate}`;
    }
  }, [timezone, window.startLocalDate, window.endLocalDate]);

  return (
    <section
      aria-labelledby="this-week-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <h2
          id="this-week-heading"
          className="text-xs font-medium uppercase tracking-wide text-muted"
        >
          This week
        </h2>
        <span className="text-xs text-muted">{rangeLabel}</span>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Cell label="Workouts" value={loaded ? workoutsLabel : "…"} />
        <Cell
          label="Avg protein"
          value={loaded ? formatNumber(avgProtein, 0) : "…"}
          suffix={avgProtein === null ? undefined : "g"}
        />
        <Cell
          label="Avg sleep"
          value={loaded ? formatNumber(avgSleep, 1) : "…"}
          suffix={avgSleep === null ? undefined : "h"}
        />
        <Cell
          label="Weight Δ vs. last wk"
          value={loaded ? formatDelta(weightDeltaDisplay, weightUnit) : "…"}
        />
      </dl>
    </section>
  );
}

interface CellProps {
  label: string;
  value: string;
  suffix?: string;
}

function Cell({ label, value, suffix }: CellProps) {
  return (
    <div className="rounded-lg border border-border bg-neutral-900/60 px-3 py-2">
      <dt className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </dt>
      <dd className="mt-0.5 text-base font-semibold text-neutral-100">
        {value}
        {suffix && value !== "—" && value !== "…" ? (
          <span className="ml-1 text-xs font-normal text-muted">{suffix}</span>
        ) : null}
      </dd>
    </div>
  );
}

