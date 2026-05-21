import { serverTimestamp, updateDoc } from "firebase/firestore";

import { programPath } from "@/lib/db/paths";
import type { PlannedExercise, ProgramDoc, ProgramSession } from "@/lib/db/types";
import { getMasterExercise } from "@/lib/workout/exerciseSubs";

/**
 * Persist a single fromId → toId swap into the active program template.
 * Used by the "Save swap to program?" prompt.
 *
 * Match strategy:
 *   1. If `sessionId` is supplied AND matches a `ProgramSession.id`, use that —
 *      this survives the user renaming the session between the swap and the
 *      prompt.
 *   2. Otherwise fall back to matching by `sessionName` (legacy programs and
 *      ad-hoc sessions that never had a programSessionId).
 *
 * Locates the exercise with `fromId` in the matched session and replaces its
 * `exerciseId` + denormalized `name` while keeping order, sets, and rep range
 * intact. If `fromId` isn't found in the session, this is a no-op (the user
 * may have already edited the program elsewhere).
 */
export async function applyProgramSwap(args: {
  uid: string;
  program: ProgramDoc;
  /** Preferred match key. Pass empty string for ad-hoc sessions without an id. */
  sessionId?: string;
  sessionName: string;
  fromId: string;
  toId: string;
}): Promise<void> {
  const { uid, program, sessionId, sessionName, fromId, toId } = args;

  // Prefer id match — survives renames. Fall back to name only when the
  // session has no programSessionId or no id match is found.
  const idMatchExists =
    !!sessionId && program.sessions.some((s) => s.id === sessionId);

  const sessions: ProgramSession[] = program.sessions.map((s) => {
    const matches = idMatchExists ? s.id === sessionId : s.name === sessionName;
    if (!matches) return s;
    let changed = false;
    const exercises: PlannedExercise[] = s.exercises.map((p) => {
      if (p.exerciseId !== fromId) return p;
      changed = true;
      const master = getMasterExercise(toId);
      return {
        ...p,
        exerciseId: toId,
        name: master?.name ?? p.name,
      };
    });
    return changed ? { ...s, exercises } : s;
  });

  await updateDoc(programPath(uid), {
    sessions,
    updatedAt: serverTimestamp(),
  });
}
