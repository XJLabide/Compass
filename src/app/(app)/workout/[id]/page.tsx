"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  onSnapshot,
  serverTimestamp,
  Timestamp,
  updateDoc,
  type FieldValue,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { exercisesPath, profilePath, programPath, sessionPath } from "@/lib/db/paths";
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
import EditPlannedExercisesDialog, {
  type PlannedExerciseSwap,
} from "@/components/workout/EditPlannedExercisesDialog";
import SaveSwapPrompt from "@/components/workout/SaveSwapPrompt";
import {
  computeDurationMin,
  loadLastSessionPrefill,
  toMillis,
  type PrefillMap,
} from "@/lib/workout/prefill";
import { finishSession as runPRDetection } from "@/lib/workout/finishSession";
import { isPastEditWindow } from "@/lib/workout/recovery";
import { applyProgramSwap } from "@/lib/workout/applyProgramSwap";
import { getMasterExercise } from "@/lib/workout/exerciseSubs";
import { isPlaceholderSet } from "@/lib/workout/placeholderSet";
import { Calendar, Pencil } from "lucide-react";

/** Format a YYYY-MM-DD string for display, e.g. "May 22, 2026". */
function formatLocalDate(yyyyMmDd: string): string {
  // Parse as local midnight to avoid UTC-shift display issues.
  const [year, month, day] = yyyyMmDd.split("-").map(Number);
  return new Date(year, (month ?? 1) - 1, day ?? 1).toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/** Return today's date as YYYY-MM-DD in local time. */
function todayLocalDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Return the date 2 years ago as YYYY-MM-DD. */
function twoYearsAgoDate(): string {
  const now = new Date();
  const y = now.getFullYear() - 2;
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** Parse a YYYY-MM-DD string and return a Date at local midnight. */
function parseLocalDateAtMidnight(yyyyMmDd: string): Date {
  return new Date(`${yyyyMmDd}T00:00:00`);
}

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

  /** User's own exercise collection — keyed by exerciseId. Provides gifUrl /
   * instructions for exercises imported from ExerciseDB or created custom. */
  const [userExercises, setUserExercises] = useState<Map<string, Exercise>>(
    () => new Map(),
  );

  const [finishing, setFinishing] = useState(false);
  const [finishError, setFinishError] = useState<string | null>(null);

  // Date edit popover state.
  const [datePopoverOpen, setDatePopoverOpen] = useState(false);
  const [datePicked, setDatePicked] = useState<string>("");
  const [dateSaving, setDateSaving] = useState(false);
  const [dateError, setDateError] = useState<string | null>(null);
  const datePopoverRef = useRef<HTMLDivElement>(null);

  // Close date popover on outside click.
  useEffect(() => {
    if (!datePopoverOpen) return;
    function handleClick(e: MouseEvent) {
      if (
        datePopoverRef.current &&
        !datePopoverRef.current.contains(e.target as Node)
      ) {
        setDatePopoverOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [datePopoverOpen]);

  const handleDateEditOpen = useCallback(() => {
    setDatePicked(session?.localDate ?? todayLocalDate());
    setDateError(null);
    setDatePopoverOpen(true);
  }, [session?.localDate]);

  const handleDateSave = useCallback(async () => {
    if (!user?.uid || !sessionId || !session || !datePicked) return;
    setDateSaving(true);
    setDateError(null);
    try {
      const newStartedAt = Timestamp.fromDate(parseLocalDateAtMidnight(datePicked));
      await updateDoc(sessionPath(user.uid, sessionId), {
        localDate: datePicked,
        startedAt: newStartedAt,
        updatedAt: serverTimestamp(),
      });
      setDatePopoverOpen(false);
    } catch (err) {
      setDateError(err instanceof Error ? err.message : "Failed to update date.");
    } finally {
      setDateSaving(false);
    }
  }, [user?.uid, sessionId, session, datePicked]);

  // Mid-session edit state.
  const [editOpen, setEditOpen] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  /** Swap prompts queued by the most recent edit-save. Drained one at a time. */
  const [swapQueue, setSwapQueue] = useState<PlannedExerciseSwap[]>([]);
  const [savingSwap, setSavingSwap] = useState(false);

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

  // Subscribe to the user's own exercise library so gifUrl / instructions are
  // available for ExerciseDB-imported and custom exercises (not just master).
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      exercisesPath(user.uid),
      (snap) => {
        const map = new Map<string, Exercise>();
        snap.forEach((doc) => map.set(doc.id, doc.data()));
        setUserExercises(map);
      },
      (err) => {
        // Non-fatal: master data still used as fallback.
        // eslint-disable-next-line no-console
        console.warn("User exercises subscription error:", err);
      },
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

    // Prefer the per-session override when present (the user edited this
    // session's plan). Otherwise fall back to the program template.
    if (session.plannedExercises && session.plannedExercises.length > 0) {
      const inOrder = [...session.plannedExercises].sort(
        (a, b) => a.order - b.order,
      );
      inOrder.forEach((p) => {
        planned.push(p);
        seen.add(p.exerciseId);
      });
    } else if (session.programSessionId && program) {
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
    // these are quick-added (unplanned / freeform) exercises OR previously
    // logged exercises whose planned entry was removed mid-session. They
    // render as a no-target card so the user can keep viewing/logging.
    const sets = session.sets ?? [];
    let nextOrder = planned.length;
    sets.forEach((s) => {
      if (seen.has(s.exerciseId)) return;
      seen.add(s.exerciseId);
      planned.push({
        exerciseId: s.exerciseId,
        name: getMasterExercise(s.exerciseId)?.name ?? s.exerciseId,
        targetSets: 0,
        repRangeLow: 0,
        repRangeHigh: 0,
        order: nextOrder++,
      });
    });

    return planned;
  }, [session, program]);

  // Group logged sets by exercise for cheap lookup in the render loop.
  // We also strip out any "placeholder" set we wrote on quick-add to anchor
  // the exercise into the session: a set marked `placeholder: true` (or, for
  // legacy docs, a 0×0 set with no `placeholder` field) is not a real logged
  // set, just a marker. See `isPlaceholderSet` for the full rule.
  const setsByExercise = useMemo(() => {
    const map = new Map<string, LoggedSet[]>();
    (session?.sets ?? []).forEach((set) => {
      if (isPlaceholderSet(set)) return;
      const arr = map.get(set.exerciseId) ?? [];
      arr.push(set);
      map.set(set.exerciseId, arr);
    });
    return map;
  }, [session?.sets]);

  // ---------------------------------------------------------------------------
  // Exercise definition lookup: user collection wins over master data so
  // ExerciseDB-imported and custom exercises surface their gifUrl/instructions.
  // ---------------------------------------------------------------------------
  const getExerciseDef = useCallback(
    (
      exerciseId: string,
    ): Pick<Exercise, "name" | "gifUrl" | "instructions"> | null => {
      const userEx = userExercises.get(exerciseId);
      if (userEx) return userEx;
      const masterEx = getMasterExercise(exerciseId);
      return masterEx ?? null;
    },
    [userExercises],
  );

  // ---------------------------------------------------------------------------
  // Persistence: append a single new set via immutable replacement of sets[].
  // ---------------------------------------------------------------------------
  const handleLogSet = useCallback(
    async (input: {
      exerciseId: string;
      weightKg: number;
      reps: number;
      rpe?: number;
      setCount: number;
    }) => {
      if (!user?.uid || !sessionId || !session) {
        throw new Error("Session not ready.");
      }
      // Defensive clamp — the SetRow stepper already enforces [1, 10] but
      // we don't trust the call site to have done that.
      const count = Math.max(1, Math.min(10, Math.floor(input.setCount)));
      const existing = session.sets ?? [];
      const baseOrder =
        existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      // Build N identical sets with sequential order numbers
      // (baseOrder + 0, baseOrder + 1, ..., baseOrder + count - 1) and append
      // all of them in a single immutable replacement so the write is atomic
      // and onSnapshot fires once with the final state.
      const newSets: LoggedSet[] = Array.from({ length: count }, (_, i) => ({
        exerciseId: input.exerciseId,
        weightKg: input.weightKg,
        reps: input.reps,
        order: baseOrder + i,
        ...(typeof input.rpe === "number" ? { rpe: input.rpe } : {}),
      }));
      const nextSets: LoggedSet[] = [...existing, ...newSets];

      const patch: { sets: LoggedSet[]; updatedAt: FieldValue } = {
        sets: nextSets,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(user.uid, sessionId), patch);
    },
    [user?.uid, sessionId, session],
  );

  // ---------------------------------------------------------------------------
  // Edit an already-logged set: find by order, apply updates, write atomically.
  // ---------------------------------------------------------------------------
  const handleEditSet = useCallback(
    async (
      setOrder: number,
      updates: { weightKg: number; reps: number; rpe?: number },
    ) => {
      if (!user?.uid || !sessionId || !session) {
        throw new Error("Session not ready.");
      }
      const existing = session.sets ?? [];
      const nextSets: LoggedSet[] = existing.map((s) =>
        s.order === setOrder
          ? {
              ...s,
              weightKg: updates.weightKg,
              reps: updates.reps,
              ...(typeof updates.rpe === "number"
                ? { rpe: updates.rpe }
                : { rpe: undefined }),
            }
          : s,
      );
      const patch: { sets: LoggedSet[]; updatedAt: FieldValue } = {
        sets: nextSets,
        updatedAt: serverTimestamp(),
      };
      await updateDoc(sessionPath(user.uid, sessionId), patch);
    },
    [user?.uid, sessionId, session],
  );

  // ---------------------------------------------------------------------------
  // Delete an already-logged set: filter out by order, write atomically.
  // ---------------------------------------------------------------------------
  const handleDeleteSet = useCallback(
    async (setOrder: number) => {
      if (!user?.uid || !sessionId || !session) {
        throw new Error("Session not ready.");
      }
      const existing = session.sets ?? [];
      const nextSets: LoggedSet[] = existing.filter(
        (s) => s.order !== setOrder,
      );
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
      // If the exercise is already represented (planned in the per-session
      // override, planned in the program template, or previously logged in
      // sets), don't append a second placeholder.
      const inOverride =
        session.plannedExercises?.some(
          (p) => p.exerciseId === input.exerciseId,
        ) ?? false;
      const inProgram =
        !session.plannedExercises &&
        (program?.sessions
          .find((s) => s.id === session.programSessionId)
          ?.exercises.some((e) => e.exerciseId === input.exerciseId) ??
          false);
      const alreadyPresent =
        existing.some((s) => s.exerciseId === input.exerciseId) ||
        inOverride ||
        inProgram;
      if (alreadyPresent) return;

      const nextOrder =
        existing.reduce((max, s) => Math.max(max, s.order), -1) + 1;
      const anchor: LoggedSet = {
        exerciseId: input.exerciseId,
        weightKg: 0,
        reps: 0,
        order: nextOrder,
        placeholder: true,
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

      // Prune placeholder anchors so they don't pollute history.
      const cleanedSets = (session.sets ?? []).filter(
        (s) => !isPlaceholderSet(s),
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
  // Mid-session edit handlers.
  // ---------------------------------------------------------------------------
  const loggedExerciseIds = useMemo(() => {
    const s = new Set<string>();
    (session?.sets ?? []).forEach((set) => {
      if (isPlaceholderSet(set)) return;
      s.add(set.exerciseId);
    });
    return s;
  }, [session?.sets]);

  const handleEditSave = useCallback(
    async (next: PlannedExercise[], swaps: PlannedExerciseSwap[]) => {
      if (!user?.uid || !sessionId) return;
      setEditError(null);
      try {
        const patch: { plannedExercises: PlannedExercise[]; updatedAt: FieldValue } =
          {
            plannedExercises: next,
            updatedAt: serverTimestamp(),
          };
        await updateDoc(sessionPath(user.uid, sessionId), patch);
        setEditOpen(false);
        if (swaps.length > 0) setSwapQueue(swaps);
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to save edits.";
        setEditError(message);
      }
    },
    [user?.uid, sessionId],
  );

  const handleSwapYes = useCallback(async () => {
    if (!user?.uid || !program || swapQueue.length === 0) return;
    const [head, ...rest] = swapQueue;
    setSavingSwap(true);
    try {
      await applyProgramSwap({
        uid: user.uid,
        program,
        sessionId: head.sessionId,
        sessionName: head.sessionName,
        fromId: head.fromId,
        toId: head.toId,
      });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Save swap to program failed:", err);
    } finally {
      setSavingSwap(false);
      setSwapQueue(rest);
    }
  }, [user?.uid, program, swapQueue]);

  const handleSwapNo = useCallback(() => {
    setSwapQueue((q) => q.slice(1));
  }, []);

  const activeSwap = swapQueue[0] ?? null;
  const swapFromName = activeSwap
    ? getMasterExercise(activeSwap.fromId)?.name ?? activeSwap.fromId
    : "";
  const swapToName = activeSwap
    ? getMasterExercise(activeSwap.toId)?.name ?? activeSwap.toId
    : "";

  // Initial planned list for the dialog: prefer override, else program template.
  const editInitial: PlannedExercise[] = useMemo(() => {
    if (session?.plannedExercises && session.plannedExercises.length > 0) {
      return [...session.plannedExercises].sort((a, b) => a.order - b.order);
    }
    if (session?.programSessionId && program) {
      const slot = program.sessions.find(
        (s) => s.id === session.programSessionId,
      );
      if (slot) return [...slot.exercises].sort((a, b) => a.order - b.order);
    }
    return [];
  }, [session?.plannedExercises, session?.programSessionId, program]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------
  const unitSystem = profile?.unitSystem ?? "metric";
  const inProgress = session?.status === "in_progress";
  // 48h edit window: once a session has been completed for >48h, the UI
  // becomes read-only. Edit affordances (quick-add, set logging) are gated
  // by `inProgress` so they're already hidden for completed sessions; this
  // flag surfaces an explicit banner and disables anything that might
  // otherwise allow late edits (e.g. rules-level guard mirrors this).
  const isLocked = session ? isPastEditWindow(session) : false;
  const totalSets = (session?.sets ?? []).filter(
    (s) => !isPlaceholderSet(s),
  ).length;

  return (
    <section className="pb-24 lg:pb-8">
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
        <div className="flex items-center gap-2">
          {inProgress && !isLocked ? (
            <button
              type="button"
              onClick={() => setEditOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-2.5 text-[11px] font-medium text-neutral-100 transition hover:bg-neutral-800"
              aria-label="Edit session"
            >
              <Pencil aria-hidden="true" className="h-3 w-3 text-accent" />
              Edit
            </button>
          ) : null}
          {inProgress ? (
            <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
              In progress
            </span>
          ) : null}
        </div>
      </div>
      <p className="mt-1 flex items-center gap-1 text-xs text-muted">
        {/* Tappable date with popover */}
        <span className="relative" ref={datePopoverRef}>
          <button
            type="button"
            onClick={handleDateEditOpen}
            className="inline-flex items-center gap-1 rounded hover:text-neutral-200 transition-colors"
            aria-label="Edit session date"
          >
            <Calendar aria-hidden="true" className="h-3 w-3 shrink-0" />
            {session?.localDate ? formatLocalDate(session.localDate) : "—"}
          </button>
          {datePopoverOpen ? (
            <div className="absolute left-0 top-full z-50 mt-1 w-64 rounded-lg border border-border bg-neutral-900 p-3 shadow-lg">
              <p className="mb-2 text-[11px] font-medium text-neutral-300">Edit session date</p>
              <input
                type="date"
                value={datePicked}
                min={twoYearsAgoDate()}
                max={todayLocalDate()}
                onChange={(e) => setDatePicked(e.target.value)}
                className="w-full rounded-md border border-border bg-neutral-800 px-2 py-1.5 text-xs text-neutral-100 focus:outline-none focus:ring-1 focus:ring-accent"
              />
              {dateError ? (
                <p className="mt-1.5 text-[11px] text-red-400">{dateError}</p>
              ) : null}
              <div className="mt-2.5 flex gap-2">
                <button
                  type="button"
                  onClick={handleDateSave}
                  disabled={dateSaving || !datePicked}
                  className="flex-1 rounded-md bg-accent2 px-2 py-1.5 text-[11px] font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
                >
                  {dateSaving ? "Saving…" : "Save"}
                </button>
                <button
                  type="button"
                  onClick={() => setDatePopoverOpen(false)}
                  className="flex-1 rounded-md border border-border bg-neutral-800 px-2 py-1.5 text-[11px] font-medium text-neutral-300 transition hover:bg-neutral-700"
                >
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </span>
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

      {editError ? (
        <div
          role="alert"
          aria-live="polite"
          className="mt-4 rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {editError}
        </div>
      ) : null}

      {isLocked ? (
        <div
          role="status"
          aria-live="polite"
          className="mt-4 rounded-lg border border-neutral-700 bg-neutral-900/60 px-3 py-2 text-sm text-neutral-300"
        >
          Read-only — this session finished more than 48 hours ago and can no
          longer be edited.
        </div>
      ) : null}

      {!loaded ? (
        <p className="mt-6 text-sm text-muted">Loading…</p>
      ) : !session ? (
        <p className="mt-6 text-sm text-muted">Session not found.</p>
      ) : (
        /* On lg+: 2-column layout — exercise list left, active detail right.
           Mobile: single column (default, no change). */
        <div className="mt-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-6 lg:items-start">
          {/* Left column: exercise cards */}
          <div>
            {plannedExercises.length === 0 ? (
              <p className="text-sm text-muted">
                No exercises planned for this session yet. Add one below.
              </p>
            ) : (
              <div className="space-y-4">
                {plannedExercises.map((planned) => {
                  const exDef = getExerciseDef(planned.exerciseId);
                  return (
                    <ExerciseCard
                      key={planned.exerciseId}
                      planned={planned}
                      loggedSetsForExercise={
                        setsByExercise.get(planned.exerciseId) ?? []
                      }
                      unitSystem={unitSystem}
                      lastSessionGhost={lastSessionPrefill.get(planned.exerciseId)}
                      onLogSet={handleLogSet}
                      onEditSet={handleEditSet}
                      onDeleteSet={handleDeleteSet}
                      gifUrl={exDef?.gifUrl}
                      instructions={exDef?.instructions}
                    />
                  );
                })}
              </div>
            )}

            {user?.uid && inProgress ? (
              <QuickAddExercise
                uid={user.uid}
                onSelect={handleQuickAdd}
                disabled={finishing}
              />
            ) : null}
          </div>

          {/* Right column (lg+): session controls panel.
              On mobile this renders below the exercise list in normal flow. */}
          {inProgress ? (
            <div className="mt-6 lg:mt-0 lg:sticky lg:top-20">
              <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-3">
                <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
                  Session controls
                </h2>
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
                <div className="border-t border-border pt-3">
                  <p className="text-xs text-muted">
                    {totalSets} {totalSets === 1 ? "set" : "sets"} logged
                  </p>
                  <p className="mt-0.5 text-xs text-muted">
                    {session.localDate}
                  </p>
                </div>
              </div>
            </div>
          ) : null}
        </div>
      )}

      {/* Mid-session edit dialog */}
      <EditPlannedExercisesDialog
        open={editOpen}
        title="Edit this session"
        sessionName={session?.name ?? "Session"}
        sessionId={session?.programSessionId}
        initial={editInitial}
        loggedExerciseIds={loggedExerciseIds}
        onSave={handleEditSave}
        onCancel={() => setEditOpen(false)}
      />

      {/* Save-swap-to-program prompt */}
      <SaveSwapPrompt
        open={!!activeSwap}
        fromName={swapFromName}
        toName={swapToName}
        sessionName={activeSwap?.sessionName ?? ""}
        busy={savingSwap}
        onYes={handleSwapYes}
        onNo={handleSwapNo}
      />
    </section>
  );
}
