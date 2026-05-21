"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { FirebaseError } from "firebase/app";
import { onSnapshot } from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { isAllowed } from "@/lib/auth/allowlist";
import { profilePath, programPath } from "@/lib/db/paths";
import { ensureSeeded, migrateStaleSeededExercises } from "@/lib/db/seed";
import type { Profile, ProgramDoc } from "@/lib/db/types";

type UserDataContextValue = {
  uid: string | null;
  /** Raw profile doc, or null if it hasn't been seeded yet. */
  profile: Profile | null;
  /** True once the profile snapshot has produced its first value (doc or null). */
  profileLoaded: boolean;
  /** Fallback profile that's safe to render against even when the doc is missing. */
  effectiveProfile: Profile | null;
  /** Active program doc; null when not seeded yet. */
  program: ProgramDoc | null;
  programLoaded: boolean;
  /** Last *non-transient* subscription error, surfaced for banner display. */
  error: string | null;
  /** Surfaced seed error (permission-denied / permanent failures only). */
  seedError: string | null;
  /** Force a re-attempt of the first-run seed. */
  retrySeed: () => void;
};

const UserDataContext = createContext<UserDataContextValue | null>(null);

function detectTimezone(): string {
  try {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    return typeof tz === "string" && tz.length > 0 ? tz : "UTC";
  } catch {
    return "UTC";
  }
}

/**
 * Firestore error codes that are *transient* — connection hasn't settled, the
 * SDK is offline, or the request was preempted. We retry these silently with
 * backoff instead of surfacing to the user.
 */
const TRANSIENT_CODES = new Set([
  "unavailable",
  "deadline-exceeded",
  "aborted",
  "internal",
  "cancelled",
  "resource-exhausted",
  "failed-precondition", // includes the "client is offline" path
  "unknown",
]);

