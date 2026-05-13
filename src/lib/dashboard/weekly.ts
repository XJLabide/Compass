import type { DailyDoc, LocalDate, SessionDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";

/**
 * Weekly bucketing + counters for the dashboard "This week" card.
 *
 * Week starts **Monday** in the user's profile timezone (matches the project
 * spec; ISO-style week, not US Sunday-anchored). We bucket by `localDate`
 * strings (`YYYY-MM-DD`) so we never need to thread the user's `Date` through
 * tz math twice — the daily/session docs already carry a tz-correct
 * `localDate`.
 *
 * All comparisons are string compares against `YYYY-MM-DD`, which is
 * lexicographically equivalent to date order for ISO strings.
 */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

export interface WeekWindow {
  /** Inclusive Monday of the current week, `YYYY-MM-DD` in user tz. */
  startLocalDate: LocalDate;
  /** Inclusive Sunday of the current week. */
  endLocalDate: LocalDate;
  /** Inclusive Monday of the previous week (for delta vs. last week). */
  prevStartLocalDate: LocalDate;
  /** Inclusive Sunday of the previous week. */
  prevEndLocalDate: LocalDate;
}

/**
 * Compute the Monday-anchored week window (current + previous) for `now` in
 * the user's IANA timezone. Falls back to UTC if the tz is invalid (matches
 * `computeLocalDate`'s contract).
 *
 * We compute weekday in the user's tz, then walk back `(weekday - 1 mod 7)`
 * days to land on Monday. Subsequent boundaries are pure UTC-midnight Date
 * arithmetic — safe because we only ever re-format through `computeLocalDate`
 * which re-anchors to the tz.
 */
export function getWeekWindow(now: Date, timezone: string): WeekWindow {
  // Weekday in tz, where Mon=1..Sun=7 (we want Monday-anchored).
  const weekdayIso = getIsoWeekday(now, timezone);
  // Days since Monday: Mon=0..Sun=6.
  const daysSinceMonday = weekdayIso - 1;

  const monday = new Date(now.getTime() - daysSinceMonday * MS_PER_DAY);
  const sunday = new Date(monday.getTime() + 6 * MS_PER_DAY);
  const prevMonday = new Date(monday.getTime() - 7 * MS_PER_DAY);
  const prevSunday = new Date(monday.getTime() - 1 * MS_PER_DAY);

  return {
    startLocalDate: computeLocalDate(monday, timezone || "UTC"),
    endLocalDate: computeLocalDate(sunday, timezone || "UTC"),
    prevStartLocalDate: computeLocalDate(prevMonday, timezone || "UTC"),
    prevEndLocalDate: computeLocalDate(prevSunday, timezone || "UTC"),
  };
}

/**
 * ISO weekday 1..7 (Mon=1, Sun=7) for a Date in the given timezone.
 * Internally piggy-backs on `Intl.DateTimeFormat` since plain `Date#getDay()`
 * doesn't respect the user's tz.
 */
export function getIsoWeekday(date: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone || "UTC",
      weekday: "short",
    });
    const wd = fmt.format(date);
    const map: Record<string, number> = {
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
      Sun: 7,
    };
    return map[wd] ?? 1;
  } catch {
    // Fallback: JS Date getDay (Sun=0..Sat=6) → ISO (Mon=1..Sun=7).
    const d = date.getDay();
    return d === 0 ? 7 : d;
  }
}

/** True if `localDate` (YYYY-MM-DD) is within `[start, end]` inclusive. */
export function isWithinWeek(
  localDate: LocalDate,
  start: LocalDate,
  end: LocalDate,
): boolean {
  return localDate >= start && localDate <= end;
}

// ---------------------------------------------------------------------------
// Counters
// ---------------------------------------------------------------------------

/**
 * Count completed sessions in `[start, end]`. We filter on `status` so that
 * `in_progress` and `discarded` sessions don't inflate the count. Legacy docs
 * without a `status` field are treated as completed (matches the project's
 * back-compat convention).
 */
export function countWorkoutsDone(
  sessions: readonly SessionDoc[],
  start: LocalDate,
  end: LocalDate,
): number {
  let n = 0;
  for (const s of sessions) {
    if (!isWithinWeek(s.localDate, start, end)) continue;
    if (s.status === undefined || s.status === "completed") n++;
  }
  return n;
}

/**
 * Average a numeric field across the docs in `[start, end]` that have it
 * defined. Returns `null` when no doc has the field (so the UI can render
 * "—" instead of "0", per spec).
 */
export function avgDailyField(
  daily: readonly DailyDoc[],
  field: "proteinG" | "sleepHours",
  start: LocalDate,
  end: LocalDate,
): number | null {
  let sum = 0;
  let n = 0;
  for (const d of daily) {
    if (!isWithinWeek(d.localDate, start, end)) continue;
    const v = d[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * Mean bodyweight (kg) across the docs in `[start, end]`. Returns `null` when
 * no weigh-in exists in the window — callers render "—".
 */
export function avgBodyweightKg(
  daily: readonly DailyDoc[],
  start: LocalDate,
  end: LocalDate,
): number | null {
  return avgNumericField(daily, "bodyweightKg", start, end);
}

function avgNumericField<K extends keyof DailyDoc>(
  daily: readonly DailyDoc[],
  field: K,
  start: LocalDate,
  end: LocalDate,
): number | null {
  let sum = 0;
  let n = 0;
  for (const d of daily) {
    if (!isWithinWeek(d.localDate, start, end)) continue;
    const v = d[field];
    if (typeof v === "number" && Number.isFinite(v)) {
      sum += v;
      n++;
    }
  }
  return n === 0 ? null : sum / n;
}

/**
 * Weight delta (kg) = mean(this week) − mean(last week). Returns `null` if
 * either week has zero weigh-ins, so the UI renders "—". Using means rather
 * than first/last data points smooths out single-day noise.
 */
export function weightDeltaKg(
  daily: readonly DailyDoc[],
  window: WeekWindow,
): number | null {
  const cur = avgBodyweightKg(daily, window.startLocalDate, window.endLocalDate);
  const prev = avgBodyweightKg(
    daily,
    window.prevStartLocalDate,
    window.prevEndLocalDate,
  );
  if (cur === null || prev === null) return null;
  return cur - prev;
}
