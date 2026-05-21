import type { LoggedSet, SessionDoc } from "@/lib/db/types";
import type { RotationView } from "@/lib/workout/scheduling";

/**
 * Pure helpers that crunch already-loaded session data into the numbers shown
 * on the `/workout` landing page (Weekly Progress card + Next Up duration
 * estimate). Nothing here reads Firestore — the page subscribes once and
 * passes arrays in.
 */

export interface WeeklyStats {
  workoutsThisWeek: number;
  workoutsTarget: number;
  volumeThisWeekKg: number;
  volumeLastWeekKg: number;
  /** Percent change vs last week. 0 when last week was 0 (avoid Infinity). */
  volumeDeltaPct: number;
  /** Consecutive-day streak ending today OR yesterday (see streakDays logic). */
  streakDays: number;
}

const DAY_MS = 86_400_000;
const WEEK_MS = 7 * DAY_MS;

/** Pull a JS Date from a Firestore Timestamp-ish value. Tolerates undefined. */
function toDate(ts: unknown): Date | null {
  if (!ts) return null;
  const t = ts as { toDate?: () => Date };
  if (typeof t.toDate === "function") {
    try {
      return t.toDate();
    } catch {
      return null;
    }
  }
  return null;
}

/** Sum of weightKg * reps over non-placeholder sets. Zero-set sessions → 0. */
export function sessionVolumeKg(session: SessionDoc): number {
  const sets = session.sets;
  if (!Array.isArray(sets) || sets.length === 0) return 0;
  let total = 0;
  for (const s of sets as LoggedSet[]) {
    if (s.placeholder) continue;
    const w = Number(s.weightKg);
    const r = Number(s.reps);
    if (!Number.isFinite(w) || !Number.isFinite(r)) continue;
    total += w * r;
  }
  return total;
}

/**
 * Find the Sunday-anchored start of the calendar week containing `date`.
 *
 * Calendar week (Sun..Sat) keeps the math simple and matches what most users
 * expect from a "this week" label. We intentionally don't try to be clever
 * with the user's timezone here — caller passes a Date that's already in the
 * right zone (or accepts the system zone for v1). The week boundary error
 * window is at most a few hours around midnight Saturday/Sunday.
 */
function startOfCalendarWeek(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  const dow = d.getDay(); // 0..6, Sun = 0
  d.setDate(d.getDate() - dow);
  return d;
}

