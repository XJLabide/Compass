"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
  type QuerySnapshot,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, programPath, sessionsPath } from "@/lib/db/paths";
import type {
  Profile,
  ProgramDoc,
  SessionDoc,
} from "@/lib/db/types";
import {
  computeLocalDate,
  getLocalDayOfWeek,
  getTodayScheduled,
} from "@/lib/workout/scheduling";
import { checkAndAutoFinalize } from "@/lib/workout/recovery";
import SessionListItem from "@/components/workout/SessionListItem";
import ResumeBanner from "@/components/workout/ResumeBanner";
import Skeleton from "@/components/ui/Skeleton";

type RecentRow = { id: string; session: SessionDoc };

const RECENT_LIMIT = 5;

/**
 * `/workout` index.
 *
 * Sections:
 *   1. Today — shows the scheduled session name from the active program (or
 *      "Rest day"), plus a "Start session" CTA that writes a new in-progress
 *      session doc and routes to `/workout/[id]`.
 *   2. Recent — live `limit(5)` query of the user's sessions, newest first.
 *
 * All data is realtime via `onSnapshot`. The page is fully client-rendered
 * since auth and Firestore live on the client (see `src/lib/firebase.ts`).
 */
export default function WorkoutPage() {
  const router = useRouter();
  const { user } = useAuth();

  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [programLoaded, setProgramLoaded] = useState(false);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [recent, setRecent] = useState<RecentRow[] | null>(null);
  const [recentLoaded, setRecentLoaded] = useState(false);
  const [inProgress, setInProgress] = useState<RecentRow | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Subscribe to profile (for timezone) and active program (for today's slot).
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => {
        setProfile(snap.data() ?? null);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      programPath(user.uid),
      (snap) => {
        setProgram(snap.data() ?? null);
        setProgramLoaded(true);
      },
      (err) => {
        setLoadError(err.message);
        setProgramLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // Subscribe to the 5 most recent sessions. Realtime so finishing a session in
  // another tab updates this list.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      sessionsPath(user.uid),
      orderBy("date", "desc"),
      limit(RECENT_LIMIT),
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<SessionDoc>) => {
        setRecent(
          snap.docs.map((d) => ({ id: d.id, session: d.data() })),
        );
        setRecentLoaded(true);
      },
      (err) => {
        setLoadError(err.message);
        setRecent([]);
        setRecentLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // Subscribe to any in-progress sessions for the resume banner. We pick the
  // most-recently-started one if there are somehow multiple.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const q = query(
      sessionsPath(user.uid),
      where("status", "==", "in_progress"),
    );
    const unsub = onSnapshot(
      q,
      (snap: QuerySnapshot<SessionDoc>) => {
        if (snap.empty) {
          setInProgress(null);
          return;
        }
        // Pick the most recently started; fall back to first doc.
        let best: RecentRow | null = null;
        let bestMs = -Infinity;
        snap.docs.forEach((d) => {
          const data = d.data();
          const ts = data.startedAt as unknown as
            | { toMillis?: () => number }
            | undefined;
          const ms =
            ts && typeof ts.toMillis === "function" ? ts.toMillis() : 0;
          if (ms > bestMs) {
            bestMs = ms;
            best = { id: d.id, session: data };
          }
        });
        setInProgress(best);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // On mount (per uid), scan for in-progress sessions older than 24h and
  // auto-finalize them. Best-effort; we don't block render or surface errors
  // beyond the existing loadError channel for the query failure case.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    let cancelled = false;
    checkAndAutoFinalize(user.uid)
      .then((result) => {
        if (cancelled) return;
        if (result.errors.length > 0) {
          // eslint-disable-next-line no-console
          console.warn("Auto-finalize encountered errors:", result.errors);
        }
      })
      .catch((err) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console
        console.warn("Auto-finalize failed:", err);
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // Compute today's scheduled session from the active program.
  // ---------------------------------------------------------------------------
  const today = useMemo(() => {
    const tz = profile?.timezone || "UTC";
    const now = new Date();
    const dow = getLocalDayOfWeek(now, tz);
    return {
      localDate: computeLocalDate(now, tz),
      scheduled: getTodayScheduled(program, dow),
    };
  }, [program, profile?.timezone]);

  // ---------------------------------------------------------------------------
  // Start session: write an in-progress session doc and route to the logger.
  // ---------------------------------------------------------------------------
  const handleStart = useCallback(async () => {
    if (!user?.uid) return;
    if (today.scheduled.kind !== "session") return;
    setStarting(true);
    setStartError(null);
    try {
      const sessionsCol = sessionsPath(user.uid);
      const payload: Partial<SessionDoc> = {
        localDate: today.localDate,
        name: today.scheduled.session.name,
        programSessionId: today.scheduled.session.id,
        status: "in_progress",
        sets: [],
        // serverTimestamp() sentinels — converter passes through, Firestore
        // resolves at write time. Cast to satisfy the strict SessionDoc shape.
        date: serverTimestamp() as unknown as SessionDoc["date"],
        startedAt: serverTimestamp() as unknown as SessionDoc["startedAt"],
        createdAt: serverTimestamp() as unknown as SessionDoc["createdAt"],
        updatedAt: serverTimestamp() as unknown as SessionDoc["updatedAt"],
      };
      const ref = await addDoc(sessionsCol, payload as SessionDoc);
      router.push(`/workout/${ref.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start session.";
      setStartError(message);
      setStarting(false);
    }
  }, [user?.uid, today, router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section>
      <h1 className="text-2xl font-semibold text-neutral-100">Workout</h1>
      <p className="mt-2 text-sm text-muted">
        {today.localDate}
      </p>

      {loadError ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {loadError}
        </div>
      ) : null}

      {/* Resume in-progress session (if any) */}
      {user?.uid ? (
        <ResumeBanner uid={user.uid} inProgress={inProgress} />
      ) : null}

      {/* Today */}
      <div className="mt-6 rounded-xl border border-border bg-neutral-900/40 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Today
        </h2>
        {!programLoaded ? (
          <div className="mt-3 space-y-2">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-3 w-40" />
            <Skeleton className="h-11 w-full" />
          </div>
        ) : !program ? (
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              No program yet
            </p>
            <p className="mt-1 text-xs text-muted">
              Set up your program in Settings to see today&apos;s session.
            </p>
          </>
        ) : today.scheduled.kind === "session" ? (
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              {today.scheduled.session.name}
            </p>
            <p className="mt-1 text-xs text-muted">
              {today.scheduled.session.exercises.length} planned exercise
              {today.scheduled.session.exercises.length === 1 ? "" : "s"}
            </p>
            <button
              type="button"
              onClick={handleStart}
              disabled={starting}
              className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {starting ? "Starting…" : "Start session"}
            </button>
            {startError ? (
              <div
                role="alert"
                aria-live="polite"
                className="mt-3 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
              >
                {startError}
              </div>
            ) : null}
          </>
        ) : (
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              Rest day
            </p>
            <p className="mt-1 text-xs text-muted">
              No session scheduled for today. Recovery counts too.
            </p>
          </>
        )}
      </div>

      {/* Recent */}
      <div className="mt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Recent sessions
        </h2>
        {!recentLoaded ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : !recent || recent.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No sessions logged yet. Start your first one above.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {recent.map((row) => (
              <SessionListItem
                key={row.id}
                id={row.id}
                session={row.session}
              />
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
