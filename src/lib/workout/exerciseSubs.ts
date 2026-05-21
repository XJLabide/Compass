import { EXERCISE_MASTER, type SeedExercise } from "@/lib/data/exerciseMaster";

/**
 * Minimum shape an entry in the pool must satisfy. Both the seeded master
 * (`SeedExercise`) and user-added exercises (`Exercise` paired with their
 * Firestore id) conform.
 */
export interface SubstitutePoolEntry {
  id: string;
  name: string;
  primaryMuscle: string;
  category: string;
}

/**
 * Suggest substitutes for an exercise. Returns same-primary-muscle exercises
 * ordered with same-category first, excluding the original.
 *
 * The `pool` is the search universe — typically the merge of `EXERCISE_MASTER`
 * + the user's `users/{uid}/exercises/*` collection. We pass it in rather than
 * reading `EXERCISE_MASTER` directly so user-created exercises (slug + uuid
 * ids) are first-class results.
 *
 * Used by the in-session swap picker to surface "smart" alternatives — e.g.
 * if the bench press is occupied, suggest dumbbell bench / incline bench
 * before unrelated chest moves.
 */
export function suggestSubstitutes<T extends SubstitutePoolEntry>(
  exerciseId: string,
  pool: ReadonlyArray<T>,
): T[] {
  const original = pool.find((e) => e.id === exerciseId);
  if (!original) return [];
  const sameMuscle = pool.filter(
    (e) => e.id !== exerciseId && e.primaryMuscle === original.primaryMuscle,
  );
  return [...sameMuscle].sort((a, b) => {
    if (a.category === original.category && b.category !== original.category) return -1;
    if (b.category === original.category && a.category !== original.category) return 1;
    return a.name.localeCompare(b.name);
  });
}

/**
 * Lookup an exercise from the seeded master list. Returns undefined if the id
 * isn't a seeded exercise (e.g. a user-added one — those live in Firestore).
 *
 * Used by callers that only need the *seeded* master (e.g. immediate name
 * lookup on a swap before the user's exercise doc is loaded into state).
 */
export function getMasterExercise(exerciseId: string): SeedExercise | undefined {
  return EXERCISE_MASTER.find((e) => e.id === exerciseId);
}
