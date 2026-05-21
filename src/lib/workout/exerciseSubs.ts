import { EXERCISE_MASTER, type SeedExercise } from "@/lib/data/exerciseMaster";

/**
 * Suggest substitutes for an exercise. Returns same-primary-muscle exercises
 * ordered with same-category first, excluding the original.
 *
 * Used by the in-session swap picker to surface "smart" alternatives — e.g.
 * if the bench press is occupied, suggest dumbbell bench / incline bench
 * before unrelated chest moves.
 */
export function suggestSubstitutes(exerciseId: string): SeedExercise[] {
  const original = EXERCISE_MASTER.find((e) => e.id === exerciseId);
  if (!original) return [];
  const sameMuscle = EXERCISE_MASTER.filter(
    (e) => e.id !== exerciseId && e.primaryMuscle === original.primaryMuscle,
  );
  return sameMuscle.sort((a, b) => {
    if (a.category === original.category && b.category !== original.category) return -1;
    if (b.category === original.category && a.category !== original.category) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Lookup an exercise from the seeded master list. Returns undefined if the id
 * isn't a seeded exercise (e.g. a user-added one — those live in Firestore).
 */
export function getMasterExercise(exerciseId: string): SeedExercise | undefined {
  return EXERCISE_MASTER.find((e) => e.id === exerciseId);
}
