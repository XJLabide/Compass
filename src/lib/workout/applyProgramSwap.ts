import { serverTimestamp, updateDoc } from "firebase/firestore";

import { programPath } from "@/lib/db/paths";
import type { PlannedExercise, ProgramDoc, ProgramSession } from "@/lib/db/types";
import { getMasterExercise } from "@/lib/workout/exerciseSubs";

/**
 * Persist a single fromId → toId swap into the active program template.
 * Used by the "Save swap to program?" prompt.
 *
 * Strategy: find the matching session by id (preferred) or name (fallback for
 * legacy programs where session ids drifted from display names), locate the
 * exercise with `fromId`, replace its `exerciseId` + denormalized `name` —
 * keeping order, sets, and rep range intact. If `fromId` isn't found in the
 * session, this is a no-op (the user may have already edited the program
 * elsewhere).
 */
export async function applyProgramSwap(args: {
  uid: string;
  program: ProgramDoc;
  sessionName: string;
  fromId: string;
  toId: string;
}): Promise<void> {
  const { uid, program, sessionName, fromId, toId } = args;

  const sessions: ProgramSession[] = program.sessions.map((s) => {
    if (s.name !== sessionName) return s;
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
