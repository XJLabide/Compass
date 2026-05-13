"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  onSnapshot,
  serverTimestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, programPath, sessionPath } from "@/lib/db/paths";
import type {
  LoggedSet,
  PlannedExercise,
  Profile,
  ProgramDoc,
  SessionDoc,
} from "@/lib/db/types";

import ExerciseCard from "@/components/workout/ExerciseCard";

/**
 * `/workout/[id]` — live session logger.
 *
 * Responsibilities (this task, fn-4-p9x.2):
 *   - Subscribe to the session doc, the user's profile (for unit system),
 *     and the active program (to look up the planned exercises for this
 *     session's `programSessionId`).
 *   - Render one `ExerciseCard` per planned exercise, in the program's
 *     declared order.
 *   - On each "Log set" callback from a card, perform an **immutable**
 *     replacement of the session's `sets[]` array via `updateDoc`. Reading
 *     the latest snapshot before each write keeps two tabs editing the same
 *     session from clobbering each other: we never use `arrayUnion` on a
 *     stale array, and we never write the whole doc.
 *
 * Out of scope (later tasks of this epic):
 *   - Quick-add unplanned exercises (.3)
 *   - PR detection and finishing the session (.4)
 *   - Last-session prefill across sessions (.4)
 *
 * If the session doc has no `programSessionId` (free-form / legacy), we fall
 * back to grouping by whatever `exerciseId`s already appear in `sets[]` and
 * synthesize minimal `PlannedExercise` rows for them so the lifter still has
 * a usable surface. Quick-add will be the real escape hatch.
 */
export default function WorkoutSessionPage() {
  const params = useParams<{ id: string }>();
  const sessionId = params?.id;
  const { user } = useAuth();

  const [session, setSession] = useState<SessionDoc | null>(null);
  const [program, setProgram] = useState<ProgramDoc | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);

  const [loaded, setLoaded] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  // Plan resolution: planned exercises this session is meant to follow.
  // ---------------------------------------------------------------------------
  const plannedExercises: PlannedExercise[] = useMemo(() => {
    if (!session) return [];

    if (session.programSessionId && program) {
      const slot = program.sessions.find(
        (s) => s.id === session.programSessionId,
      );
      if (slot) {
        return [...slot.exercises].sort((a, b) => a.order - b.order);
      }
    }

    // Fallback: synthesize one "planned" entry per distinct exerciseId that
    // already has at least one logged set, so the user can keep editing.
    const sets = session.sets ?? [];
    const seen = new Map<string, PlannedExercise>();
    sets.forEach((s, idx) => {
      if (!seen.has(s.exerciseId)) {
        seen.set(s.exerciseId, {
          exerciseId: s.exerciseId,
          name: s.exerciseId, // best-effort label; real name lives on Exercise doc
          targetSets: 0,
          repRangeLow: 0,
          repRangeHigh: 0,
          order: idx,
        });
      }
    });
    return Array.from(seen.values());
  }, [session, program]);

  // Group logged sets by exercise for cheap lookup in the render loop.
  const setsByExercise = useMemo(() => {
    const map = new Map<string, LoggedSet[]>();
    (session?.sets ?? []).forEach((set) => {
      const arr = map.get(set.exerciseId) ?? [];
      arr.push(set);
      map.set(set.exerciseId, arr);
    });
    return map;
  }, [session?.sets]);

  // ---------------------------------------------------------------------------
  // Persistence: append a single new set via immutable replacement of sets[].
  //
  // We deliberately do NOT use `arrayUnion` here:
  //   - arrayUnion deduplicates by deep equality, so two identical sets
  //     (same weight, reps, rpe, exerciseId, order) would silently collapse.
  //   - We need a deterministic `order` field per set, and computing the
  //     next order requires reading the current array anyway.
  // We also do NOT write the whole session doc — only the `sets`,
  // `updatedAt` fields — so concurrent edits to other fields (notes,
  // finishedAt, etc.) from another tab survive.
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
        // Only include rpe if defined — Firestore rejects `undefined` values
        // and the security rules forbid keys not in the allowlist with null.
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
  // Render
  // ---------------------------------------------------------------------------
  const unitSystem = profile?.unitSystem ?? "metric";
  const inProgress = session?.status === "in_progress";
  const totalSets = session?.sets?.length ?? 0;

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
      ) : plannedExercises.length === 0 ? (
        <p className="mt-6 text-sm text-muted">
          No exercises planned for this session yet.
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
              onLogSet={handleLogSet}
            />
          ))}
        </div>
      )}
    </section>
  );
}
