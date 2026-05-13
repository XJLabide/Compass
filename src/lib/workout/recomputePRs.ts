import {
  Timestamp,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import {
  exercisePath,
  prPath,
  prsPath,
  sessionsPath,
} from "@/lib/db/paths";
import type { LoggedSet, LocalDate, PRDoc, SessionDoc } from "@/lib/db/types";
import {
  computeCandidatePRs,
  prDocId,
  type CandidatePR,
  type PRDocExt,
} from "@/lib/pr";

/**
 * Destructive rebuild of all PR docs for a single exercise.
 *
 * Used by the edit/delete-set path (fn-4-p9x.5): when the lifter edits a set
 * within the 48-hour edit window, the simplest correct strategy is "throw
 * away every PR for this exercise and rebuild from completed history". This
 * avoids subtle bugs around "did this edit remove the heaviest set; was that
 * set the source of any PR; do we need to find the runner-up". Reading the
 * history once per exercise is cheap (v1 lifters log a handful of sessions
 * per week).
 *
 * Strategy:
 *   1. Query all completed sessions that touched the exercise.
 *   2. Concatenate their `sets[]` filtered to this exercise.
 *   3. For each candidate from `computeCandidatePRs`, find the *originating
 *      session* (the session containing the winning set) so we can stamp the
 *      PR's `sessionId`/`localDate`/`date` to point at the right history
 *      anchor — not just the latest session.
 *   4. Delete every existing PR doc with `exerciseId == this id`, then write
 *      the rebuilt set in a single batch.
 *
 * `recomputePRsForExercise` is exported because v1 only needs the per-
 * exercise path. A future `recomputeAllPRs` would loop this over every
 * exercise the user has ever touched; out of scope here.
 */

const db = () => getFirebaseDb();

interface SessionWithId {
  id: string;
  data: SessionDoc;
}

/**
 * Rebuild PRs for `exerciseId` from completed-session history. Wipes the
 * exercise's existing PR docs and writes a fresh set in one batch.
 */
export async function recomputePRsForExercise(
  uid: string,
  exerciseId: string,
): Promise<{ writes: number; deletes: number }> {
  if (!uid || !exerciseId) {
    throw new Error("recomputePRsForExercise: uid and exerciseId required");
  }

  // ---------- gather history ----------
  // We can't directly query "sessions whose sets[] contains a given
  // exerciseId" in Firestore. v1 cheats by scanning all completed sessions
  // and filtering client-side. Lifter session counts are small enough for
  // this to stay sub-second; a future index can replace it.
  const sessionsSnap = await getDocs(
    query(sessionsPath(uid), where("status", "==", "completed")),
  );
  const completedSessions: SessionWithId[] = [];
  sessionsSnap.forEach((d) => {
    const data = d.data();
    if ((data.sets ?? []).some((s) => s.exerciseId === exerciseId)) {
      completedSessions.push({ id: d.id, data });
    }
  });

  // Existing PR docs for this exercise — to be deleted before rewrite.
  const existingSnap = await getDocs(
    query(prsPath(uid), where("exerciseId", "==", exerciseId)),
  );
  const existingIds: string[] = [];
  existingSnap.forEach((d) => existingIds.push(d.id));

  // ---------- candidate PRs across all history ----------
  // Tag each set with the originating sessionId so we can recover it later.
  const taggedSets: Array<LoggedSet & { __sessionId: string }> = [];
  for (const { id, data } of completedSessions) {
    for (const s of data.sets ?? []) {
      if (s.exerciseId !== exerciseId) continue;
      if (s.weightKg <= 0 || s.reps <= 0) continue;
      taggedSets.push({ ...s, __sessionId: id });
    }
  }

  const candidates = computeCandidatePRs(taggedSets);

  // For each winning candidate, find the originating session so we can stamp
  // the PR doc with the right localDate/sessionId. `computeCandidatePRs`
  // strips the `__sessionId` tag (it lives on the `set` reference), so we
  // reach back through `candidate.set` to read it.
  const sessionLookup = new Map(completedSessions.map((s) => [s.id, s.data]));

  // ---------- delete + write batch ----------
  const batch = writeBatch(db());
  for (const id of existingIds) {
    batch.delete(prPath(uid, id));
  }

  // Single exercise → one name lookup.
  const exName = await loadExerciseName(uid, exerciseId);

  for (const c of candidates) {
    const tagged = c.set as LoggedSet & { __sessionId?: string };
    const originSessionId = tagged.__sessionId ?? "";
    const originSession = sessionLookup.get(originSessionId);
    const id = prDocId(c.exerciseId, c.kind, c.bucket);
    const ref = prPath(uid, id);
    const localDate: LocalDate = originSession?.localDate ?? "";
    const date =
      originSession?.finishedAt instanceof Timestamp
        ? originSession.finishedAt
        : originSession?.date instanceof Timestamp
          ? originSession.date
          : Timestamp.now();
    batch.set(
      ref,
      buildPRDoc({
        candidate: c,
        sessionId: originSessionId,
        localDate,
        date,
        exerciseName: exName ?? exerciseId,
      }),
    );
  }

  await batch.commit();
  return { writes: candidates.length, deletes: existingIds.length };
}

// ---------------------------------------------------------------------------
// Internals (mirror finishSession.ts; kept local to avoid a circular dep)
// ---------------------------------------------------------------------------

async function loadExerciseName(
  uid: string,
  exerciseId: string,
): Promise<string | undefined> {
  const snap = await getDoc(exercisePath(uid, exerciseId));
  return snap.data()?.name;
}

function buildPRDoc(input: {
  candidate: CandidatePR;
  sessionId: string;
  localDate: LocalDate;
  date: Timestamp;
  exerciseName: string;
}): PRDocExt {
  const { candidate: c, sessionId, localDate, date, exerciseName } = input;
  const e1RMKg =
    c.kind === "e1rm" ? c.metric : c.weightKg * (1 + c.reps / 30);
  const base: PRDoc = {
    exerciseId: c.exerciseId,
    exerciseName,
    weightKg: c.weightKg,
    reps: c.reps,
    e1RMKg,
    sessionId,
    localDate,
    date,
    createdAt: serverTimestamp() as unknown as Timestamp,
  };
  return c.kind === "bucket"
    ? { ...base, kind: "bucket", bucket: c.bucket }
    : { ...base, kind: "e1rm" };
}
