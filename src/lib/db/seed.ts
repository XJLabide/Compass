import type { User } from "firebase/auth";
import {
  serverTimestamp,
  writeBatch,
  type Firestore,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import {
  UPPER_LOWER_PROGRAM_NAME,
  UPPER_LOWER_SESSIONS,
} from "@/lib/data/upperLowerProgram";

import {
  profilePath,
  programPath,
} from "./paths";
import type { Profile, ProgramDoc } from "./types";

/**
 * First-run seeder.
 *
 * On the first sign-in for a user (no `profile` doc exists), writes:
 *   - `users/{uid}/profile/profile`     — defaults from `defaultProfile()`
 *   - `users/{uid}/program/active`      — the Upper/Lower 4-day template
 *
 * NOTE: The master exercise list (EXERCISE_MASTER) is intentionally NOT seeded
 * into Firestore. It lives in code as the read-only source of truth. Only
 * user-created custom exercises and API imports are stored in
 * `users/{uid}/exercises/`. All readers merge EXERCISE_MASTER + user collection
 * at runtime (see buildPickerPool / getExerciseDef patterns).
 *
 * Idempotent: if the profile doc already exists, returns immediately with no
 * writes. Callers can safely invoke this on every auth resolution.
 *
 * All seeded writes happen in a single `writeBatch` so partial failures don't
 * leave the user with a profile but no program (or vice versa).
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
 * **Important:** this function NO LONGER reads the profile before writing. The
 * caller is expected to verify the profile doesn't exist (typically by reading
 * the realtime snapshot in `UserDataProvider`) before invoking this. Doing the
 * "does it exist?" check via a `getDoc` race with the SDK's connection
 * handshake was causing spurious "client is offline" errors on cold start.
 *
 * The batch write itself is naturally idempotent at the data level: if it
 * somehow runs while a profile exists, it overwrites with the same default
 * shape (modulo `createdAt` which gets re-stamped — not great, but the only
 * way that path triggers is a multi-tab race against an empty user).
 */
export async function ensureSeeded(
  user: User,
  db: Firestore = getFirebaseDb(),
): Promise<void> {
  const batch = writeBatch(db);
  const now = serverTimestamp();
  const profileRef = profilePath(user.uid, db);

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

  await batch.commit();
}
