import type { User } from "firebase/auth";
import { serverTimestamp, setDoc, type Firestore } from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";
import { DEFAULT_TIME_BLOCKS } from "@/lib/routines/helpers";
import { profilePath } from "./paths";
import type { Profile } from "./types";

/** Defaults for a new account. Zero means the optional target is unset. */
const DEFAULT_PROFILE: Omit<
  Profile,
  "createdAt" | "updatedAt" | "displayName"
> = {
  unitSystem: "imperial",
  proteinTargetG: 0,
  weeklyGainLb: 0,
  currency: "PHP",
  timezone: "UTC",
  routineTimeBlocks: DEFAULT_TIME_BLOCKS,
};

function resolveTimezone(): string {
  try {
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof timezone === "string" && timezone.length > 0
      ? timezone
      : "UTC";
  } catch {
    return "UTC";
  }
}

function deriveDisplayName(user: User): string {
  return user.displayName?.trim() || user.email?.split("@")[0] || "Athlete";
}

/**
 * Create only the owner's profile for a new account. Existing records are not
 * imported or migrated, and workout programs remain an explicit user choice.
 * The caller checks the realtime profile snapshot before invoking this.
 */
export async function ensureSeeded(
  user: User,
  db: Firestore = getFirebaseDb(),
): Promise<void> {
  const now = serverTimestamp();
  const profile: Profile = {
    displayName: deriveDisplayName(user),
    ...DEFAULT_PROFILE,
    timezone: resolveTimezone(),
    createdAt: now as unknown as Profile["createdAt"],
    updatedAt: now as unknown as Profile["updatedAt"],
  };

  await setDoc(profilePath(user.uid, db), profile);
}
