import type { User } from "firebase/auth";
import {
  deleteDoc,
  getDocs,
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
  exercisesPath,
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
 * One-time migration: removes stale seeded exercise docs that shadow the
 * master list without carrying gifUrl / instructions data.
 *
 * Background: an earlier seed strategy copied EXERCISE_MASTER entries
 * directly into `users/{uid}/exercises/`. Those copies block the
 * `userExercises.get(id) ?? master.find(id)` lookup from ever reaching the
 * richer master data (gifUrl, instructions, etc.).
 *
 * A doc is considered a stale seed copy only when ALL conditions hold:
 *   1. Its id matches a master entry.
 *   2. Its name matches the master name (case-insensitive).
 *   3. It has no `source` field, or `source === "master"` (old seeder convention).
 *   4. It has no `apiId` field (API-imported docs have this).
 *   5. Its `gifUrl` is missing or empty (the smoking gun).
 *
 * Safety guards — skip the delete if the doc has:
 *   - `archived: true` (user deliberately archived it)
 *   - non-empty `notes` (user wrote something)
 *   - non-empty `aliases` that differ from master (user customised)
 *   - non-empty `equipments` array (enriched by API or user)
 *
 * Idempotent: after the first run the docs are gone, so subsequent calls
 * find nothing to delete and exit immediately.
 *
 * Errors are caught and logged — migration failure must not block sign-in.
 */
export async function migrateStaleSeededExercises(
  uid: string,
  db: Firestore = getFirebaseDb(),
): Promise<void> {
  try {
    const snap = await getDocs(exercisesPath(uid, db));
    if (snap.empty) return;

    const masterById = new Map(EXERCISE_MASTER.map((m) => [m.id, m]));
    const toDelete: string[] = [];
    const skipped: string[] = [];

    for (const docSnap of snap.docs) {
      // Use raw Firestore data (bypassing converter) so we can inspect fields
      // like `notes` that aren't in the typed Exercise interface but may exist
      // on stale seeded docs written by earlier code.
      const raw = docSnap.data() as Exercise & { notes?: string };
      const data = raw;
      const master = masterById.get(docSnap.id);

      // Condition 1: id must match a master entry
      if (!master) continue;

      // Condition 2: name must match master (case-insensitive)
      if (data.name?.toLowerCase() !== master.name.toLowerCase()) continue;

      // Condition 3: no source, or source === "master"
      if (data.source && data.source !== "master") continue;

      // Condition 4: no apiId
      if (data.apiId) continue;

      // Condition 5: gifUrl missing or empty (smoking gun)
      if (data.gifUrl && data.gifUrl.trim() !== "") continue;

      // Safety: skip archived docs
      if (data.archived === true) {
        skipped.push(docSnap.id);
        continue;
      }

      // Safety: skip if user wrote notes
      if (data.notes && String(data.notes).trim() !== "") {
        skipped.push(docSnap.id);
        continue;
      }

      // Safety: skip if equipments is non-empty (enriched/API source)
      if (Array.isArray(data.equipments) && data.equipments.length > 0) {
        skipped.push(docSnap.id);
        continue;
      }

      // Safety: skip if aliases differ from master (user customised)
      const masterAliases = master.aliases ?? [];
      const docAliases: string[] = Array.isArray(data.aliases) ? data.aliases : [];
      const aliasesMatch =
        docAliases.length === masterAliases.length &&
        docAliases.every((a, i) => a.toLowerCase() === masterAliases[i]?.toLowerCase());
      if (docAliases.length > 0 && !aliasesMatch) {
        skipped.push(docSnap.id);
        continue;
      }

      toDelete.push(docSnap.id);
    }

    if (skipped.length > 0) {
      console.info(`Migration: skipping ${skipped.length} exercise docs with user data — ${skipped.join(", ")}`);
    }

    if (toDelete.length === 0) return;

    // Batch deletes in groups of 400 (Firestore limit is 500; use 400 for headroom)
    const BATCH_SIZE = 400;
    for (let i = 0; i < toDelete.length; i += BATCH_SIZE) {
      const chunk = toDelete.slice(i, i + BATCH_SIZE);
      if (chunk.length === 1) {
        await deleteDoc(exercisePath(uid, chunk[0], db));
      } else {
        const batch = writeBatch(db);
        for (const id of chunk) {
          batch.delete(exercisePath(uid, id, db));
        }
        await batch.commit();
      }
    }

    const names = toDelete.map((id) => masterById.get(id)?.name ?? id);
    console.info(`Migration: removed ${toDelete.length} stale seeded exercise docs (${names.join(", ")})`);
  } catch (err) {
    console.warn("Migration migrateStaleSeededExercises failed — will retry on next sign-in:", err);
  }
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

  // Run migration after profile/program seed so it doesn't block first-time setup.
  // Errors are caught inside the function — sign-in always proceeds.
  await migrateStaleSeededExercises(user.uid, db);
}
