import type { ExerciseCategory, MuscleGroup } from "@/lib/db/types";

/**
 * Maps ExerciseDB `targetMuscles[*]` / `secondaryMuscles[*]` names to our
 * `MuscleGroup` union.
 *
 * Mirrors the canonical `MUSCLE_MAP` table in
 * `scripts/import-exercisedb.mjs` so the client-side library-search dedup and
 * the offline import script agree on mapping. Includes BOTH the textbook
 * names ("pectoralis major") AND ExerciseDB's short forms ("pectorals",
 * "pecs", "delts", "lats", "traps", "quads", "abs") so future API shape
 * changes are tolerated.
 *
 * Entries not in this table fall through to `null`, which the caller can
 * treat as "drop / unknown muscle".
 */
export const API_MUSCLE_TO_OURS: Record<string, MuscleGroup> = {
  // chest
  pectorals: "chest",
  pecs: "chest",
  "pectoralis major": "chest",
  "pectoralis minor": "chest",
  "serratus anterior": "chest",
  // back
  lats: "back",
  "latissimus dorsi": "back",
  "upper back": "back",
  traps: "back",
  trapezius: "back",
  rhomboids: "back",
  spine: "back",
  "erector spinae": "back",
  infraspinatus: "back",
  "teres major": "back",
  "teres minor": "back",
  "lower back": "back",
  "levator scapulae": "back",
  // shoulders
  delts: "shoulders",
  deltoid: "shoulders",
  "anterior deltoid": "shoulders",
  "lateral deltoid": "shoulders",
  "posterior deltoid": "shoulders",
  "rear deltoids": "shoulders",
  shoulders: "shoulders",
  // biceps
  biceps: "biceps",
  "biceps brachii": "biceps",
  brachialis: "biceps",
  brachioradialis: "biceps",
  // triceps
  triceps: "triceps",
  "triceps brachii": "triceps",
  // quads
  quads: "quads",
  quadriceps: "quads",
  "vastus lateralis": "quads",
  "vastus medialis": "quads",
  "rectus femoris": "quads",
  "hip flexors": "quads",
  // hamstrings
  hamstrings: "hamstrings",
  "biceps femoris": "hamstrings",
  // glutes
  glutes: "glutes",
  "gluteus maximus": "glutes",
  "gluteus medius": "glutes",
  abductors: "glutes",
  // calves
  calves: "calves",
  gastrocnemius: "calves",
  soleus: "calves",
  // core
  abs: "core",
  core: "core",
  "rectus abdominis": "core",
  obliques: "core",
  "transverse abdominis": "core",
  // forearms (we DO carry forearms in our union, unlike the import script
  // which drops them — they're a valid primary muscle for grip work).
  forearms: "forearms",
  "wrist flexors": "forearms",
  "wrist extensors": "forearms",
};

/**
 * Map an ExerciseDB muscle string to our `MuscleGroup`, or null if no match.
 * Comparison is case-insensitive and ignores surrounding whitespace.
 */
export function mapApiMuscle(name: string | null | undefined): MuscleGroup | null {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase();
  if (!key) return null;
  return API_MUSCLE_TO_OURS[key] ?? null;
}

/**
 * Infer the broad category for an API exercise from its name + equipment.
 *
 * Mirrors `inferCategory` in `scripts/import-exercisedb.mjs` so the in-app
 * "Add to library" button categorises new entries the same way the seeded
 * batch was categorised.
 */
export function inferCategory(
  name: string,
  equipments: ReadonlyArray<string>,
): ExerciseCategory {
  const lower = name.toLowerCase();
  const equipSet = new Set(equipments.map((e) => e.toLowerCase()));

  const compoundNameRe =
    /\b(squat|press|row|deadlift|pull-?up|dip|clean|snatch|lunge|hip thrust)\b/;
  const isolationNameRe =
    /\b(curl|fly|raise|extension|kickback|crunch|pulldown|pushdown)\b/;

  const isCompoundEquip =
    equipSet.has("barbell") ||
    equipSet.has("body weight") ||
    equipSet.has("smith machine");

  if (isCompoundEquip && compoundNameRe.test(lower)) return "compound";
  if (isolationNameRe.test(lower)) return "isolation";
  return "accessory";
}
