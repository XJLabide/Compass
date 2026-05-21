"use client";

import { ArrowDown, ArrowUp, Flame } from "lucide-react";

import { Progress } from "@/components/ui/progress";
import type { UnitSystem } from "@/lib/db/types";
import {
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";
import type { WeeklyStats } from "@/lib/workout/landingStats";

/**
 * Three-column weekly progress card: workouts vs target, volume + week-over-
 * week delta, and current streak.
 *
 * The card is presentational; numbers come from `computeWeeklyStats` in the
 * page above.
 */

export interface WeeklyProgressCardProps {
  weeklyStats: WeeklyStats;
  unitSystem?: UnitSystem;
}

export default function WeeklyProgressCard({
  weeklyStats,
  unitSystem = "imperial",
}: WeeklyProgressCardProps) {
  const {
    workoutsThisWeek,
    workoutsTarget,
    volumeThisWeekKg,
    volumeDeltaPct,
    streakDays,
  } = weeklyStats;

  const targetSafe = Math.max(1, workoutsTarget);
  const pct = Math.max(
    0,
    Math.min(100, Math.round((workoutsThisWeek / targetSafe) * 100)),
  );

  const unit = weightUnitLabel(unitSystem);
  const volumeDisplay = roundDisplayWeight(
    kgToDisplay(volumeThisWeekKg, unitSystem),
  );
  const volumeLabel = volumeDisplay.toLocaleString(undefined, {
    maximumFractionDigits: 0,
  });

  const deltaRounded = Math.round(volumeDeltaPct);
  const deltaIsPositive = deltaRounded >= 0;
  const DeltaIcon = deltaIsPositive ? ArrowUp : ArrowDown;
  const deltaText =
    deltaRounded === 0
      ? "Even with last week"
      : `${deltaIsPositive ? "↑" : "↓"} ${Math.abs(deltaRounded)}% vs last week`;
  const deltaTone = deltaIsPositive
    ? "text-emerald-400"
    : "text-red-400";

  return (
    <div className="rounded-2xl border border-border bg-panel/60 p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-neutral-100">
          Weekly Progress
        </h3>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          This week
        </span>
      </div>

      <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
        {/* Workouts */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Workouts
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">
            {workoutsThisWeek}
            <span className="text-muted"> / {workoutsTarget}</span>
          </p>
          <Progress value={pct} className="mt-2 h-1.5 bg-neutral-800" />
        </div>

        {/* Volume */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Volume
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">
            {volumeLabel}
            <span className="text-muted"> {unit}</span>
          </p>
          <p
            className={`mt-1 inline-flex items-center gap-1 text-xs font-medium ${deltaTone}`}
          >
            <DeltaIcon aria-hidden="true" className="h-3 w-3" />
            {deltaText.replace(/^[↑↓]\s/, "")}
          </p>
        </div>

        {/* Streak */}
        <div>
          <p className="text-[10px] uppercase tracking-wide text-muted">
            Streak
          </p>
          <p className="mt-1 text-2xl font-semibold tabular-nums text-neutral-100">
            {streakDays}
            <span className="text-muted">
              {" "}
              {streakDays === 1 ? "day" : "days"}
            </span>
          </p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-amber-400">
            <Flame aria-hidden="true" className="h-3 w-3" />
            {streakDays > 0 ? "Keep it up!" : "Start today"}
          </p>
        </div>
      </div>
    </div>
  );
}
