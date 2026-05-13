import type { User } from "firebase/auth";
import {
  getDoc,
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import {
  UPPER_LOWER_PROGRAM_NAME,
  UPPER_LOWER_SESSIONS,
} from "@/lib/data/upperLowerProgram";

import {
  exercisePath,
  profilePath,
  programPath,
} from "./paths";
import type { Exercise, Profile, ProgramDoc } from "./types";

/**
 * First-run seeder.
 *
 * On the first sign-in for a user (no `profile` doc exists), writes:
 *   - `users/{uid}/profile/profile`     — defaults from `defaultProfile()`
 *   - `users/{uid}/program/active`      — the Upper/Lower 4-day template
 *   - `users/{uid}/exercises/{slug}`    — the seeded master list (~25 lifts)
 *
 * Idempotent: if the profile doc already exists, returns immediately with no
 * writes. Callers can safely invoke this on every auth resolution.
 *
 * All seeded writes happen in a single `writeBatch` so partial failures don't
 * leave the user with exercises but no program (or vice versa).
 *
 * NOTE on defaults: the epic spec calls for `weeklyGainKg: 0.2`, but the
 * canonical `Profile.weeklyGainLb` (from fn-3-167.1) stores pounds. We store
 * the lb equivalent (0.5 lb/week ≈ 0.23 kg/week), which is the documented
 * default in the PRD.
 */

const DEFAULT_PROFILE: Omit<Profile, "createdAt" | "updatedAt" | "displayName"> = {
  unitSystem: "imperial",
  proteinTargetG: 180,
  weeklyGainLb: 0.5,
  // Replaced at call time with the user's resolved IANA tz.
  timezone: "UTC",
};

function resolveTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

function deriveDisplayName(user: User): string {
  return user.displayName?.trim() || user.email?.split("@")[0] || "Athlete";
}

/**
 * Idempotently seed first-run data for `user`.
 *
 * Returns `true` if a seed write was performed, `false` if the profile already
 * existed and nothing was written. The boolean is mainly useful for tests and
 * for emitting a one-time "Welcome" toast in the UI later — callers can ignore
 * it safely.
 */
export async function ensureSeeded(
  user: User,
  db: Firestore = getFirebaseDb(),
): Promise<boolean> {
  const profileRef = profilePath(user.uid, db);
  const existing = await getDoc(profileRef);
  if (existing.exists()) return false;

  const batch = writeBatch(db);
  const now = serverTimestamp();

  const profile: Profile = {
    displayName: deriveDisplayName(user),
    ...DEFAULT_PROFILE,
    timezone: resolveTimezone(),
    // serverTimestamp() at write time; cast through unknown because the field
    // type is `Timestamp` post-read but a sentinel pre-write.
    createdAt: now as unknown as Profile["createdAt"],
    updatedAt: now as unknown as Profile["updatedAt"],
  };
  batch.set(profileRef, profile);

  const program: ProgramDoc = {
    name: UPPER_LOWER_PROGRAM_NAME,
    sessions: UPPER_LOWER_SESSIONS,
    createdAt: now as unknown as ProgramDoc["createdAt"],
    updatedAt: now as unknown as ProgramDoc["updatedAt"],
  };
  batch.set(programPath(user.uid, db), program);

  for (const seed of EXERCISE_MASTER) {
    const exercise: Exercise = {
      name: seed.name,
      primaryMuscle: seed.primaryMuscle,
      category: seed.category,
      seeded: true,
      createdAt: now as unknown as Exercise["createdAt"],
    };
    batch.set(exercisePath(user.uid, seed.id, db), exercise);
  }

  await batch.commit();
  return true;
}
