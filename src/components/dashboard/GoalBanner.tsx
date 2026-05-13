"use client";

import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { TrendingDown, TrendingUp, Minus } from "lucide-react";

import { dailyCollectionPath } from "@/lib/db/paths";
import type { DailyDoc, UnitSystem } from "@/lib/db/types";
import {
  kgToDisplay,
  lbToKg,
  weightUnitLabel,
} from "@/lib/workout/units";
import { computeLocalDate } from "@/lib/workout/scheduling";

import EmptyState from "./EmptyState";

/**
 * Goal banner — shows the user's bodyweight trend over the last 4 weeks
 * versus their `profile.weeklyGainLb` target.
 *
 * Acceptance:
 *   - <3 bodyweight points → render an empty-state CTA ("Log 3 weigh-ins…")
 *     instead of the banner. We fall through to the parent's empty-state CTA
 *     stack via the `EmptyState` component.
 *   - Color band based on the gap between actual slope and target:
 *       green  → within ±25% of target
 *       red    → wrong direction (slope sign opposite the target's sign)
 *       yellow → otherwise (right direction, off-pace either way)
 *
 * Method:
 *   - Pull the last 4 weeks of `daily` docs (server-side `where + orderBy`),
 *     keep only entries with a `bodyweightKg` value, run a simple ordinary
 *     least-squares regression on (daysSinceFirstPoint, kg) to get a kg/day
 *     slope, then scale to kg/week and convert to the user's display unit
 *     before comparing to the (display-unit) target.
 *
 *   - We don't bucket by week here — the regression naturally handles uneven
 *     spacing and is more responsive than a 4-point week-average. 4 weeks is
 *     enough to dampen day-to-day noise without lagging behind a real trend.
 */
export interface GoalBannerProps {
  uid: string;
  timezone: string;
  weeklyGainLb: number;
  unitSystem: UnitSystem;
}

type DailyPoint = { localDate: string; bodyweightKg: number };

const WEEKS_BACK = 4;
const DAYS_BACK = WEEKS_BACK * 7;
const MIN_POINTS = 3;
const ON_TARGET_TOLERANCE = 0.25; // ±25%

/**
 * Compute the lower-bound localDate (inclusive) for the trend window — i.e.
 * `today - DAYS_BACK` rendered in the user's tz. Pure string math is brittle,
 * so we go through `Date` arithmetic and then back through `computeLocalDate`
 * to preserve the tz anchor.
 */
function computeWindowStart(timezone: string): string {
  const now = new Date();
  const since = new Date(now.getTime() - DAYS_BACK * 24 * 60 * 60 * 1000);
  return computeLocalDate(since, timezone || "UTC");
}

/**
 * Ordinary least squares slope (kg per day). Returns `null` if fewer than two
 * distinct x-values exist (degenerate regression).
 */
function computeSlopeKgPerDay(points: DailyPoint[]): number | null {
  if (points.length < 2) return null;

  // Parse `YYYY-MM-DD` to a day-index relative to the first point. We treat
  // the date as midnight UTC; the offset is consistent across all points so
  // tz doesn't affect the slope.
  const epoch = Date.parse(`${points[0]!.localDate}T00:00:00Z`);
  if (Number.isNaN(epoch)) return null;

  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of points) {
    const t = Date.parse(`${p.localDate}T00:00:00Z`);
    if (Number.isNaN(t)) continue;
    xs.push((t - epoch) / (24 * 60 * 60 * 1000));
    ys.push(p.bodyweightKg);
  }
  if (xs.length < 2) return null;

  const n = xs.length;
  let sx = 0;
  let sy = 0;
  for (let i = 0; i < n; i++) {
    sx += xs[i]!;
    sy += ys[i]!;
  }
  const mx = sx / n;
  const my = sy / n;

  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    num += dx * (ys[i]! - my);
    den += dx * dx;
  }
  if (den === 0) return null;
  return num / den;
}

/**
 * Pick a color band. Inputs are in the same display unit (lb or kg/week) so
 * direction + magnitude comparisons are direct.
 */
function classifyBand(
  actualPerWeek: number,
  targetPerWeek: number,
): "green" | "yellow" | "red" {
  // Wrong direction: signs disagree (and target is non-zero).
  if (targetPerWeek > 0 && actualPerWeek < 0) return "red";
  if (targetPerWeek < 0 && actualPerWeek > 0) return "red";

  // Special-case a zero target (maintenance): green if |actual| ≤ 25% of an
  // implied 1 lb/wk tolerance, otherwise yellow. We treat any drift as not
  // "wrong direction" because there's no direction to be wrong about.
  if (targetPerWeek === 0) {
    return Math.abs(actualPerWeek) <= 0.25 ? "green" : "yellow";
  }

  const gap = Math.abs(actualPerWeek - targetPerWeek) / Math.abs(targetPerWeek);
  if (gap <= ON_TARGET_TOLERANCE) return "green";
  return "yellow";
}

