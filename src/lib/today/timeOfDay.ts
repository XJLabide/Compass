/**
 * Time-of-day helpers for the /today page.
 *
 * Day blocks:
 *   - Morning : 04:00 - 12:00
 *   - Midday  : 12:00 - 17:00
 *   - Evening : 17:00 - 21:00
 *   - Night   : 21:00 - 04:00
 *
 * "Awake time" is the window between the user's wake and bed times on the
 * same calendar day, in their timezone. Both default to 07:00 / 23:00 but
 * are overridable via `Profile.wakeTime` / `Profile.bedTime` ("HH:MM").
 */
export type DayBlock = "morning" | "midday" | "evening" | "night";

export const DEFAULT_WAKE_TIME = "07:00";
export const DEFAULT_BED_TIME = "23:00";

/** Localized hour (0..23) for a given Date in a specific tz. */
function localHour(date: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      hour: "2-digit",
      hour12: false,
    });
    return Number(fmt.format(date));
  } catch {
    return date.getHours();
  }
}

/** Localized minute (0..59) for a given Date in a specific tz. */
function localMinute(date: Date, tz: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-GB", {
      timeZone: tz,
      minute: "2-digit",
    });
    return Number(fmt.format(date));
  } catch {
    return date.getMinutes();
  }
}

/** Parse `"HH:MM"` to total minutes-from-midnight. Bad input falls back to a default. */
export function parseTimeToMinutes(
  value: string | undefined,
  fallback: string,
): number {
  const v = (value ?? fallback).trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(v);
  if (!m) return parseTimeToMinutes(fallback, "00:00");
  const h = Math.max(0, Math.min(23, Number(m[1])));
  const mm = Math.max(0, Math.min(59, Number(m[2])));
  return h * 60 + mm;
}

export function getDayBlock(now: Date, tz: string): DayBlock {
  const h = localHour(now, tz);
  if (h >= 4 && h < 12) return "morning";
  if (h >= 12 && h < 17) return "midday";
  if (h >= 17 && h < 21) return "evening";
  return "night";
}

export function dayBlockLabel(block: DayBlock): string {
  switch (block) {
    case "morning":
      return "Morning";
    case "midday":
      return "Midday";
    case "evening":
      return "Evening";
    case "night":
      return "Night";
  }
}

export function dayBlockSubtitle(block: DayBlock): string {
  switch (block) {
    case "morning":
      return "Start strong";
    case "midday":
      return "Keep moving";
    case "evening":
      return "Wind down";
    case "night":
      return "Rest up";
  }
}

export interface AwakeProgress {
  /** Fraction 0..1 of the awake window already elapsed. */
  pct: number;
  /** Remaining minutes until bedtime; 0 if we're past it. */
  minutesLeft: number;
  /** "11h 17m of awake time left" — formatted for display. */
  remainingLabel: string;
  /** True if the current time falls outside the awake window. */
  asleep: boolean;
}

/**
 * Compute progress through the user's awake window. Wake and bed times are
 * "HH:MM" strings; both default to 07:00 / 23:00 when not provided. The
 * function gracefully handles a `bedTime` earlier in the clock than `wakeTime`
 * (e.g. wake 23:00, bed 07:00 — night-shift workers) by treating it as a
 * window crossing midnight.
 */
export function getAwakeProgress(
  now: Date,
  tz: string,
  options?: { wakeTime?: string; bedTime?: string },
): AwakeProgress {
  const h = localHour(now, tz);
  const m = localMinute(now, tz);
  const minutesNow = h * 60 + m;

  const wakeMinutes = parseTimeToMinutes(options?.wakeTime, DEFAULT_WAKE_TIME);
  const bedMinutes = parseTimeToMinutes(options?.bedTime, DEFAULT_BED_TIME);

  // Standard case: bed > wake (e.g. 07:00 → 23:00 on the same day).
  if (bedMinutes > wakeMinutes) {
    if (minutesNow < wakeMinutes || minutesNow >= bedMinutes) {
      return {
        pct: minutesNow >= bedMinutes ? 1 : 0,
        minutesLeft: 0,
        remainingLabel: "Wind down time",
        asleep: true,
      };
    }
    const elapsed = minutesNow - wakeMinutes;
    const window = bedMinutes - wakeMinutes;
    return formatProgress(elapsed, window);
  }

  // Crossing midnight: wake > bed (e.g. 23:00 → 07:00).
  // Awake from `wake` until midnight, then from midnight until `bed`.
  const window = 24 * 60 - wakeMinutes + bedMinutes;
  if (minutesNow >= wakeMinutes) {
    const elapsed = minutesNow - wakeMinutes;
    return formatProgress(elapsed, window);
  }
  if (minutesNow < bedMinutes) {
    const elapsed = 24 * 60 - wakeMinutes + minutesNow;
    return formatProgress(elapsed, window);
  }
  return {
    pct: 0,
    minutesLeft: 0,
    remainingLabel: "Wind down time",
    asleep: true,
  };
}

function formatProgress(elapsed: number, window: number): AwakeProgress {
  const minutesLeft = Math.max(0, window - elapsed);
  const pct = Math.max(0, Math.min(1, elapsed / window));
  const hours = Math.floor(minutesLeft / 60);
  const mins = minutesLeft % 60;
  const remainingLabel =
    hours > 0
      ? `${hours}h ${mins}m of awake time left`
      : `${mins}m of awake time left`;
  return { pct, minutesLeft, remainingLabel, asleep: false };
}