/** YYYY-MM-DD in local tz. Matches what `SessionDoc.localDate` looks like. */
function ymdLocal(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/**
 * Compute the streak ending at OR JUST BEFORE today.
 *
 * Algorithm: build a Set of localDates that have at least one completed
 * session. Start walking from today (offset 0):
 *   - If today has a session, streak starts today. Walk back until a gap.
 *   - Else, if yesterday has a session, streak ended yesterday — still show
 *     its run length (this is the "I lifted hard yesterday, today is a rest
 *     day, my 4-day streak is still alive" case).
 *   - Else, streak = 0.
 */
function computeStreak(
  sessions: SessionDoc[],
  now: Date,
): number {
  const completedDays = new Set<string>();
  for (const s of sessions) {
    if (s.status && s.status !== "completed") continue;
    // Use the session's own localDate, falling back to the server `date`
    // timestamp if absent (legacy/seeded docs).
    let key = s.localDate;
    if (!key) {
      const d = toDate(s.date);
      if (d) key = ymdLocal(d);
    }
    if (key) completedDays.add(key);
  }
  if (completedDays.size === 0) return 0;

  // Decide the anchor: today if it has a session, else yesterday if it does,
  // else streak is 0.
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const todayKey = ymdLocal(today);

  let anchor: Date;
  if (completedDays.has(todayKey)) {
    anchor = today;
  } else {
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    if (completedDays.has(ymdLocal(yesterday))) {
      anchor = yesterday;
    } else {
      return 0;
    }
  }

  // Walk back from the anchor until we find a day with no session.
  let streak = 0;
  const cursor = new Date(anchor);
  // Cap the loop at 365 to avoid runaway in any edge case.
  for (let i = 0; i < 365; i += 1) {
    if (!completedDays.has(ymdLocal(cursor))) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

/**
 * Compute weekly stats from the user's recent sessions.
 *
 * Caller passes whatever sessions they already have loaded; we filter for
 * `completed` and use `startedAt` (falling back to `date`) as the timestamp.
 * Ideally caller passes at least the last ~30 days so the previous-week delta
 * is correct. Smaller windows still work — the delta will just compare against
 * zero.
 */
export function computeWeeklyStats(
  sessions: SessionDoc[],
  options?: { now?: Date; target?: number },
): WeeklyStats {
  const now = options?.now ?? new Date();
  const target = options?.target ?? 4;

  const thisWeekStart = startOfCalendarWeek(now);
  const lastWeekStart = new Date(thisWeekStart.getTime() - WEEK_MS);
  const lastWeekEnd = thisWeekStart;

  let workoutsThisWeek = 0;
  let volumeThisWeekKg = 0;
  let volumeLastWeekKg = 0;

  for (const s of sessions) {
    if (s.status && s.status !== "completed") continue;
    const ts =
      toDate(s.startedAt) ?? toDate(s.finishedAt) ?? toDate(s.date);
    if (!ts) continue;

    if (ts >= thisWeekStart && ts <= now) {
      workoutsThisWeek += 1;
      volumeThisWeekKg += sessionVolumeKg(s);
    } else if (ts >= lastWeekStart && ts < lastWeekEnd) {
      volumeLastWeekKg += sessionVolumeKg(s);
    }
  }

  let volumeDeltaPct = 0;
  if (volumeLastWeekKg > 0) {
    volumeDeltaPct =
      ((volumeThisWeekKg - volumeLastWeekKg) / volumeLastWeekKg) * 100;
  } else if (volumeThisWeekKg > 0) {
    // From-zero growth is undefined as a percentage; show 100% as the
    // user-friendly "all new" indicator rather than Infinity.
    volumeDeltaPct = 100;
  }

  const streakDays = computeStreak(sessions, now);

  return {
    workoutsThisWeek,
    workoutsTarget: target,
    volumeThisWeekKg,
    volumeLastWeekKg,
    volumeDeltaPct,
    streakDays,
  };
}

/**
 * Estimate how long the upcoming session will take.
 *
 * Strategy:
 *   1. Look at the last few completed sessions for the same `programSessionId`
 *      and median their actual durations (finishedAt - startedAt, or the
 *      `durationMin` field if persisted).
 *   2. If we have no history, fall back to `sets * 90s` as a rough heuristic.
 *      The 90s figure assumes ~60s of work + ~30s rest per set, which lands
 *      in the ballpark of typical hypertrophy work.
 */
export function estimateSessionMinutes(
  rotation: RotationView,
  pastSessions: SessionDoc[],
  programSessionId: string,
): number {
  // Find the matching slot to total up planned sets for the fallback path.
  const slot = rotation.slots.find((s) => s.session.id === programSessionId);
  const plannedSetCount = slot
    ? slot.session.exercises.reduce(
        (acc, ex) => acc + Math.max(0, ex.targetSets || 0),
        0,
      )
    : 0;
  const heuristicMin = Math.max(1, Math.round((plannedSetCount * 90) / 60));

  // Pull historical durations for this slot.
  const durations: number[] = [];
  for (const s of pastSessions) {
    if (s.programSessionId !== programSessionId) continue;
    if (s.status && s.status !== "completed") continue;
    if (typeof s.durationMin === "number" && Number.isFinite(s.durationMin)) {
      durations.push(s.durationMin);
      continue;
    }
    const started = toDate(s.startedAt);
    const finished = toDate(s.finishedAt);
    if (started && finished && finished > started) {
      const min = (finished.getTime() - started.getTime()) / 60_000;
      if (min > 0 && min < 600) durations.push(min); // sanity cap 10h
    }
  }

  if (durations.length === 0) {
    return heuristicMin;
  }

  // Median across the last 5 (newest first if input is sorted; we sort here
  // defensively to be order-independent).
  const recent = durations.slice(0, 5).sort((a, b) => a - b);
  const mid = Math.floor(recent.length / 2);
  const median =
    recent.length % 2 === 0
      ? (recent[mid - 1] + recent[mid]) / 2
      : recent[mid];
  return Math.max(1, Math.round(median));
}
