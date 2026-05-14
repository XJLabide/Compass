import type { RoutineDoc } from "@/lib/db/types";

/** ISO weekday labels, Sunday-first (matches JS Date.getDay() values 0..6). */
export const DOW_LABELS = ["S", "M", "T", "W", "T", "F", "S"] as const;
export const DOW_FULL = [
  "Sun",
  "Mon",
  "Tue",
  "Wed",
  "Thu",
  "Fri",
  "Sat",
] as const;

/** Convenience presets the UI exposes as one-tap shortcuts. */
export const DOW_PRESETS: {
  daily: number[];
  weekdays: number[];
  weekends: number[];
} = {
  daily: [0, 1, 2, 3, 4, 5, 6],
  weekdays: [1, 2, 3, 4, 5],
  weekends: [0, 6],
};

/**
 * Add `delta` whole days to a YYYY-MM-DD string. Returns the original string
 * if parsing fails. Operates in UTC, which is fine because we only ever apply
 * full-day offsets to localDate strings (the tz anchor is implicit).
 */
export function addDaysIso(iso: string, delta: number): string {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return iso;
  return new Date(t + delta * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);
}

/** Day-of-week (0..6) for a YYYY-MM-DD string. */
export function dowOfIso(iso: string): number {
  const t = Date.parse(`${iso}T00:00:00Z`);
  if (Number.isNaN(t)) return 0;
  return new Date(t).getUTCDay();
}

/**
 * Streak rule: walk backwards from `today`. For each scheduled day, if it's
 * checked off, increment the streak; if not, break. Non-scheduled days are
 * skipped (they don't extend or break the streak). This matches user
 * expectation for Mon/Wed/Fri-style routines.
 *
 * The walk also skips `today` itself if today isn't scheduled OR today is
 * scheduled-but-not-yet-done. Reason: the day's still in progress; we don't
 * want a "yesterday was great" streak to look broken because today is open.
 */
export function computeStreak(
  routine: Pick<RoutineDoc, "weekdays" | "done">,
  today: string,
): number {
  const schedule = new Set(routine.weekdays);
  if (schedule.size === 0) return 0;

  // Decide where to start. If today is scheduled AND done, count today.
  // Otherwise, start at yesterday.
  let cursor = today;
  if (schedule.has(dowOfIso(today)) && !routine.done?.[today]) {
    cursor = addDaysIso(today, -1);
  }

  let streak = 0;
  // Hard cap on the backward walk so a degenerate input doesn't loop forever.
  const HARD_CAP = 365 * 5;
  for (let i = 0; i < HARD_CAP; i++) {
    if (schedule.has(dowOfIso(cursor))) {
      if (routine.done?.[cursor]) {
        streak += 1;
      } else {
        break;
      }
    }
    cursor = addDaysIso(cursor, -1);
  }
  return streak;
}

/** Longest consecutive run of scheduled+done days across the routine's life. */
export function computeBestStreak(
  routine: Pick<RoutineDoc, "weekdays" | "done">,
): number {
  const schedule = new Set(routine.weekdays);
  const dates = Object.keys(routine.done ?? {})
    .filter((d) => routine.done![d])
    .sort();
  if (dates.length === 0 || schedule.size === 0) return 0;

  // Walk from the earliest done date to today, counting consecutive
  // scheduled days where done is true.
  let best = 0;
  let run = 0;
  let cursor = dates[0];
  const last = dates[dates.length - 1];
  const HARD_CAP = 365 * 10;
  for (let i = 0; i < HARD_CAP; i++) {
    if (schedule.has(dowOfIso(cursor))) {
      if (routine.done?.[cursor]) {
        run += 1;
        if (run > best) best = run;
      } else {
        run = 0;
      }
    }
    if (cursor === last) break;
    cursor = addDaysIso(cursor, 1);
  }
  return best;
}

/**
 * Build an N-day strip of {date, scheduled, done} entries ending at `today`.
 * Used by the routine card's 28-day heatmap.
 */
export interface DayCell {
  date: string;
  scheduled: boolean;
  done: boolean;
  isToday: boolean;
}

export function buildHeatmap(
  routine: Pick<RoutineDoc, "weekdays" | "done">,
  today: string,
  days: number,
): DayCell[] {
  const schedule = new Set(routine.weekdays);
  const out: DayCell[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = addDaysIso(today, -i);
    const scheduled = schedule.has(dowOfIso(date));
    out.push({
      date,
      scheduled,
      done: Boolean(routine.done?.[date]),
      isToday: date === today,
    });
  }
  return out;
}

/** Compact "Mon · Wed · Fri" string for the routine card subtitle. */
export function formatSchedule(weekdays: number[]): string {
  if (weekdays.length === 7) return "Every day";
  if (
    weekdays.length === 5 &&
    [1, 2, 3, 4, 5].every((d) => weekdays.includes(d))
  ) {
    return "Weekdays";
  }
  if (
    weekdays.length === 2 &&
    weekdays.includes(0) &&
    weekdays.includes(6)
  ) {
    return "Weekends";
  }
  const sorted = [...weekdays].sort((a, b) => {
    // Display Mon-first for readability: shift Sunday to the end.
    const aa = a === 0 ? 7 : a;
    const bb = b === 0 ? 7 : b;
    return aa - bb;
  });
  return sorted.map((d) => DOW_FULL[d]).join(" · ");
}
