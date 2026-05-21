"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  addDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc,
  where,
  type QuerySnapshot,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import {
  exercisePath,
  exercisesPath,
  profilePath,
  programPath,
  sessionsPath,
} from "@/lib/db/paths";
import type {
  Exercise,
  PlannedExercise,
  Profile,
  ProgramDoc,
  SessionDoc,
} from "@/lib/db/types";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import {
  computeLocalDate,
  getRotationView,
} from "@/lib/workout/scheduling";
import { checkAndAutoFinalize } from "@/lib/workout/recovery";
import {
  heaviestSetByExercise,
  type PrefillMap,
} from "@/lib/workout/prefill";
import { applyProgramSwap } from "@/lib/workout/applyProgramSwap";
import { getMasterExercise } from "@/lib/workout/exerciseSubs";
import {
  computeWeeklyStats,
  estimateSessionMinutes,
} from "@/lib/workout/landingStats";
import Link from "next/link";
import { Settings2 } from "lucide-react";

import ResumeBanner from "@/components/workout/ResumeBanner";
import Skeleton from "@/components/ui/Skeleton";
import EditPlannedExercisesDialog, {
  type PlannedExerciseSwap,
} from "@/components/workout/EditPlannedExercisesDialog";
import SaveSwapPrompt from "@/components/workout/SaveSwapPrompt";

import WorkoutHero from "@/components/workout/landing/WorkoutHero";
import NextUpCard from "@/components/workout/landing/NextUpCard";
import LastSessionCard from "@/components/workout/landing/LastSessionCard";
import WeeklyProgressCard from "@/components/workout/landing/WeeklyProgressCard";
import ExerciseDetailSheet from "@/components/workout/landing/ExerciseDetailSheet";

type RecentRow = { id: string; session: SessionDoc };

// Bumped from 5 because weekly stats (this-week + last-week volume) need a
// rolling ~14-day window. The landing page only displays the most-recent one,
// so the extra rows are stats fuel — not UI rows.
const RECENT_LIMIT = 30;
const ROTATION_QUERY_LIMIT = 50;

const DEFAULT_WEEKLY_TARGET = 4;

