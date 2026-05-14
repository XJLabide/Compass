import type { ProgramDoc, ProgramSession } from "@/lib/db/types";

/**
 * Workout scheduling helpers.
 *
 * v1 schedule mapping is a simple day-of-week round-robin against the active
 * program's `sessions` array. The mapping is intentionally dumb so that the
 * Settings UI can later override it without breaking callers:
 *
 *   Monday    → sessions[0]
 *   Tuesday   → sessions[1]
 *   Wednesday → rest
 *   Thursday  → sessions[2 % len]
 *   Friday    → sessions[3 % len]
 *   Saturday  → rest
 *   Sunday    → rest
 *
 * Rationale:
 *   - 4-day Upper/Lower split aligns with our seeded program (Upper A, Lower A,
 *     Upper B, Lower B), giving a Mon/Tue/Thu/Fri lifting week and three rest
 *     days (Wed/Sat/Sun).
 *   - We use modulo on the session index so a 2- or 3-session program still
 *     produces a sensible rotation, and a 4+-session program never indexes
 *     past the end.
 *
 * `dayOfWeek` is 0..6 with **Sunday = 0** to match `Date#getDay()` so callers
 * can pass `new Date().getDay()` directly (in the user's local timezone — the
 * Date is implicitly localized by the browser).
 */

const SUNDAY = 0;
const MONDAY = 1;
const TUESDAY = 2;
const WEDNESDAY = 3;
const THURSDAY = 4;
const FRIDAY = 5;
const SATURDAY = 6;

/** Default v1 day-of-week → program-session-index mapping. `null` = rest day. */
const DEFAULT_DOW_MAP: Record<number, number | null> = {
  [MONDAY]: 0,
  [TUESDAY]: 1,
  [WEDNESDAY]: null,
  [THURSDAY]: 2,
  [FRIDAY]: 3,
  [SATURDAY]: null,
  [SUNDAY]: null,
};

export type TodayScheduled =
  | { kind: "session"; session: ProgramSession }
  | { kind: "rest" };

/**
 * Resolve today's scheduled program session from the active program and the
 * current day-of-week. Returns `{ kind: "rest" }` when no session is planned
 * for today (rest day, missing program, or empty `sessions[]`).
 *
 * Resolution order:
 *   1. If `program.schedule` is set and has an entry for `dayOfWeek`, honor it
 *      verbatim (session.id lookup, or explicit `null` for rest).
 *   2. Otherwise fall back to the default Mon-Tue-Thu-Fri mapping.
 *
 * @param program Active program doc (or `null` if not loaded yet).
 * @param dayOfWeek 0..6, Sunday = 0 (matches `Date#getDay()`).
 */
export function getTodayScheduled(
  program: ProgramDoc | null,
  dayOfWeek: number,
): TodayScheduled {
  if (!program || program.sessions.length === 0) {
    return { kind: "rest" };
  }

  // 1. Custom schedule path.
  if (program.schedule && Object.prototype.hasOwnProperty.call(program.schedule, String(dayOfWeek))) {
    const slot = program.schedule[String(dayOfWeek)];
    if (slot === null || slot === undefined) return { kind: "rest" };
    const session = program.sessions.find((s) => s.id === slot);
    if (!session) return { kind: "rest" };
    return { kind: "session", session };
  }

  // 2. Default Mon-Tue-Thu-Fri rotation.
  const slot = DEFAULT_DOW_MAP[dayOfWeek];
  if (slot === null || slot === undefined) {
    return { kind: "rest" };
  }
  const session = program.sessions[slot % program.sessions.length];
  if (!session) return { kind: "rest" };
  return { kind: "session", session };
}

/**
 * Compute the user's `YYYY-MM-DD` localDate for a JS Date.
 *
 * Uses `Intl.DateTimeFormat` with `en-CA` (which produces `YYYY-MM-DD`) for a
 * zero-dependency conversion. Falls back to ISO date if the timezone is
 * invalid.
 */
export function computeLocalDate(date: Date, timezone: string): string {
  try {
    const fmt = new Intl.DateTimeFormat("en-CA", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    });
    return fmt.format(date);
  } catch {
    return date.toISOString().slice(0, 10);
  }
}

/**
 * Day-of-week 0..6 (Sunday = 0) for a given Date in a specific timezone.
 *
 * The Date object itself has no timezone, so we format it through Intl to read
 * the weekday in the user's tz, then map to a 0..6 index.
 */
export function getLocalDayOfWeek(date: Date, timezone: string): number {
  try {
    const fmt = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      weekday: "short",
    });
    const wd = fmt.format(date);
    const map: Record<string, number> = {
      Sun: 0,
      Mon: 1,
      Tue: 2,
      Wed: 3,
      Thu: 4,
      Fri: 5,
      Sat: 6,
    };
    return map[wd] ?? date.getDay();
  } catch {
    return date.getDay();
  }
}
