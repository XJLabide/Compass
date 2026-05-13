"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, programPath, sessionPath } from "@/lib/db/paths";
import type {
  Exercise,
  LoggedSet,
  PlannedExercise,
  Profile,
  ProgramDoc,
  SessionDoc,
} from "@/lib/db/types";

import ExerciseCard from "@/components/workout/ExerciseCard";
import QuickAddExercise from "@/components/workout/QuickAddExercise";
import {
  computeDurationMin,
  loadLastSessionPrefill,
  toMillis,
  type PrefillMap,
} from "@/lib/workout/prefill";
import { finishSession as runPRDetection } from "@/lib/workout/finishSession";

/**
 * `/workout/[id]` — live session logger.
 *
 * Responsibilities now (fn-4-p9x.2 + .3):
 *   - Subscribe to the session, profile (unit system), and active program.
 *   - Render one `ExerciseCard` per planned exercise plus any unplanned
 *     exercises the user has quick-added (which surface via session.sets
 *     entries whose exerciseId doesn't match a planned slot).
 *   - Append-only writes to `sets[]` via immutable replacement.
 *   - Cross-session prefill (.3): on mount, fetch the most recent COMPLETED
 *     session of the same `programSessionId`, derive the heaviest set per
 *     exerciseId, and pass as a "ghost" hint to each card.
 *   - Quick-add unplanned exercise (.3): appends a placeholder zero-set to
 *     `sets[]` so the exercise surfaces as its own card.
 *   - Finish session (.3): write `status=completed`, `finishedAt`,
 *     `durationMin`, fire the (placeholder) PR detection hook, and route
 *     back to `/workout`.
 *
 * Out of scope:
 *   - PR detection logic (.4) — wired via `runPRDetectionPlaceholder`.
 *   - In-progress session recovery + 48h edit window (.5).
 *
 * Fallback when `programSessionId` is missing / legacy: we synthesize one
 * `PlannedExercise` per distinct exerciseId already present in `sets[]` so
 * the lifter keeps a usable surface.
 */
