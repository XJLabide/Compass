import type { PlannedExercise, ProgramSession } from "@/lib/db/types";

import { EXERCISE_MASTER } from "./exerciseMaster";

/**
 * Seeded Upper/Lower 4-day program template.
 *
 * Layout: Upper A, Lower A, Upper B, Lower B with 5–6 planned exercises each.
 * Target rep ranges follow a strength-to-hypertrophy bias on the compounds and
 * a higher-rep range on the isolations.
 *
 * Each `PlannedExercise.exerciseId` must reference a stable id from
 * `EXERCISE_MASTER` — verified at module load below.
 */

type PlannedRow = Omit<PlannedExercise, "name" | "order"> & {
  /** Override the denormalized name; defaults to the master entry's name. */
  nameOverride?: string;
};

function plan(rows: PlannedRow[]): PlannedExercise[] {
  return rows.map((row, index) => {
    const master = EXERCISE_MASTER.find((e) => e.id === row.exerciseId);
    if (!master) {
      // Loud failure at module load — prevents a seed that points at a phantom id.
      throw new Error(
        `upperLowerProgram: unknown exerciseId "${row.exerciseId}". ` +
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

export const UPPER_LOWER_PROGRAM_NAME = "Upper/Lower";

export const UPPER_LOWER_SESSIONS: ProgramSession[] = [
  {
    id: "upper-a",
    name: "Upper A",
    exercises: plan([
      { exerciseId: "bench-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "barbell-row", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "incline-bench-press", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "lat-pulldown", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lateral-raise", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "overhead-tricep-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "barbell-curl", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
    ]),
  },
  {
    id: "lower-a",
    name: "Lower A",
    exercises: plan([
      { exerciseId: "back-squat", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "romanian-deadlift", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "leg-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "lying-leg-curl", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 4, repRangeLow: 8, repRangeHigh: 15 },
      { exerciseId: "hanging-leg-raise", targetSets: 3, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
  {
    id: "upper-b",
    name: "Upper B",
    exercises: plan([
      { exerciseId: "overhead-press", targetSets: 4, repRangeLow: 5, repRangeHigh: 8 },
      { exerciseId: "pull-up", targetSets: 4, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "dumbbell-bench-press", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "seated-cable-row", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "chest-fly", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "face-pull", targetSets: 3, repRangeLow: 12, repRangeHigh: 15 },
      { exerciseId: "tricep-pushdown", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
    ]),
  },
  {
    id: "lower-b",
    name: "Lower B",
    exercises: plan([
      { exerciseId: "deadlift", targetSets: 3, repRangeLow: 3, repRangeHigh: 6 },
      { exerciseId: "front-squat", targetSets: 3, repRangeLow: 6, repRangeHigh: 10 },
      { exerciseId: "hip-thrust", targetSets: 3, repRangeLow: 8, repRangeHigh: 12 },
      { exerciseId: "walking-lunge", targetSets: 3, repRangeLow: 10, repRangeHigh: 12 },
      { exerciseId: "leg-extension", targetSets: 3, repRangeLow: 10, repRangeHigh: 15 },
      { exerciseId: "standing-calf-raise", targetSets: 4, repRangeLow: 8, repRangeHigh: 15 },
    ]),
  },
];
