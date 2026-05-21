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
 *   Thursday  → sessions[2] (rest if program has < 3 sessions)
 *   Friday    → sessions[3] (rest if program has < 4 sessions)
 *   Saturday  → rest
 *   Sunday    → rest
 *
 * Rationale:
 *   - 4-day Upper/Lower split aligns with our seeded program (Upper A, Lower A,
 *     Upper B, Lower B), giving a Mon/Tue/Thu/Fri lifting week and three rest
 *     days (Wed/Sat/Sun).
 *   - Slots that exceed the program's session count fall back to rest rather
 *     than wrapping with modulo: wrapping a 2-session program over the 4
 *     lifting slots produced Mon=0, Tue=1, Thu=0, Fri=1 — Mon and Thu would
 *     double-schedule the same session, which surprises users.
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
  // No modulo here: wrapping a 2-session program over the 4 lifting slots
  // produced [Mon=0, Tue=1, Thu=0, Fri=1], so Mon and Thu collapsed onto the
  // same session. Treat overflow slots as rest days so a short program
  // doesn't accidentally double-schedule itself.
  if (slot >= program.sessions.length) {
    return { kind: "rest" };
  }
  const session = program.sessions[slot];
  if (!session) return { kind: "rest" };
  return { kind: "session", session };
}

// ---------------------------------------------------------------------------
// Rotation-based scheduling (v2)
// ---------------------------------------------------------------------------

export interface RotationSlot {
  session: ProgramSession;
  /** ms since last completed; null if never done */
  msSinceLast: number | null;
}

export interface RotationView {
  /** The next session to do. Null only if the program has zero sessions. */
  next: ProgramSession | null;
  /** All slots, sorted oldest-completed-first (next at index 0). */
  slots: RotationSlot[];
}

/**
 * Pick the next program session to do based on what hasn't been done in the
 * longest. Never-completed sessions sort to the top in `program.sessions`
 * order. Ties between completed sessions broken by `program.sessions` order.
 *
 * @param program Active program doc (or `null` if not loaded yet).
 * @param lastCompletedBySlot Map of programSessionId → most recent completed Date.
 * @param now Reference "now" (defaults to `new Date()`).
 */
export function getRotationView(
  program: ProgramDoc | null,
  lastCompletedBySlot: Map<string, Date>,
  now: Date = new Date(),
): RotationView {
  if (!program || program.sessions.length === 0) {
    return { next: null, slots: [] };
  }

  const slots: RotationSlot[] = program.sessions.map((session) => {
    const last = lastCompletedBySlot.get(session.id);
    return {
      session,
      msSinceLast: last != null ? now.getTime() - last.getTime() : null,
    };
  });

  // Sort: never-done (null) first (stable in program order), then by oldest
  // completion (largest msSinceLast first), ties fall back to program order.
  const sorted = [...slots].sort((a, b) => {
    const aNever = a.msSinceLast === null;
    const bNever = b.msSinceLast === null;
    if (aNever && bNever) return 0; // preserve program order
    if (aNever) return -1;
    if (bNever) return 1;
    // Both completed — oldest first (larger msSinceLast first).
    return (b.msSinceLast as number) - (a.msSinceLast as number);
  });

  return {
    next: sorted[0]?.session ?? null,
    slots: sorted,
  };
}

/**
 * Format milliseconds-since-last into a human label.
 *   0 → "today"
 *   1 day → "yesterday"
 *   N days → "{N} days"
 */
export function formatMsSince(ms: number): string {
  const days = Math.floor(ms / 86_400_000);
  if (days === 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days`;
}

/**
 * Build the rotation caption shown under the session name on the workout index.
 *
 * Format: "Lower A: yesterday · Upper A: 3 days · never: Upper B, Lower B"
 * At most 4 slots shown. If all never-done: "Pick anything — nothing logged yet".
 */
export function buildRotationCaption(slots: RotationSlot[]): string {
  const MAX = 4;
  const shown = slots.slice(0, MAX);

  const completedParts: string[] = [];
  const neverNames: string[] = [];

  for (const slot of shown) {
    if (slot.msSinceLast === null) {
      neverNames.push(slot.session.name);
    } else {
      completedParts.push(
        `${slot.session.name}: ${formatMsSince(slot.msSinceLast)}`,
      );
    }
  }

  if (completedParts.length === 0) {
    return "Pick anything — nothing logged yet";
  }

  const parts = [...completedParts];
  if (neverNames.length > 0) {
    parts.push(`never: ${neverNames.join(", ")}`);
  }
  return parts.join(" · ");
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
