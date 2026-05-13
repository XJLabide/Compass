"use client";

import { useMemo, type ChangeEvent } from "react";

/**
 * Backfill date picker.
 *
 * Uses a native `<input type="date">` to keep v1 dependency-free and to inherit
 * each platform's preferred picker UX (iOS wheel, Android calendar, desktop
 * popover).
 *
 * The picker enforces the 7-day backfill window via the `min`/`max` attributes
 * and a parallel JS guard in `onPick`:
 *   - Modern mobile browsers honor `min`/`max` and won't let the user commit
 *     an out-of-range value at all, so this is the primary defense.
 *   - Desktop browsers (and older mobile) allow typing any date directly. For
 *     those, `onPick` detects the out-of-range case and surfaces it as a
 *     "read-only — use History" notice instead of silently navigating.
 *
 * `today` and `min` are passed in by the parent so the component stays a pure
 * presenter — the parent already owns the timezone-aware "today" computation.
 */
export interface DatePickerProps {
  /** Current selection, `YYYY-MM-DD` in the user's local tz. */
  value: string;
  /** Today's `YYYY-MM-DD` in the user's local tz. Acts as `max`. */
  today: string;
  /** Inclusive lower bound (`today` minus 6 days) so the window is 7 days total. */
  min: string;
  /**
   * Called with the next value when the user picks an in-window date. The
   * parent is responsible for actually routing / loading that day.
   */
  onPick: (next: string) => void;
  /**
   * Called when the user picks an out-of-window date. Parent surfaces this as
   * a "Read-only - use History" message and does NOT change the active doc.
   */
  onOutOfRange?: (attempted: string) => void;
  id?: string;
}

/** Number of days the picker allows backfilling (inclusive of today). */
export const BACKFILL_WINDOW_DAYS = 7;

/**
 * Shift a `YYYY-MM-DD` string by `days` (positive or negative) without going
 * through `Date` arithmetic (which would re-introduce DST/tz drift).
 *
 * We parse the three integer parts, use UTC math to step the day, and re-emit
 * `YYYY-MM-DD`. This keeps the function pure and tz-free; callers have already
 * resolved the "today" anchor in the user's tz.
 */
export function shiftLocalDate(localDate: string, days: number): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(localDate);
  if (!m) return localDate;
  const [, y, mo, d] = m;
  const ms = Date.UTC(Number(y), Number(mo) - 1, Number(d));
  const shifted = new Date(ms + days * 86_400_000);
  const yy = shifted.getUTCFullYear();
  const mm = String(shifted.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(shifted.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

/** Compute the `min` bound for a backfill window anchored at `today`. */
export function backfillMinDate(today: string): string {
  return shiftLocalDate(today, -(BACKFILL_WINDOW_DAYS - 1));
}

/**
 * Returns true if `date` is within the inclusive `[min, today]` window using
 * lexicographic comparison (safe because both are `YYYY-MM-DD`).
 */
export function isWithinBackfillWindow(
  date: string,
  today: string,
  min: string,
): boolean {
  return date >= min && date <= today;
}

export default function DatePicker({
  value,
  today,
  min,
  onPick,
  onOutOfRange,
  id = "checkin-date",
}: DatePickerProps) {
  const helper = useMemo(() => {
    if (value === today) return "Today";
    if (!isWithinBackfillWindow(value, today, min)) {
      return "Read-only — use History";
    }
    return "Backfilling";
  }, [value, today, min]);

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    const next = e.target.value;
    if (!next) return;
    if (isWithinBackfillWindow(next, today, min)) {
      onPick(next);
    } else {
      onOutOfRange?.(next);
    }
  };

  return (
    <div>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between text-sm font-medium text-neutral-200"
      >
        <span>Date</span>
        <span className="text-xs text-muted">{helper}</span>
      </label>
      <input
        id={id}
        type="date"
        value={value}
        min={min}
        max={today}
        onChange={handleChange}
        className="mt-2 block h-11 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
      />
    </div>
  );
}
