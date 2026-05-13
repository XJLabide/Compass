import {
  getDocs,
  limit,
  orderBy,
  query,
  where,
} from "firebase/firestore";

import { sessionsPath } from "@/lib/db/paths";
import type { LoggedSet, SessionDoc } from "@/lib/db/types";

/**
 * Cross-session prefill source.
 *
 * For each planned exercise in the active session, we want to surface the
 * lifter's previous heaviest set of THAT exercise from the most recent
 * **completed** session of the same `programSessionId` slot. This is the
 * "last time you did Upper A, you hit 102.5 kg x 8" hint.
 *
 * Per the task spec (fn-4-p9x.3), this is the lookup contract:
 *
 *   query(sessions, where('programSessionId', '==', slotId),
 *                   where('status',           '==', 'completed'),
 *                   orderBy('startedAt', 'desc'), limit(1))
 *
 * The single result is the source-of-truth "previous session" for the slot.
 * From that session we then pick the **heaviest** set per exerciseId (ties
 * broken by reps, then RPE). We deliberately do NOT pull the heaviest set
 * across all-time history — the lifter wants "what did I do LAST TIME on this
 * day", not "all time best".
 *
 * Returned shape is a `Map<exerciseId, { weightKg, reps, rpe? }>` so callers
 * can do a single O(1) lookup per planned exercise in their render loop.
 *
 * Edge cases:
 *   - No prior completed session for this slot → returns empty map.
 *   - Prior session exists but has no sets for some exerciseId (e.g. user
 *     skipped it last time) → no entry for that exerciseId; caller falls back
 *     to the planned rep-range default.
 *   - This is a "find the previous one once" lookup; we do not subscribe to
 *     historical sessions. The caller invokes once per mount of the logger.
 */

export interface PrefillEntry {
  weightKg: number;
  reps: number;
  rpe?: number;
}

export type PrefillMap = Map<string, PrefillEntry>;

/**
 * Fetch the most-recent completed session for the given program slot and
 * return a map of `exerciseId -> heaviest set`. Caller should treat this as
 * a one-shot lookup (mount-time fetch), not a live subscription.
 *
 * If `programSessionId` is empty/undefined the function returns an empty map
 * immediately — free-form sessions have no slot to look back on.
 *
 * Excludes `excludeSessionId` from the query result (the currently-active
 * session, which itself may be `completed` after a re-open; we never want a
 * session to prefill from itself).
 */
export async function loadLastSessionPrefill(
  uid: string,
  programSessionId: string | undefined,
  excludeSessionId?: string,
): Promise<PrefillMap> {
  const empty: PrefillMap = new Map();
  if (!uid || !programSessionId) return empty;

  const q = query(
    sessionsPath(uid),
    where("programSessionId", "==", programSessionId),
    where("status", "==", "completed"),
    orderBy("startedAt", "desc"),
    // Fetch 2 so we can skip the active session id if it happens to be the
    // most-recent "completed" result (race after finishing then re-opening).
    limit(2),
  );

  const snap = await getDocs(q);
  if (snap.empty) return empty;

  const previous = snap.docs.find((d) => d.id !== excludeSessionId);
  if (!previous) return empty;

  return heaviestSetByExercise(previous.data().sets ?? []);
}

/**
 * Pure helper — given a flat `sets[]` array, returns a map from
 * `exerciseId` to the heaviest single set for that exercise.
 *
 * "Heaviest" = max `weightKg`. Ties broken by higher `reps`, then higher
 * `rpe` (so a 100x8 beats a 100x6, and a 100x8@9 beats a 100x8@7). RPE is
 * optional; missing RPE sorts as -Infinity.
 *
 * Exported separately because it's trivially unit-testable in isolation.
 */
export function heaviestSetByExercise(sets: LoggedSet[]): PrefillMap {
  const out: PrefillMap = new Map();
  for (const s of sets) {
    const incumbent = out.get(s.exerciseId);
    if (!incumbent || isHeavier(s, incumbent)) {
      out.set(s.exerciseId, {
        weightKg: s.weightKg,
        reps: s.reps,
        ...(typeof s.rpe === "number" ? { rpe: s.rpe } : {}),
      });
    }
  }
  return out;
}

function isHeavier(candidate: LoggedSet, incumbent: PrefillEntry): boolean {
  if (candidate.weightKg !== incumbent.weightKg) {
    return candidate.weightKg > incumbent.weightKg;
  }
  if (candidate.reps !== incumbent.reps) {
    return candidate.reps > incumbent.reps;
  }
  const cR = candidate.rpe ?? -Infinity;
  const iR = incumbent.rpe ?? -Infinity;
  return cR > iR;
}

/**
 * Estimate session duration in whole minutes from start/finish timestamps.
 *
 * Exported here (vs. inlined into the page) so the rounding rule is in one
 * place: we round UP to the next minute so a 7-second "I forgot to log a
 * cooldown" session shows as 1 minute instead of 0.
 */
export function computeDurationMin(startedMs: number, finishedMs: number): number {
  const diffMs = Math.max(0, finishedMs - startedMs);
  return Math.max(1, Math.ceil(diffMs / 60_000));
}

/**
 * Helper to pull a JS millisecond epoch from a Firestore Timestamp-like
 * value. The session converter rehydrates `Timestamp`s with `.toMillis()`
 * but we accept `Date` and raw numbers too so tests don't need a real
 * Firestore Timestamp.
 */
export function toMillis(
  ts: { toMillis?: () => number; toDate?: () => Date } | Date | number | undefined,
): number | undefined {
  if (ts === undefined || ts === null) return undefined;
  if (typeof ts === "number") return ts;
  if (ts instanceof Date) return ts.getTime();
  if (typeof ts.toMillis === "function") return ts.toMillis();
  if (typeof ts.toDate === "function") return ts.toDate().getTime();
  return undefined;
}

/**
 * Re-exported placeholder for PR detection. Real implementation lands in
 * `fn-4-p9x.4`. Calling it is a no-op so the finish-session code path is
 * stable now; .4 will replace the body without changing the call site.
 */
export async function runPRDetectionPlaceholder(
  _uid: string,
  _sessionId: string,
): Promise<void> {
  // Intentionally empty — wired in fn-4-p9x.4 with real PR detection logic.
}

export type { SessionDoc };
