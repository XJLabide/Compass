import {
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  where,
  writeBatch,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import {
  exercisePath,
  prPath,
  prsPath,
  sessionPath,
} from "@/lib/db/paths";
import type { LoggedSet, LocalDate, PRDoc } from "@/lib/db/types";
import {
  computeCandidatePRs,
  diffAgainstExisting,
  prDocId,
  type CandidatePR,
  type PRDocExt,
} from "@/lib/pr";

/**
 * Finish-session orchestrator (PR detection slice).
 *
 * Phase split:
 *
 *  1. The /workout/[id] page itself writes `status=completed`, `finishedAt`,
 *     `durationMin`, and the pruned `sets[]`. That happened in fn-4-p9x.3.
 *
 *  2. THIS function runs *after* that write and is responsible only for the
 *     PR side-effects:
 *       a. Read the just-finished session doc (single source of truth for
 *          the sets — never trust client-side state at this boundary).
 *       b. Compute candidate PRs purely (`computeCandidatePRs`).
 *       c. Fetch existing PR docs only for the exerciseIds the session
 *          touched. Cheap when v1 sessions touch ~6 exercises.
 *       d. Diff candidates vs existing; build a batched write of new PR
 *          feed entries.
 *       e. Denormalize `exerciseName` onto each PR doc with one read per
 *          unique exerciseId (small constant for v1 sessions).
 *
 * Failure semantics:
 *   - PR detection is best-effort. If anything throws we surface the error
 *     to the caller but the session is already marked `completed`, so the
 *     workout is not lost. The page treats errors as non-fatal.
 *   - We never delete or downgrade existing PRs here — `recomputePRs` is the
 *     destructive path used by edit/delete flows (fn-4-p9x.5 hooks it in).
 */

const db = () => getFirebaseDb();

/**
 * Run PR detection for a just-completed session. Idempotent: calling this
 * twice for the same session re-evaluates candidates and only writes deltas
 * (deterministic doc ids make repeat writes upserts, not duplicates).
 */
export async function finishSession(
  uid: string,
  sessionId: string,
): Promise<{ newPRs: number }> {
  if (!uid || !sessionId) {
    throw new Error("finishSession: uid and sessionId required");
  }

  // ---------- (a) load the session ----------
  const sessSnap = await getDoc(sessionPath(uid, sessionId));
  const session = sessSnap.data();
  if (!session) return { newPRs: 0 };

  const sets: LoggedSet[] = (session.sets ?? []).filter(
    (s) => s && s.weightKg > 0 && s.reps > 0,
  );
  if (sets.length === 0) return { newPRs: 0 };

  // ---------- (b) candidates ----------
  const candidates = computeCandidatePRs(sets);
  if (candidates.length === 0) return { newPRs: 0 };

  // ---------- (c) fetch existing PR docs for touched exerciseIds ----------
  const exerciseIds = Array.from(new Set(candidates.map((c) => c.exerciseId)));
  const existing = await loadExistingPRs(uid, exerciseIds);

  // ---------- (d) diff ----------
  const wins = diffAgainstExisting(candidates, existing);
  if (wins.length === 0) return { newPRs: 0 };

  // ---------- (e) denormalize names, batched write ----------
  const nameByExerciseId = await loadExerciseNames(uid, exerciseIds);

  // Pick a `localDate` + `date` anchor for written PR docs: prefer the
  // session's own localDate/finishedAt so the PR shows on the day the lift
  // actually happened, not when the worker happened to run.
  const localDate: LocalDate = session.localDate;
  const date =
    session.finishedAt instanceof Timestamp
      ? session.finishedAt
      : session.date instanceof Timestamp
        ? session.date
        : Timestamp.now();

  const batch = writeBatch(db());
  for (const win of wins) {
    const id = prDocId(win.exerciseId, win.kind, win.bucket);
    const ref = prPath(uid, id);
    const doc = buildPRDoc({
      candidate: win,
      sessionId,
      localDate,
      date,
      exerciseName:
        nameByExerciseId.get(win.exerciseId) ?? win.exerciseId,
    });
    batch.set(ref, doc);
  }
  await batch.commit();

  return { newPRs: wins.length };
}

// ---------------------------------------------------------------------------
// Internals
// ---------------------------------------------------------------------------

/**
 * Read all stored PRs for the given exerciseIds. We query the whole feed
 * filtered by exerciseId (one query per exercise). For v1 sessions touching
 * ~6 exercises this is fine; if the feed grows large we can switch to
 * deterministic-id `getDoc` fan-out instead.
 */
async function loadExistingPRs(
  uid: string,
  exerciseIds: string[],
): Promise<Map<string, PRDocExt>> {
  const out = new Map<string, PRDocExt>();
  if (exerciseIds.length === 0) return out;

  await Promise.all(
    exerciseIds.map(async (exerciseId) => {
      const q = query(prsPath(uid), where("exerciseId", "==", exerciseId));
      const snap = await getDocs(q);
      snap.forEach((d) => {
        // Cast: PRDocExt is a structural superset of PRDoc.
        out.set(d.id, d.data() as PRDocExt);
      });
    }),
  );

  return out;
}

/**
 * Pull exercise names for denormalization onto PR docs. Missing exercises
 * fall back to the exerciseId itself (matches the planner fallback in the
 * logger page).
 */
async function loadExerciseNames(
  uid: string,
  exerciseIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  await Promise.all(
    exerciseIds.map(async (id) => {
      const snap = await getDoc(exercisePath(uid, id));
      const ex = snap.data();
      if (ex?.name) out.set(id, ex.name);
    }),
  );
  return out;
}

/**
 * Assemble a `PRDocExt` ready for `batch.set`. `createdAt` uses
 * `serverTimestamp()` so multi-tab finishes don't collide on doc id.
 */
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
    // `createdAt` is a Timestamp at rest but we use serverTimestamp at write
    // time; the TS type is permissive because Firestore replaces this sentinel.
    createdAt: serverTimestamp() as unknown as Timestamp,
  };

  return c.kind === "bucket"
    ? { ...base, kind: "bucket", bucket: c.bucket }
    : { ...base, kind: "e1rm" };
}

// Re-exported for the unused-warning suppression and discoverability.
export { setDoc };