export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const router = useRouter();
  const { user } = useAuth();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [lastSessionPrefill, setLastSessionPrefill] = useState<PrefillMap>(
    () => new Map(),
  );

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // ---------------------------------------------------------------------------
  // Realtime subscriptions
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid || !sessionId) return;
    const unsub = onSnapshot(
      sessionPath(user.uid, sessionId),
      (snap) => {
        setSession(snap.data() ?? null);
        setLoaded(true);
      },
      (err) => {
        setError(err.message);
        setLoaded(true);
      },
    );
    return () => unsub();
  }, [user?.uid, sessionId]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      programPath(user.uid),
      (snap) => setProgram(snap.data() ?? null),
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      profilePath(user.uid),
      (snap) => setProfile(snap.data() ?? null),
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // Cross-session prefill: fetch the most-recent completed session of the
  // same program slot once we know the session's slot id. One-shot fetch on
  // mount (not subscribed) — historical data doesn't change during a workout.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid || !sessionId) return;
    const slotId = session?.programSessionId;
    if (!slotId) {
      setLastSessionPrefill(new Map());
      return;
    }
    let cancelled = false;
    loadLastSessionPrefill(user.uid, slotId, sessionId)
      .then((map) => {
        if (!cancelled) setLastSessionPrefill(map);
      })
      .catch((err) => {
        // Non-fatal: prefill is a hint, not load-bearing.
        if (!cancelled) {
          // eslint-disable-next-line no-console
          console.warn("Last-session prefill load failed:", err);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, sessionId, session?.programSessionId]);

  // ---------------------------------------------------------------------------
  // Plan resolution: planned exercises this session is meant to follow,
  // plus any quick-added unplanned exercises.
  // ---------------------------------------------------------------------------
  const plannedExercises: PlannedExercise[] = useMemo(() => {
    if (!session) return [];

    const planned: PlannedExercise[] = [];
    const seen = new Set<string>();

    if (session.programSessionId && program) {
      const slot = program.sessions.find(
        (s) => s.id === session.programSessionId,
      );
      if (slot) {
        const inOrder = [...slot.exercises].sort((a, b) => a.order - b.order);
        inOrder.forEach((p) => {
          planned.push(p);
          seen.add(p.exerciseId);
        });
      }
    }

    // Append any exerciseId in `sets[]` that's NOT in the planned list —
    // these are quick-added (unplanned / freeform) exercises. They render
    // as a no-target card so the user can keep logging sets to them.
    const sets = session.sets ?? [];
    let nextOrder = planned.length;
    sets.forEach((s) => {
      if (seen.has(s.exerciseId)) return;
      seen.add(s.exerciseId);
      planned.push({
        exerciseId: s.exerciseId,
        name: s.exerciseId, // best-effort; real Exercise.name not denormed here
        targetSets: 0,
        repRangeLow: 0,
        repRangeHigh: 0,
        order: nextOrder++,
      });
    });

    return planned;
  }, [session, program]);

  // Group logged sets by exercise for cheap lookup in the render loop.
  // We also strip out any "placeholder" zero-set we wrote on quick-add to
  // anchor the exercise into the session: a set with weight=0 AND reps=0 is
  // not a real logged set, just a marker.
  const setsByExercise = useMemo(() => {
    const map = new Map<string, LoggedSet[]>();
    (session?.sets ?? []).forEach((set) => {
      if (set.weightKg === 0 && set.reps === 0) return; // placeholder anchor
      const arr = map.get(set.exerciseId) ?? [];
      arr.push(set);
      map.set(set.exerciseId, arr);
    });
    return map;
  }, [session?.sets]);

  // ---------------------------------------------------------------------------
  // Persistence: append a single new set via immutable replacement of sets[].
  // ---------------------------------------------------------------------------
  const handleLogSet = useCallback(
    async (input: {
      exerciseId: string;
      weightKg: number;
      reps: number;
      rpe?: number;
    }) => {
      if (!user?.uid || !sessionId || !session) {
        throw new Error("Session not ready.");
      }
      const existing = session.sets ?? [];
      const nextOrder =
        existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      const newSet: LoggedSet = {
        exerciseId: input.exerciseId,
        weightKg: input.weightKg,
        reps: input.reps,
        order: nextOrder,
        ...(typeof input.rpe === "number" ? { rpe: input.rpe } : {}),
      };
      const nextSets: LoggedSet[] = [...existing, newSet];

      const patch: { sets: LoggedSet[]; updatedAt: FieldValue } = {
        sets: nextSets,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(user.uid, sessionId), patch);
    },
    [user?.uid, sessionId, session],
  );

  // ---------------------------------------------------------------------------
  // Quick-add unplanned exercise: append a "placeholder" zero set so the
  // exercise surfaces as its own card immediately. The placeholder is hidden
  // from the per-exercise logged list (see `setsByExercise` above) and is
  // pruned again at finish time before computing duration / PRs.
  // ---------------------------------------------------------------------------
  const handleQuickAdd = useCallback(
    async (input: { exerciseId: string; exercise: Exercise }) => {
      if (!user?.uid || !sessionId || !session) return;
      const existing = session.sets ?? [];
      // If the exercise is already represented (planned or previously added),
      // don't append a second placeholder.
      const alreadyPresent =
        existing.some((s) => s.exerciseId === input.exerciseId) ||
        (program?.sessions
          .find((s) => s.id === session.programSessionId)
          ?.exercises.some((e) => e.exerciseId === input.exerciseId) ??
          false);
      if (alreadyPresent) return;

      const nextOrder =
        existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      const anchor: LoggedSet = {
        exerciseId: input.exerciseId,
        weightKg: 0,
        reps: 0,
        order: nextOrder,
      };
      const patch: { sets: LoggedSet[]; updatedAt: FieldValue } = {
        sets: [...existing, anchor],
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(user.uid, sessionId), patch);
    },
    [user?.uid, sessionId, session, program],
  );

  // ---------------------------------------------------------------------------
  // Finish session: flip status, write finishedAt + durationMin, prune the
  // placeholder anchors for any quick-added exercises that never got a real
  // set logged against them, then run PR detection (placeholder for now).
  // Routes back to /workout on success.
  // ---------------------------------------------------------------------------
  const handleFinish = useCallback(async () => {
    if (!user?.uid || !sessionId || !session) return;
    if (finishing) return;
    setFinishing(true);
    setFinishError(null);
    try {
      const startedMs = toMillis(session.startedAt) ?? Date.now();
      const finishedMs = Date.now();
      const durationMin = computeDurationMin(startedMs, finishedMs);

      // Prune zero/zero placeholder anchors so they don't pollute history.
      const cleanedSets = (session.sets ?? []).filter(
        (s) => !(s.weightKg === 0 && s.reps === 0),
      );

      const patch: {
        status: "completed";
        finishedAt: FieldValue;
        durationMin: number;
        sets: LoggedSet[];
        updatedAt: FieldValue;
      } = {
        status: "completed",
        finishedAt: serverTimestamp(),
        durationMin,
        sets: cleanedSets,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(user.uid, sessionId), patch);

      // PR detection (fn-4-p9x.4). Best-effort: if it throws we surface a
      // non-fatal warning rather than blocking the route — the session is
      // already persisted as `completed` above.
      try {
        await runPRDetection(user.uid, sessionId);
      } catch (prErr) {
        // eslint-disable-next-line no-console
        console.warn("PR detection failed:", prErr);
      }

      router.push("/workout");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to finish session.";
      setFinishError(message);
      setFinishing(false);
    }
  }, [user?.uid, sessionId, session, finishing, router]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const unitSystem = profile?.unitSystem ?? "metric";
  const inProgress = session?.status === "in_progress";
  const totalSets = (session?.sets ?? []).filter(
    (s) => !(s.weightKg === 0 && s.reps === 0),
  ).length;

  return (
    <section className="pb-24">
      <Link
        href="/workout"
        className="text-xs font-medium text-muted hover:text-neutral-200"
      >
        ← Workout
      </Link>

      <div className="mt-2 flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-100">
          {session?.name ?? "Session"}
        </h1>
        {inProgress ? (
          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
            In progress
          </span>
        ) : null}
      </div>
      <p className="mt-1 text-xs text-muted">
        {session?.localDate ?? "—"}
        <span aria-hidden="true"> · </span>
        {totalSets} {totalSets === 1 ? "set" : "sets"} logged
      </p>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {!loaded ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : !session ? (
        <p className="mt-6 text-sm text-muted">Session not found.</p>
      ) : (
        <>
          {plannedExercises.length === 0 ? (
            <p className="mt-6 text-sm text-muted">
              No exercises planned for this session yet. Add one below.
            </p>
          ) : (
            <div className="mt-6 space-y-4">
              {plannedExercises.map((planned) => (
                <ExerciseCard
                  key={planned.exerciseId}
                  planned={planned}
                  loggedSetsForExercise={
                    setsByExercise.get(planned.exerciseId) ?? []
                  }
                  unitSystem={unitSystem}
                  lastSessionGhost={lastSessionPrefill.get(planned.exerciseId)}
                  onLogSet={handleLogSet}
                />
              ))}
            </div>
          )}

          {user?.uid && inProgress ? (
            <QuickAddExercise
              uid={user.uid}
              onSelect={handleQuickAdd}
              disabled={finishing}
            />
          ) : null}

          {inProgress ? (
            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={handleFinish}
                disabled={finishing}
                className="inline-flex h-11 w-full items-center justify-center rounded-lg bg-accent2 px-4 text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {finishing ? "Finishing…" : "Finish session"}
              </button>
              {finishError ? (
                <div
                  role="alert"
                  aria-live="polite"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
                >
                  {finishError}
                </div>
              ) : null}
            </div>
          ) : null}
        </>
      )}
    </section>
  );
}
