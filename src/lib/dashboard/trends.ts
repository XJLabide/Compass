import type { DailyDoc, LocalDate, SessionDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import { getIsoWeekday } from "@/lib/dashboard/weekly";

/**
 * Trend aggregation helpers for the dashboard Trends section.
 *
 * Produces 8-week-windowed series for the four mini line charts:
 *   - bodyweight (per weigh-in, in canonical kg)
 *   - weekly training volume (sum of weight*reps per session, summed per week)
 *   - protein daily average (g/day per logged day)
 *   - sleep daily average (h/day per logged day)
 *
 * All series are returned in chronological order. Empty/missing days are
 * simply absent — the caller renders an empty-state when the count is <3.
 *
 * The 8-week window starts at the Monday 7 weeks before the Monday of the
 * week containing `now`, inclusive, in the user's IANA timezone. That gives
 * 8 ISO weeks total ending with the current week.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface TrendPoint {
  /** ISO `YYYY-MM-DD`. For weekly series this is the Monday of the bucket. */
  localDate: LocalDate;
  /** Numeric value in canonical units (kg, kg*reps total, g, h). */
  value: number;
}

export interface TrendsWindow {
  /** Monday of the first week in the 8-week window (inclusive). */
  startLocalDate: LocalDate;
  /** Sunday of the current week (inclusive). */
  endLocalDate: LocalDate;
  /** The 8 week-start Mondays in chronological order, for bucketing. */
  weekStarts: LocalDate[];
}

/**
 * Compute the 8-week window for `now` in `timezone`. Mirrors the Mon-anchored
 * scheme used by `weekly.ts` so the Trends section lines up with the This
 * Week card.
 */
export function getTrendsWindow(now: Date, timezone: string): TrendsWindow {
  const tz = timezone || "UTC";
  const weekdayIso = getIsoWeekday(now, tz);
  const daysSinceMonday = weekdayIso - 1;
  const monday = new Date(now.getTime() - daysSinceMonday * MS_PER_DAY);
  // 7 weeks back inclusive → 8-week window.
  const startMonday = new Date(monday.getTime() - 7 * 7 * MS_PER_DAY);
  const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);

  const weekStarts: LocalDate[] = [];
  for (let i = 0; i < 8; i++) {
    const wkMon = new Date(startMonday.getTime() + i * 7 * MS_PER_DAY);
    weekStarts.push(computeLocalDate(wkMon, tz));
  }

  return {
    startLocalDate: computeLocalDate(startMonday, tz),
    endLocalDate: computeLocalDate(sunday, tz),
    weekStarts,
  };
}

/**
 * Bodyweight series — one point per `daily` doc within the window that has a
 * `bodyweightKg` field. Sorted ascending by `localDate`.
 */
export function buildBodyweightSeries(
  daily: readonly DailyDoc[],
  window: TrendsWindow,
): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const d of daily) {
    if (d.localDate < window.startLocalDate || d.localDate > window.endLocalDate) {
      continue;
    }
    if (typeof d.bodyweightKg === "number" && Number.isFinite(d.bodyweightKg)) {
      out.push({ localDate: d.localDate, value: d.bodyweightKg });
    }
  }
  out.sort((a, b) => a.localDate.localeCompare(b.localDate));
  return out;
}

/**
 * Daily-average series for a numeric field (protein g, sleep h). One point
 * per day that has the field present. Sessions with multiple writes per day
 * are already collapsed by the `daily/{YYYY-MM-DD}` single-doc layout, so we
 * just project the field through.
 */
export function buildDailyAvgSeries(
  daily: readonly DailyDoc[],
  field: "proteinG" | "sleepHours",
  window: TrendsWindow,
): TrendPoint[] {
  const out: TrendPoint[] = [];
  for (const d of daily) {
    if (d.localDate < window.startLocalDate || d.localDate > window.endLocalDate) {
      continue;
    }
    const v = d[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      out.push({ localDate: d.localDate, value: v });
    }
  }
  out.sort((a, b) => a.localDate.localeCompare(b.localDate));
  return out;
}

/**
 * Volume per session = sum(set.weightKg * set.reps). Only counts completed
 * (or legacy status-less) sessions. Discarded/in-progress sessions are
 * skipped so partial logs don't bias the chart.
 */
export function sessionVolumeKg(session: SessionDoc): number {
  let total = 0;
  for (const s of session.sets) {
    const w = s.weightKg;
    const r = s.reps;
    if (
      typeof w === "number" &&
      typeof r === "number" &&
      Number.isFinite(w) &&
      Number.isFinite(r)
    ) {
      total += w * r;
    }
  }
  return total;
}

/**
 * Weekly training-volume series. Each point is the Monday of an ISO week and
 * the summed volume of all completed sessions in that week. Weeks with no
 * sessions are omitted (so the empty-state heuristic can fire correctly).
 */
export function buildWeeklyVolumeSeries(
  sessions: readonly SessionDoc[],
  window: TrendsWindow,
): TrendPoint[] {
  // Map of weekStart -> volume. We pre-fill nothing — only weeks with at
  // least one session show up.
  const bucket = new Map<LocalDate, number>();
  for (const s of sessions) {
    if (s.localDate < window.startLocalDate || s.localDate > window.endLocalDate) {
      continue;
    }
    if (s.status !== undefined && s.status !== "completed") continue;
    const wkStart = weekStartFor(s.localDate, window.weekStarts);
    if (!wkStart) continue;
    const vol = sessionVolumeKg(s);
    bucket.set(wkStart, (bucket.get(wkStart) ?? 0) + vol);
  }
  const out: TrendPoint[] = [];
  for (const wk of window.weekStarts) {
    const v = bucket.get(wk);
    if (v !== undefined && v > 0) {
      out.push({ localDate: wk, value: v });
    }
  }
  return out;
}

/**
 * Find the week-start (Monday) that `localDate` falls into, given the
 * window's pre-computed weekStarts. Linear scan over 8 entries.
 */
function weekStartFor(
  localDate: LocalDate,
  weekStarts: readonly LocalDate[],
): LocalDate | null {
  // weekStarts is ascending. The bucket is `[weekStarts[i], weekStarts[i+1])`,
  // with the last bucket open to the end of the window.
  for (let i = weekStarts.length - 1; i >= 0; i--) {
    if (localDate >= weekStarts[i]) return weekStarts[i];
  }
  return null;
}
