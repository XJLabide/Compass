import type { Exercise, ExerciseCategory, MuscleGroup } from "@/lib/db/types";

/**
 * Master list of seeded exercises for first-run.
 *
 * Each entry carries a stable `id` (slug) used as the Firestore document id
 * under `users/{uid}/exercises/{exerciseId}` and referenced from the seeded
 * program template (`upperLowerProgram.ts`). Ids are stable across reseeds so
 * the program template never points at a missing exercise.
 *
 * The shape here is the writeable subset of `Exercise` (no `createdAt`); the
 * seeder attaches `serverTimestamp()` and `seeded: true` at write time.
 */

export interface SeedExercise {
  id: string;
  name: string;
  primaryMuscle: MuscleGroup;
  category: ExerciseCategory;
}

export type SeededExerciseDoc = Omit<Exercise, "createdAt">;

export const EXERCISE_MASTER: SeedExercise[] = [
  // Chest
  { id: "bench-press", name: "Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "incline-bench-press", name: "Incline Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "dumbbell-bench-press", name: "Dumbbell Bench Press", primaryMuscle: "chest", category: "compound" },
  { id: "chest-fly", name: "Chest Fly", primaryMuscle: "chest", category: "isolation" },

  // Back
  { id: "barbell-row", name: "Barbell Row", primaryMuscle: "back", category: "compound" },
  { id: "pull-up", name: "Pull-Up", primaryMuscle: "back", category: "compound" },
  { id: "lat-pulldown", name: "Lat Pulldown", primaryMuscle: "back", category: "compound" },
  { id: "seated-cable-row", name: "Seated Cable Row", primaryMuscle: "back", category: "compound" },
  { id: "face-pull", name: "Face Pull", primaryMuscle: "back", category: "accessory" },

  // Shoulders
  { id: "overhead-press", name: "Overhead Press", primaryMuscle: "shoulders", category: "compound" },
  { id: "dumbbell-shoulder-press", name: "Dumbbell Shoulder Press", primaryMuscle: "shoulders", category: "compound" },
  { id: "lateral-raise", name: "Lateral Raise", primaryMuscle: "shoulders", category: "isolation" },

  // Arms
  { id: "barbell-curl", name: "Barbell Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "dumbbell-curl", name: "Dumbbell Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "hammer-curl", name: "Hammer Curl", primaryMuscle: "biceps", category: "isolation" },
  { id: "tricep-pushdown", name: "Tricep Pushdown", primaryMuscle: "triceps", category: "isolation" },
  { id: "overhead-tricep-extension", name: "Overhead Tricep Extension", primaryMuscle: "triceps", category: "isolation" },

  // Legs — quads / glutes
  { id: "back-squat", name: "Back Squat", primaryMuscle: "quads", category: "compound" },
  { id: "front-squat", name: "Front Squat", primaryMuscle: "quads", category: "compound" },
  { id: "leg-press", name: "Leg Press", primaryMuscle: "quads", category: "compound" },
  { id: "leg-extension", name: "Leg Extension", primaryMuscle: "quads", category: "isolation" },
  { id: "walking-lunge", name: "Walking Lunge", primaryMuscle: "quads", category: "compound" },

  // Legs — hamstrings / posterior
  { id: "deadlift", name: "Deadlift", primaryMuscle: "hamstrings", category: "compound" },
  { id: "romanian-deadlift", name: "Romanian Deadlift", primaryMuscle: "hamstrings", category: "compound" },
  { id: "lying-leg-curl", name: "Lying Leg Curl", primaryMuscle: "hamstrings", category: "isolation" },
  { id: "hip-thrust", name: "Hip Thrust", primaryMuscle: "glutes", category: "compound" },

  // Calves
  { id: "standing-calf-raise", name: "Standing Calf Raise", primaryMuscle: "calves", category: "isolation" },

  // Core
  { id: "hanging-leg-raise", name: "Hanging Leg Raise", primaryMuscle: "core", category: "isolation" },
  { id: "plank", name: "Plank", primaryMuscle: "core", category: "isolation" },
];
