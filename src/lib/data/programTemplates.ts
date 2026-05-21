import type { PlannedExercise, ProgramSession } from "@/lib/db/types";

import { EXERCISE_MASTER } from "./exerciseMaster";

/**
 * Shared helper used by all built-in program templates.
 *
 * Resolves the denormalized `name` from EXERCISE_MASTER and assigns `order`.
 * Throws at module load if any `exerciseId` doesn't exist in the master list —
 * this is the safety net that prevents phantom-id templates from shipping.
 */

type PlannedRow = Omit<PlannedExercise, "name" | "order"> & {
  nameOverride?: string;
};

export function buildProgramSessions(rows: PlannedRow[]): PlannedExercise[] {
  return rows.map((row, index) => {
    const master = EXERCISE_MASTER.find((e) => e.id === row.exerciseId);
    if (!master) {
      throw new Error(
        `programTemplates: unknown exerciseId "${row.exerciseId}". ` +
          `Add it to EXERCISE_MASTER or fix the typo.`,
      );
    }
    return {
      exerciseId: row.exerciseId,
      name: row.nameOverride ?? master.name,
      targetSets: row.targetSets,
      repRangeLow: row.repRangeLow,
      repRangeHigh: row.repRangeHigh,
      order: index,
    };
  });
}

// ---------------------------------------------------------------------------
// Import Upper/Lower sessions from the existing module.
// upperLowerProgram.ts imports only from exerciseMaster — no circular dep.
// ---------------------------------------------------------------------------
import { UPPER_LOWER_SESSIONS } from "./upperLowerProgram";

// ---------------------------------------------------------------------------
// Push / Pull / Legs  (6-day)
// ---------------------------------------------------------------------------

const PUSH_PULL_LEGS_SESSIONS: ProgramSession[] = [
  {
    id: "push-a",
    name: "Push A",
    exercises: buildProgramSessions([
      { exerciseId: "bench-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "overhead-press", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "incline-bench-press", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "lateral-raise", targetSets: 4, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "overhead-tricep-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "tricep-pushdown", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
    ]),
  },
  {
    id: "pull-a",
    name: "Pull A",
    exercises: buildProgramSessions([
      { exerciseId: "barbell-row", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "pull-up", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "seated-cable-row", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "face-pull", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "barbell-curl", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "hammer-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
  {
    id: "legs-a",
    name: "Legs A",
    exercises: buildProgramSessions([
      { exerciseId: "back-squat", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "romanian-deadlift", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "leg-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lying-leg-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 4, repRangeLow: 8, repRangeHigh: 15 },
      { exerciseId: "hanging-leg-raise", targetSets: 3, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
  {
    id: "push-b",
    name: "Push B",
    exercises: buildProgramSessions([
      { exerciseId: "dumbbell-shoulder-press", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "dumbbell-bench-press", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "chest-fly", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "lateral-raise", targetSets: 4, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "tricep-pushdown", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "overhead-tricep-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
  {
    id: "pull-b",
    name: "Pull B",
    exercises: buildProgramSessions([
      { exerciseId: "deadlift", targetSets: 3, repRangeLow: 3, repRangeHigh: 6 },
      { exerciseId: "lat-pulldown", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "seated-cable-row", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "face-pull", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "dumbbell-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "hammer-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
  {
    id: "legs-b",
    name: "Legs B",
    exercises: buildProgramSessions([
      { exerciseId: "front-squat", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "hip-thrust", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "walking-lunge", targetSets: 3, repRangeLow: 10, repRangeHigh: 12 },
      { exerciseId: "leg-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "lying-leg-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 4, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
];

// ---------------------------------------------------------------------------
// Full Body 3x  (3-day)
// ---------------------------------------------------------------------------

const FULL_BODY_3X_SESSIONS: ProgramSession[] = [
  {
    id: "fb-a",
    name: "Full Body A",
    exercises: buildProgramSessions([
      { exerciseId: "back-squat", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "bench-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "barbell-row", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "romanian-deadlift", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lateral-raise", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 3, repRangeLow: 8, repRangeHigh: 15 },
      { exerciseId: "hanging-leg-raise", targetSets: 2, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
  {
    id: "fb-b",
    name: "Full Body B",
    exercises: buildProgramSessions([
      { exerciseId: "deadlift", targetSets: 3, repRangeLow: 3, repRangeHigh: 6 },
      { exerciseId: "overhead-press", targetSets: 3, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "pull-up", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "leg-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "dumbbell-bench-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "barbell-curl", targetSets: 2, repRangeLow: 8, repRangeHigh: 12 },
    ]),
  },
  {
    id: "fb-c",
    name: "Full Body C",
    exercises: buildProgramSessions([
      { exerciseId: "front-squat", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "incline-bench-press", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "seated-cable-row", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lying-leg-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "dumbbell-shoulder-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "tricep-pushdown", targetSets: 2, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "hammer-curl", targetSets: 2, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
];

// ---------------------------------------------------------------------------
// Bro Split  (5-day)
// ---------------------------------------------------------------------------

const BRO_SPLIT_SESSIONS: ProgramSession[] = [
  {
    id: "bs-chest",
    name: "Chest",
    exercises: buildProgramSessions([
      { exerciseId: "bench-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "incline-bench-press", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "dumbbell-bench-press", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "chest-fly", targetSets: 4, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
  {
    id: "bs-back",
    name: "Back",
    exercises: buildProgramSessions([
      { exerciseId: "deadlift", targetSets: 3, repRangeLow: 3, repRangeHigh: 6 },
      { exerciseId: "pull-up", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "barbell-row", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "seated-cable-row", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lat-pulldown", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "face-pull", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
    ]),
  },
  {
    id: "bs-shoulders",
    name: "Shoulders",
    exercises: buildProgramSessions([
      { exerciseId: "overhead-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "dumbbell-shoulder-press", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "lateral-raise", targetSets: 5, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "face-pull", targetSets: 4, repRangeLow: 12, repRangeHigh: 15 },
    ]),
  },
  {
    id: "bs-arms",
    name: "Arms",
    exercises: buildProgramSessions([
      { exerciseId: "barbell-curl", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "tricep-pushdown", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "dumbbell-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "overhead-tricep-extension", targetSets: 4, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "hammer-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
    ]),
  },
  {
    id: "bs-legs",
    name: "Legs",
    exercises: buildProgramSessions([
      { exerciseId: "back-squat", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "romanian-deadlift", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "leg-press", targetSets: 4, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "hip-thrust", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lying-leg-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "leg-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 4, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
];

// ---------------------------------------------------------------------------
// Public registry — consumed by SwitchProgramDialog.
// ---------------------------------------------------------------------------

export interface ProgramTemplate {
  id: string;
  name: string;
  description: string;
  sessions: ProgramSession[];
}

export const PROGRAM_TEMPLATES: ProgramTemplate[] = [
  {
    id: "upper-lower",
    name: "Upper/Lower",
    description: "4-day upper/lower split",
    sessions: UPPER_LOWER_SESSIONS,
  },
  {
    id: "push-pull-legs",
    name: "Push/Pull/Legs",
    description: "6-day push/pull/legs split",
    sessions: PUSH_PULL_LEGS_SESSIONS,
  },
  {
    id: "full-body-3x",
    name: "Full Body 3x",
    description: "3-day full-body split",
    sessions: FULL_BODY_3X_SESSIONS,
  },
  {
    id: "bro-split",
    name: "Bro Split",
    description: "5-day body-part split",
    sessions: BRO_SPLIT_SESSIONS,
  },
];