function isTransientError(err: unknown): boolean {
  if (err instanceof FirebaseError) {
    if (TRANSIENT_CODES.has(err.code)) return true;
    // Firestore error codes are namespaced "firestore/<code>" via .code OR
    // exposed as bare codes. Handle both.
    const bare = err.code.replace(/^firestore\//, "");
    if (TRANSIENT_CODES.has(bare)) return true;
  }
  if (err instanceof Error) {
    const msg = err.message.toLowerCase();
    if (msg.includes("client is offline")) return true;
    if (msg.includes("network")) return true;
    if (msg.includes("backend didn't respond")) return true;
  }
  return false;
}

const MAX_RETRIES = 8;
const BASE_DELAY_MS = 800;

export function UserDataProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const uid = user?.uid ?? null;

  const [profile, setProfile] = useState<Profile | null>(null);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [programLoaded, setProgramLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [seedError, setSeedError] = useState<string | null>(null);
  const [seedNonce, setSeedNonce] = useState(0);

  // Track an in-flight seed so we don't fire multiple concurrent writes when
  // the snapshot re-emits before the first attempt resolves.
  const seedingRef = useRef(false);

  useEffect(() => {
    if (!uid) {
      setProfile(null);
      setProfileLoaded(false);
      return;
    }
    setProfileLoaded(false);
    const unsub = onSnapshot(
      profilePath(uid),
      (snap) => {
        setProfile(snap.data() ?? null);
        setProfileLoaded(true);
        // Transient snapshot errors don't clear this; only success does.
        setError(null);
      },
      (err) => {
        // Transient errors: keep profileLoaded false so callers wait for the
        // real result. Snapshot listeners auto-retry the underlying stream.
        if (isTransientError(err)) return;
        setError(err.message);
        setProfileLoaded(true);
      },
    );
    return () => unsub();
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      setProgram(null);
      setProgramLoaded(false);
      return;
    }
    setProgramLoaded(false);
    const unsub = onSnapshot(
      programPath(uid),
      (snap) => {
        setProgram(snap.data() ?? null);
        setProgramLoaded(true);
      },
      (err) => {
        if (isTransientError(err)) return;
        setProgramLoaded(true);
      },
    );
    return () => unsub();
  }, [uid]);

  // -------------------------------------------------------------------------
  // First-run seed, driven by the realtime snapshot.
  //
  // We only attempt to write when:
  //   - The user is signed in and on the allowlist
  //   - The profile snapshot has resolved AND came back empty
  //   - We're not already mid-write
  //
  // Transient failures retry with exponential backoff and never surface to the
  // user. Permanent failures (permission-denied) flip `seedError` to show the
  // banner.
  // -------------------------------------------------------------------------
  useEffect(() => {
    if (!user) return;
    if (!isAllowed(user.email)) return;
    if (!profileLoaded) return;
    if (profile) {
      // Already seeded — clear any leftover error from a prior cold start.
      setSeedError(null);
      return;
    }
    if (seedingRef.current) return;

    seedingRef.current = true;
    let cancelled = false;
    let attempt = 0;

    const tryOnce = async (): Promise<void> => {
      try {
        await ensureSeeded(user);
        if (!cancelled) setSeedError(null);
      } catch (err) {
        if (cancelled) return;
        if (isTransientError(err) && attempt < MAX_RETRIES) {
          attempt += 1;
          const delay = Math.min(
            BASE_DELAY_MS * 2 ** (attempt - 1),
            30_000,
          );
          await new Promise((r) => setTimeout(r, delay));
          if (cancelled) return;
          return tryOnce();
        }
        const message =
          err instanceof Error ? err.message : "Failed to set up your data.";
        setSeedError(message);
        // eslint-disable-next-line no-console
        console.error("[seed] gave up after retries:", err);
      }
    };

    void tryOnce().finally(() => {
      seedingRef.current = false;
    });

    return () => {
      cancelled = true;
    };
  }, [user, profileLoaded, profile, seedNonce]);

  // -------------------------------------------------------------------------
  // Migration: run migrateStaleSeededExercises once per user sign-in for ALL
  // users (seeded or not). The migration is idempotent — it's a no-op when
  // there's nothing to delete. We gate on a ref to prevent re-runs on every
  // render. Runs fire-and-forget; failure is logged but never surfaces to UI.
  // -------------------------------------------------------------------------
  const migratedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!user) return;
    if (!isAllowed(user.email)) return;
    if (migratedRef.current === user.uid) return;
    migratedRef.current = user.uid;
    migrateStaleSeededExercises(user.uid).catch((err) => {
      // eslint-disable-next-line no-console
      console.warn("[migration] migrateStaleSeededExercises failed:", err);
    });
  }, [user]);

  const retrySeed = useCallback(() => {
    setSeedError(null);
    setSeedNonce((n) => n + 1);
  }, []);

  const effectiveProfile = useMemo<Profile | null>(() => {
    if (profile) return profile;
    if (!profileLoaded) return null;
    return {
      displayName: user?.displayName ?? "",
      unitSystem: "imperial",
      proteinTargetG: 0,
      weeklyGainLb: 0,
      timezone: detectTimezone(),
      createdAt: undefined as unknown as Profile["createdAt"],
      updatedAt: undefined as unknown as Profile["updatedAt"],
    };
  }, [profile, profileLoaded, user?.displayName]);

  const value = useMemo<UserDataContextValue>(
    () => ({
      uid,
      profile,
      profileLoaded,
      effectiveProfile,
      program,
      programLoaded,
      error,
      seedError,
      retrySeed,
    }),
    [
      uid,
      profile,
      profileLoaded,
      effectiveProfile,
      program,
      programLoaded,
      error,
      seedError,
      retrySeed,
    ],
  );

  return (
    <UserDataContext.Provider value={value}>
      {children}
    </UserDataContext.Provider>
  );
}

export function useUserData(): UserDataContextValue {
  const ctx = useContext(UserDataContext);
  if (!ctx) {
    throw new Error("useUserData must be used within <UserDataProvider>");
  }
  return ctx;
}