/**
 * `/workout` index — the workout landing page.
 *
 * Layout (top to bottom):
 *   1. WorkoutHero      — gym photo + tagline
 *   2. NextUpCard       — rotation-picked session w/ Start CTA
 *   3. LastSessionCard  — most-recent completed session recap
 *   4. WeeklyProgressCard — 3-col workouts/volume/streak
 *
 * Behavior preserved from the prior version:
 *   - Pre-session Edit dialog (with override-save flow)
 *   - SaveSwapPrompt for "save this swap to your program?"
 *   - ResumeBanner for any in-progress session
 *   - Edit Program link in the header
 *   - 24h auto-finalize sweep on mount
 *   - Rotation logic via `getRotationView`
 *
 * New behavior:
 *   - Tapping an exercise (or "View details" in the kebab) opens
 *     `ExerciseDetailSheet` with the master-resolved Exercise doc.
 *   - The kebab's "Swap" and "Edit" both open the Edit dialog (single source
 *     of truth for edits).
 *   - "Archive" flips `archived: true` on the user's exercise doc (master
 *     exercises are shielded — the button disables).
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

  // Pre-session edit state.
  const [editOpen, setEditOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<PlannedExercise[] | null>(
    null,
  );
  /** Swap prompts queued by the most recent edit-save. We drain one at a time. */
  const [swapQueue, setSwapQueue] = useState<PlannedExerciseSwap[]>([]);
  const [savingSwap, setSavingSwap] = useState(false);

  // Detail sheet state — open when set; cleared on close.
  const [sheetState, setSheetState] = useState<{
    exercise: Exercise | null;
    planned: PlannedExercise;
  } | null>(null);

  // Map of programSessionId → most recent completed Date, for rotation logic.
  // null = not yet fetched.
  const [lastCompletedMap, setLastCompletedMap] = useState<Map<string, Date> | null>(null);

  // Heaviest-set-per-exercise from the most recent completed session for the
  // rotation-picked slot. null = not yet fetched; empty Map = fetched, no prior session.
  const [prefillMap, setPrefillMap] = useState<PrefillMap | null>(null);

  // User's custom exercise docs (for name lookups + archive writes). Master
  // exercises don't live in Firestore so we keep the EXERCISE_MASTER as the
  // fallback in `lookupExercise` below.
  const [userExercises, setUserExercises] = useState<
    ReadonlyMap<string, Exercise>
  >(new Map());

  // ---------------------------------------------------------------------------
  // Subscribe to profile (for timezone) and active program (for rotation).
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
  // Subscribe to the recent sessions. Realtime so finishing a session in
  // another tab updates this list. Bumped to 30 for the weekly-stats roll-up.
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
        const toMs = (
          ts: unknown,
        ): number | null => {
          const t = ts as { toMillis?: () => number } | undefined;
          return t && typeof t.toMillis === "function" ? t.toMillis() : null;
        };
        const rows = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            session: data,
            startedMs: toMs(data.startedAt),
            createdMs: toMs(data.createdAt),
          };
        });
        rows.sort((a, b) => {
          const aHas = a.startedMs !== null;
          const bHas = b.startedMs !== null;
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas) {
            return (b.startedMs as number) - (a.startedMs as number);
          }
          const aC = a.createdMs;
          const bC = b.createdMs;
          if (aC !== null && bC !== null && aC !== bC) return bC - aC;
          if (aC !== null && bC === null) return -1;
          if (aC === null && bC !== null) return 1;
          return b.id.localeCompare(a.id);
        });
        const top = rows[0];
        setInProgress(top ? { id: top.id, session: top.session } : null);
      },
      (err) => setLoadError(err.message),
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // Subscribe to the user's exercise collection. We need this to:
  //   - resolve gif/instructions for the detail sheet
  //   - flip `archived: true` on archive
  // EXERCISE_MASTER provides the fallback for seeded exercises that aren't in
  // the user's collection yet.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid) return;
    const unsub = onSnapshot(
      exercisesPath(user.uid),
      (snap) => {
        const m = new Map<string, Exercise>();
        snap.docs.forEach((d) => {
          m.set(d.id, d.data());
        });
        setUserExercises(m);
      },
      (err) => {
        // Non-fatal: detail sheet will just fall back to master.
        // eslint-disable-next-line no-console
        console.warn("Exercise subscription failed:", err.message);
      },
    );
    return () => unsub();
  }, [user?.uid]);

  // ---------------------------------------------------------------------------
  // On mount (per uid), scan for in-progress sessions older than 24h and
  // auto-finalize them. Best-effort.
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
  // Fetch last-completed session per slot for rotation. One-shot getDocs that
  // re-runs when uid or the set of session ids changes.
  // ---------------------------------------------------------------------------
  const sessionIds = useMemo(
    () => program?.sessions.map((s) => s.id) ?? [],
    [program?.sessions],
  );
  const sessionIdsKey = sessionIds.join(",");

  useEffect(() => {
    if (!user?.uid || !programLoaded) return;
    if (sessionIds.length === 0) {
      setLastCompletedMap(new Map());
      return;
    }

    let cancelled = false;
    setLastCompletedMap(null);

    const q = query(
      sessionsPath(user.uid),
      where("status", "==", "completed"),
      orderBy("startedAt", "desc"),
      limit(ROTATION_QUERY_LIMIT),
    );

    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        const map = new Map<string, Date>();
        const idSet = new Set(sessionIds);
        snap.docs.forEach((d) => {
          const data = d.data();
          const pid = data.programSessionId;
          if (!pid || !idSet.has(pid) || map.has(pid)) return;
          const ts = data.startedAt as unknown as
            | { toDate?: () => Date }
            | undefined;
          const date =
            ts && typeof ts.toDate === "function" ? ts.toDate() : null;
          if (date) map.set(pid, date);
        });
        setLastCompletedMap(map);
      })
      .catch(() => {
        if (cancelled) return;
        setLastCompletedMap(new Map());
      });

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.uid, programLoaded, sessionIdsKey]);

  // ---------------------------------------------------------------------------
  // Compute rotation view.
  // ---------------------------------------------------------------------------
  const rotation = useMemo(() => {
    if (!programLoaded || lastCompletedMap === null) return null;
    return getRotationView(program, lastCompletedMap);
  }, [program, programLoaded, lastCompletedMap]);

  // ---------------------------------------------------------------------------
  // When the rotation slot is determined, fetch the most recent completed
  // session for that slot to prefill exercise weights.
  // ---------------------------------------------------------------------------
  const nextSessionId = rotation?.next?.id ?? null;

  useEffect(() => {
    if (!user?.uid || !nextSessionId) {
      setPrefillMap(null);
      return;
    }
    let cancelled = false;
    setPrefillMap(null);
    const q = query(
      sessionsPath(user.uid),
      where("programSessionId", "==", nextSessionId),
      where("status", "==", "completed"),
      orderBy("startedAt", "desc"),
      limit(1),
    );
    getDocs(q)
      .then((snap) => {
        if (cancelled) return;
        if (snap.empty) {
          setPrefillMap(new Map());
          return;
        }
        const sessionData = snap.docs[0].data();
        setPrefillMap(heaviestSetByExercise(sessionData.sets ?? []));
      })
      .catch(() => {
        if (cancelled) return;
        setPrefillMap(new Map());
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, nextSessionId]);

  // ---------------------------------------------------------------------------
  // Derived state.
  // ---------------------------------------------------------------------------
  const localDate = useMemo(() => {
    const tz = profile?.timezone || "UTC";
    return computeLocalDate(new Date(), tz);
  }, [profile?.timezone]);

  // Most-recent COMPLETED session (the in-progress one is shown via ResumeBanner).
  const lastCompletedSession = useMemo<RecentRow | null>(() => {
    if (!recent) return null;
    for (const row of recent) {
      const status = row.session.status;
      if (!status || status === "completed") return row;
    }
    return null;
  }, [recent]);

  const recentSessions = useMemo<SessionDoc[]>(
    () => (recent ?? []).map((r) => r.session),
    [recent],
  );

  const weeklyStats = useMemo(
    () =>
      computeWeeklyStats(recentSessions, {
        target: DEFAULT_WEEKLY_TARGET,
      }),
    [recentSessions],
  );

  const estimatedMinutes = useMemo(() => {
    if (!rotation?.next) return 0;
    return estimateSessionMinutes(rotation, recentSessions, rotation.next.id);
  }, [rotation, recentSessions]);

  const unitSystem = profile?.unitSystem ?? "imperial";

  const lookupExercise = useCallback(
    (id: string): Exercise | null => {
      const fromUser = userExercises.get(id);
      if (fromUser) return fromUser;
      const fromMaster = EXERCISE_MASTER.find((e) => e.id === id);
      if (!fromMaster) return null;
      // Synthesize an Exercise from the master seed so the detail sheet can
      // render before the user's collection mirrors it. Spread all master
      // fields (including gifUrl, instructions, etc.) so nothing is dropped.
      return {
        ...fromMaster,
        seeded: true,
        source: "master",
        // `createdAt` is required on the type; we won't read it in the sheet
        // so a placeholder is fine. Type-cast to avoid threading an undefined
        // through the strict type.
        createdAt: undefined as unknown as Exercise["createdAt"],
      } as unknown as Exercise;
    },
    [userExercises],
  );

  // ---------------------------------------------------------------------------
  // Start session: write an in-progress session doc and route to the logger.
  // ---------------------------------------------------------------------------
  const handleStart = useCallback(async () => {
    if (!user?.uid || !rotation?.next) return;
    setStarting(true);
    setStartError(null);
    try {
      const sessionsCol = sessionsPath(user.uid);
      const payload: Partial<SessionDoc> = {
        localDate,
        name: rotation.next.name,
        programSessionId: rotation.next.id,
        status: "in_progress",
        sets: [],
        date: serverTimestamp() as unknown as SessionDoc["date"],
        startedAt: serverTimestamp() as unknown as SessionDoc["startedAt"],
        createdAt: serverTimestamp() as unknown as SessionDoc["createdAt"],
        updatedAt: serverTimestamp() as unknown as SessionDoc["updatedAt"],
      };
      if (pendingOverride) {
        payload.plannedExercises = pendingOverride;
      }
      const ref = await addDoc(sessionsCol, payload as SessionDoc);
      setPendingOverride(null);
      router.push(`/workout/${ref.id}`);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to start session.";
      setStartError(message);
      setStarting(false);
    }
  }, [user?.uid, rotation, localDate, router, pendingOverride]);

  // ---------------------------------------------------------------------------
  // Edit + swap-save handlers (preserved from prior version).
  // ---------------------------------------------------------------------------
  const handleEditSave = useCallback(
    (next: PlannedExercise[], swaps: PlannedExerciseSwap[]) => {
      setPendingOverride(next);
      setEditOpen(false);
      if (swaps.length > 0) setSwapQueue(swaps);
    },
    [],
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

  // Friendly display names for the active swap prompt.
  const activeSwap = swapQueue[0] ?? null;
  const swapFromName = activeSwap
    ? getMasterExercise(activeSwap.fromId)?.name ?? activeSwap.fromId
    : "";
  const swapToName = activeSwap
    ? getMasterExercise(activeSwap.toId)?.name ?? activeSwap.toId
    : "";

  // ---------------------------------------------------------------------------
  // Detail sheet + kebab actions.
  // ---------------------------------------------------------------------------
  const openDetailSheet = useCallback(
    (planned: PlannedExercise) => {
      const exercise = lookupExercise(planned.exerciseId);
      setSheetState({ exercise, planned });
    },
    [lookupExercise],
  );

  const handleArchive = useCallback(
    async (planned: PlannedExercise) => {
      if (!user?.uid) return;
      const ex = lookupExercise(planned.exerciseId);
      // Only allow archiving user-owned exercises. Master/seeded exercises
      // live in the static seed list, not in Firestore — they have no doc to
      // mutate. The UI already disables this button for master, but guard
      // here too so a stray call from elsewhere can't blow up.
      if (!ex || ex.source === "master" || ex.seeded) return;
      try {
        await updateDoc(exercisePath(user.uid, planned.exerciseId), {
          archived: true,
        });
      } catch (err) {
        // eslint-disable-next-line no-console
        console.warn("Archive failed:", err);
      }
    },
    [user?.uid, lookupExercise],
  );

  const handleExerciseAction = useCallback(
    (planned: PlannedExercise, action: "view" | "swap" | "edit" | "archive") => {
      if (action === "view") {
        openDetailSheet(planned);
        return;
      }
      if (action === "swap" || action === "edit") {
        // Both reuse the Edit dialog (single source of truth for edits).
        setEditOpen(true);
        return;
      }
      if (action === "archive") {
        void handleArchive(planned);
      }
    },
    [openDetailSheet, handleArchive],
  );

  // Sheet's "Swap" / "Edit" share the same handler; "Archive" pipes through
  // the same archive call. Closing the sheet after the action mirrors the
  // kebab flow.
  const sheetActions = useMemo(
    () => ({
      onSwap: () => {
        setSheetState(null);
        setEditOpen(true);
      },
      onEdit: () => {
        setSheetState(null);
        setEditOpen(true);
      },
      onArchive: () => {
        if (sheetState?.planned) {
          void handleArchive(sheetState.planned);
        }
        setSheetState(null);
      },
    }),
    [sheetState, handleArchive],
  );

  // Header "View details →" opens the sheet for the first exercise as a
  // reasonable default; it's the entry point to the full list view.
  const handleHeaderViewDetails = useCallback(() => {
    if (!rotation?.next) return;
    const list = pendingOverride ?? rotation.next.exercises;
    if (list.length === 0) return;
    openDetailSheet(list[0]);
  }, [rotation, pendingOverride, openDetailSheet]);

  // Last-top-set for the detail sheet, looked up from the prefill map.
  const sheetLastTopSet = useMemo(() => {
    if (!sheetState?.planned) return null;
    const entry = prefillMap?.get(sheetState.planned.exerciseId);
    if (!entry) return null;
    return { weightKg: entry.weightKg, reps: entry.reps };
  }, [sheetState, prefillMap]);

  // ---------------------------------------------------------------------------
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section className="pb-8">
      <div className="flex items-baseline justify-between gap-3 border-b border-border pb-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">
            Workout
          </h1>
          <p className="mt-1 text-xs text-muted">{localDate}</p>
        </div>
        <Link
          href="/workout/program"
          className="inline-flex h-9 items-center gap-1.5 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 transition-colors hover:bg-neutral-800"
        >
          <Settings2 className="h-3.5 w-3.5 text-accent" />
          Edit program
        </Link>
      </div>

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

      {/* 1. Hero */}
      <div className="mt-5">
        <WorkoutHero />
      </div>

      {/* 2. Next Up */}
      <div className="mt-5">
        {!programLoaded || rotation === null ? (
          <div className="rounded-2xl border border-border bg-panel/60 p-4 sm:p-5">
            <div className="space-y-3">
              <Skeleton className="h-4 w-16" />
              <Skeleton className="h-6 w-40" />
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-11 w-full" />
            </div>
          </div>
        ) : !program ? (
          <EmptyProgramCard kind="no-program" />
        ) : rotation.next ? (
          <NextUpCard
            rotation={rotation}
            pendingOverride={pendingOverride}
            estimatedMinutes={estimatedMinutes}
            starting={starting}
            startError={startError}
            onStart={handleStart}
            onEdit={() => setEditOpen(true)}
            onExerciseAction={handleExerciseAction}
            onHeaderViewDetails={handleHeaderViewDetails}
          />
        ) : (
          <EmptyProgramCard kind="no-sessions" />
        )}
      </div>

      {/* 3. Last Session */}
      <div className="mt-5">
        <h2 className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
          Last session
        </h2>
        {!recentLoaded ? (
          <Skeleton className="h-16 w-full rounded-2xl" />
        ) : (
          <LastSessionCard
            session={
              lastCompletedSession
                ? {
                    id: lastCompletedSession.id,
                    doc: lastCompletedSession.session,
                  }
                : null
            }
            unitSystem={unitSystem}
          />
        )}
      </div>

      {/* 4. Weekly Progress */}
      <div className="mt-5">
        <WeeklyProgressCard weeklyStats={weeklyStats} unitSystem={unitSystem} />
      </div>

      {/* Pre-session edit dialog */}
      {rotation?.next ? (
        <EditPlannedExercisesDialog
          open={editOpen}
          title={`Edit ${rotation.next.name}`}
          sessionName={rotation.next.name}
          sessionId={rotation.next.id}
          initial={pendingOverride ?? rotation.next.exercises}
          onSave={handleEditSave}
          onCancel={() => setEditOpen(false)}
        />
      ) : null}

      {/* Save-swap-to-program prompt (drains queue one at a time) */}
      <SaveSwapPrompt
        open={!!activeSwap}
        fromName={swapFromName}
        toName={swapToName}
        sessionName={activeSwap?.sessionName ?? ""}
        busy={savingSwap}
        onYes={handleSwapYes}
        onNo={handleSwapNo}
      />

      {/* Exercise detail sheet */}
      <ExerciseDetailSheet
        open={sheetState !== null}
        onOpenChange={(open) => {
          if (!open) setSheetState(null);
        }}
        exercise={sheetState?.exercise ?? null}
        planned={sheetState?.planned ?? null}
        lastTopSet={sheetLastTopSet}
        unitSystem={unitSystem}
        actions={sheetActions}
      />
    </section>
  );
}

/** Inline empty-state for the Next-Up slot. */
function EmptyProgramCard({ kind }: { kind: "no-program" | "no-sessions" }) {
  const title = kind === "no-program" ? "No program yet" : "No sessions yet";
  const description =
    kind === "no-program"
      ? "Open the program editor to set up your sessions."
      : "Add sessions in the program editor to get started.";
  return (
    <div className="rounded-2xl border border-border bg-panel/60 p-4 sm:p-5">
      <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
        Next Up
      </span>
      <p className="mt-3 text-lg font-semibold text-neutral-100">{title}</p>
      <p className="mt-1 text-xs text-muted">{description}</p>
      <Link
        href="/workout/program"
        className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110"
      >
        Edit program
      </Link>
    </div>
  );
}
