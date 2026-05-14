/**
 * Time-of-day helpers for the /today page.
 *
 * Day blocks:
 *   - Morning : 04:00 - 12:00
 *   - Midday  : 12:00 - 17:00
 *   - Evening : 17:00 - 21:00
 *   - Night   : 21:00 - 04:00
 *
 * "Awake time" is the window between WAKE and BEDTIME on the same calendar
 * day, in the user's timezone. Defaults: wake 07:00, bed 23:00. We use these
 * to drive the progress bar and the "Xh Ym of awake time left" string.
 */
export type DayBlock = "morning" | "midday" | "evening" | "night";

const WAKE_HOUR = 7;
const BED_HOUR = 23;

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
 * Compute progress through the user's awake window (default 07:00 → 23:00).
 * Tz-aware so a user in Manila gets the right local hour.
 */
export function getAwakeProgress(now: Date, tz: string): AwakeProgress {
  const h = localHour(now, tz);
  const m = localMinute(now, tz);
  const totalMinutes = h * 60 + m;

  const wakeMinutes = WAKE_HOUR * 60;
  const bedMinutes = BED_HOUR * 60;
  const windowMinutes = bedMinutes - wakeMinutes;

  if (totalMinutes < wakeMinutes || totalMinutes >= bedMinutes) {
    return {
      pct: totalMinutes >= bedMinutes ? 1 : 0,
      minutesLeft: 0,
      remainingLabel: "Wind down time",
      asleep: true,
    };
  }

  const elapsed = totalMinutes - wakeMinutes;
  const minutesLeft = windowMinutes - elapsed;
  const pct = Math.max(0, Math.min(1, elapsed / windowMinutes));

  const hours = Math.floor(minutesLeft / 60);
  const mins = minutesLeft % 60;
  const remainingLabel =
    hours > 0
      ? `${hours}h ${mins}m of awake time left`
      : `${mins}m of awake time left`;

  return { pct, minutesLeft, remainingLabel, asleep: false };
}