const BAND_STYLES: Record<
  "green" | "yellow" | "red",
  { border: string; bg: string; text: string; chip: string }
> = {
  green: {
    border: "border-emerald-500/40",
    bg: "bg-emerald-500/10",
    text: "text-emerald-300",
    chip: "bg-emerald-500/20 text-emerald-200",
  },
  yellow: {
    border: "border-amber-500/40",
    bg: "bg-amber-500/10",
    text: "text-amber-300",
    chip: "bg-amber-500/20 text-amber-200",
  },
  red: {
    border: "border-red-500/40",
    bg: "bg-red-500/10",
    text: "text-red-300",
    chip: "bg-red-500/20 text-red-200",
  },
};

export default function GoalBanner({
  uid,
  timezone,
  weeklyGainLb,
  unitSystem,
}: GoalBannerProps) {
  const [points, setPoints] = useState<DailyPoint[] | null>(null);

  const windowStart = useMemo(() => computeWindowStart(timezone), [timezone]);

  useEffect(() => {
    if (!uid) return;
    // Realtime so a new weigh-in flips the banner immediately.
    const q = query(
      dailyCollectionPath(uid),
      where("localDate", ">=", windowStart),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        const next: DailyPoint[] = [];
        snap.docs.forEach((d) => {
          const data = d.data();
          if (typeof data.bodyweightKg === "number") {
            next.push({
              localDate: data.localDate,
              bodyweightKg: data.bodyweightKg,
            });
          }
        });
        setPoints(next);
      },
      () => setPoints([]),
    );
    return () => unsub();
  }, [uid, windowStart]);

  if (points === null) {
    // First paint while subscription is warming up.
    return (
      <div className="rounded-xl border border-border bg-neutral-900/40 px-4 py-3">
        <div className="text-xs font-medium uppercase tracking-wide text-muted">
          Goal
        </div>
        <p className="mt-1 text-sm text-muted">Loading…</p>
      </div>
    );
  }

  if (points.length < MIN_POINTS) {
    return (
      <EmptyState
        title="Track your bodyweight trend"
        description={`Log ${MIN_POINTS} weigh-ins to see your trend vs. your weekly goal.`}
        ctaLabel="Add a weigh-in"
        href="/check-in"
      />
    );
  }

  const slopeKgPerDay = computeSlopeKgPerDay(points);
  if (slopeKgPerDay === null) {
    return (
      <EmptyState
        title="Not enough variation yet"
        description="Log a few more weigh-ins across different days to see a trend."
        ctaLabel="Add a weigh-in"
        href="/check-in"
      />
    );
  }

  const actualKgPerWeek = slopeKgPerDay * 7;
  // Convert both sides to the display unit (lb or kg) so the comparison
  // matches what the user sees on the banner.
  const targetKgPerWeek = lbToKg(weeklyGainLb);
  const actualDisplayPerWeek = kgToDisplay(actualKgPerWeek, unitSystem);
  const targetDisplayPerWeek = kgToDisplay(targetKgPerWeek, unitSystem);
  const unit = weightUnitLabel(unitSystem);

  const band = classifyBand(actualDisplayPerWeek, targetDisplayPerWeek);
  const styles = BAND_STYLES[band];

  const Icon =
    actualDisplayPerWeek > 0
      ? TrendingUp
      : actualDisplayPerWeek < 0
        ? TrendingDown
        : Minus;

  const sign = actualDisplayPerWeek > 0 ? "+" : "";
  const actualLabel = `${sign}${actualDisplayPerWeek.toFixed(2)} ${unit}/wk`;
  const targetSign = targetDisplayPerWeek > 0 ? "+" : "";
  const targetLabel = `${targetSign}${targetDisplayPerWeek.toFixed(2)} ${unit}/wk`;

  const headline =
    band === "green"
      ? "On track"
      : band === "yellow"
        ? actualDisplayPerWeek === 0 ||
          Math.abs(actualDisplayPerWeek) < Math.abs(targetDisplayPerWeek)
          ? "Under pace"
          : "Over pace"
        : "Wrong direction";

  return (
    <section
      aria-label="Bodyweight goal trend"
      className={`rounded-xl border ${styles.border} ${styles.bg} px-4 py-3`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-xs font-medium uppercase tracking-wide text-muted">
            Goal
          </div>
          <div className={`mt-1 flex items-center gap-2 ${styles.text}`}>
            <Icon aria-hidden className="h-4 w-4" />
            <span className="text-sm font-semibold">{headline}</span>
          </div>
          <div className="mt-1 text-xs text-muted">
            Trend {actualLabel} · target {targetLabel}
          </div>
        </div>
        <span
          className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide ${styles.chip}`}
        >
          {band}
        </span>
      </div>
    </section>
  );
}
