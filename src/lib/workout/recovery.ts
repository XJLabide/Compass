import {
  getDocs,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type FieldValue,
} from "firebase/firestore";

import { sessionPath, sessionsPath } from "@/lib/db/paths";
import type { LoggedSet, SessionDoc } from "@/lib/db/types";
import { finishSession } from "@/lib/workout/finishSession";

/**
 * Recovery helpers for in-progress workout sessions.
 *
 * Two cases handled:
 *   1. Soft recovery (UI surface): caller queries for `status='in_progress'`
 *      sessions to render a resume banner. See `findInProgressSessions`.
 *   2. Hard recovery (auto-finalize): a session left `in_progress` for more
 *      than 24 hours is auto-finalized: status flipped to `completed`,
 *      `autoFinalizedAt` stamped, placeholder zero-sets pruned, and PR
 *      detection (`finishSession`) is invoked on whatever real sets exist.
 *
 * Both helpers are client-side; rules are expected to enforce the matching
 * write-guards (status transitions, 48h edit window).
 */

/** Threshold after which an in-progress session is considered abandoned. */
export const AUTO_FINALIZE_MS = 24 * 60 * 60 * 1000;

/** Threshold after which a completed session is read-only. */
export const EDIT_WINDOW_MS = 48 * 60 * 60 * 1000;

/** Row returned to the banner: the doc id paired with its data. */
export interface InProgressRow {
  id: string;
  session: SessionDoc;
}

/**
 * Fetch all `status='in_progress'` sessions for this user.
 * One-shot read (callers can subscribe separately if they want realtime).
 */
export async function findInProgressSessions(
  uid: string,
): Promise<InProgressRow[]> {
  const q = query(sessionsPath(uid), where("status", "==", "in_progress"));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, session: d.data() }));
}

function startedAtMs(s: SessionDoc): number | null {
  const ts = s.startedAt;
  if (!ts) return null;
  // Firestore Timestamp has toMillis(); guard for serverTimestamp sentinels.
  const maybe = ts as unknown as { toMillis?: () => number };
  if (typeof maybe.toMillis === "function") {
    try {
      return maybe.toMillis();
    } catch {
      return null;
    }
  }
  return null;
}

/**
 * Scan all in-progress sessions and auto-finalize any that started more than
 * 24h ago. Returns the ids that were finalized. Best-effort: failures on
 * individual sessions are caught and surfaced via `errors` so a single bad
 * doc doesn't break the boot path.
 */
export async function checkAndAutoFinalize(uid: string): Promise<{
  finalized: string[];
  errors: { id: string; error: string }[];
}> {
  const finalized: string[] = [];
  const errors: { id: string; error: string }[] = [];

  let rows: InProgressRow[];
  try {
    rows = await findInProgressSessions(uid);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { finalized, errors: [{ id: "*query*", error: message }] };
  }

  const now = Date.now();

  for (const { id, session } of rows) {
    const startedMs = startedAtMs(session);
    if (startedMs === null) continue; // can't reason about age; skip
    if (now - startedMs < AUTO_FINALIZE_MS) continue;

    try {
      // Prune zero/zero placeholders the live logger uses as anchors so they
      // don't pollute history or PR computation.
      const cleanedSets: LoggedSet[] = (session.sets ?? []).filter(
        (s) => !(s.weightKg === 0 && s.reps === 0),
      );

      const patch: {
        status: "completed";
        finishedAt: FieldValue;
        autoFinalizedAt: FieldValue;
        sets: LoggedSet[];
        updatedAt: FieldValue;
      } = {
        status: "completed",
        finishedAt: serverTimestamp(),
        autoFinalizedAt: serverTimestamp(),
        sets: cleanedSets,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(uid, id), patch);

      // Run PR detection on whatever real sets exist. Best-effort.
      try {
        await finishSession(uid, id);
      } catch (prErr) {
        // eslint-disable-next-line no-console
        console.warn("Auto-finalize PR detection failed for", id, prErr);
      }

      finalized.push(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      errors.push({ id, error: message });
    }
  }

  return { finalized, errors };
}

/**
 * Mark an in-progress session as discarded. The doc is kept (for audit) but
 * stops surfacing in the resume banner and the recent-sessions feed should
 * filter it out at render time.
 */
export async function discardInProgressSession(
  uid: string,
  sessionId: string,
): Promise<void> {
  const patch: {
    status: "discarded";
    updatedAt: FieldValue;
  } = {
    status: "discarded",
    updatedAt: serverTimestamp(),
  };
  await updateDoc(sessionPath(uid, sessionId), patch);
}

/**
 * Returns true if the given completed session is past the 48h edit window
 * and should be rendered read-only. Sessions without a `finishedAt` (e.g.
 * still in-progress) are not considered locked here.
 */
export function isPastEditWindow(
  session: Pick<SessionDoc, "status" | "finishedAt">,
  now: number = Date.now(),
): boolean {
  if (session.status !== "completed") return false;
  const ts = session.finishedAt;
  if (!ts) return false;
  const maybe = ts as unknown as { toMillis?: () => number };
  if (typeof maybe.toMillis !== "function") return false;
  let finishedMs: number;
  try {
    finishedMs = maybe.toMillis();
  } catch {
    return false;
  }
  return now - finishedMs > EDIT_WINDOW_MS;
}
