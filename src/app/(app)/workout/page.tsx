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
  where,
  type QuerySnapshot,
} from "firebase/firestore";

import { useAuth } from "@/lib/auth/useAuth";
import { profilePath, programPath, sessionsPath } from "@/lib/db/paths";
import type {
  PlannedExercise,
  Profile,
  ProgramDoc,
  SessionDoc,
} from "@/lib/db/types";
import {
  buildRotationCaption,
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
import Link from "next/link";
import { Pencil, Settings2 } from "lucide-react";

import SessionListItem from "@/components/workout/SessionListItem";
import ResumeBanner from "@/components/workout/ResumeBanner";
import Skeleton from "@/components/ui/Skeleton";
import EditPlannedExercisesDialog, {
  type PlannedExerciseSwap,
} from "@/components/workout/EditPlannedExercisesDialog";
import SaveSwapPrompt from "@/components/workout/SaveSwapPrompt";

type RecentRow = { id: string; session: SessionDoc };

const RECENT_LIMIT = 5;
const ROTATION_QUERY_LIMIT = 50;

/**
 * `/workout` index.
 *
 * Sections:
 *   1. Next Up — shows the rotation-picked session from the active program,
 *      plus a "Start session" CTA that writes a new in-progress session doc
 *      and routes to `/workout/[id]`.
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

  // Pre-session edit state.
  const [editOpen, setEditOpen] = useState(false);
  const [pendingOverride, setPendingOverride] = useState<PlannedExercise[] | null>(
    null,
  );
  /** Swap prompts queued by the most recent edit-save. We drain one at a time. */
  const [swapQueue, setSwapQueue] = useState<PlannedExerciseSwap[]>([]);
  const [savingSwap, setSavingSwap] = useState(false);

  // Map of programSessionId → most recent completed Date, for rotation logic.
  // null = not yet fetched.
  const [lastCompletedMap, setLastCompletedMap] = useState<Map<string, Date> | null>(null);

  // Heaviest-set-per-exercise from the most recent completed session for the
  // rotation-picked slot. null = not yet fetched; empty Map = fetched, no prior session.
  const [prefillMap, setPrefillMap] = useState<PrefillMap | null>(null);

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
        // Prefer docs with a real `startedAt` (most recent first). If none
        // have timestamps, fall back to `createdAt` desc, then doc-id desc as
        // a final deterministic tiebreaker. Avoids arbitrary "first doc wins"
        // when multiple legacy in-progress docs lack `startedAt`.
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
          // Docs with startedAt always come before docs without.
          const aHas = a.startedMs !== null;
          const bHas = b.startedMs !== null;
          if (aHas !== bHas) return aHas ? -1 : 1;
          if (aHas && bHas) {
            // Most recent startedAt first.
            return (b.startedMs as number) - (a.startedMs as number);
          }
          // Neither has startedAt — fall back to createdAt desc, then id desc.
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
  // Fetch last-completed session per slot for rotation. One-shot getDocs that
  // re-runs when uid or the set of session ids changes.
  // ---------------------------------------------------------------------------
  const sessionIds = useMemo(
    () => program?.sessions.map((s) => s.id) ?? [],
    [program?.sessions],
  );
  // Stable string key so the effect only re-fires when the actual ids change.
  const sessionIdsKey = sessionIds.join(",");

  useEffect(() => {
    if (!user?.uid || !programLoaded) return;
    if (sessionIds.length === 0) {
      setLastCompletedMap(new Map());
      return;
    }

    let cancelled = false;
    setLastCompletedMap(null); // clear while re-fetching

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
          // startedAt may be a Firestore Timestamp or null on very old docs.
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
        setLastCompletedMap(new Map()); // fail gracefully
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
  // One-shot getDocs — re-runs only when the slot id changes.
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
  // Local date for display.
  // ---------------------------------------------------------------------------
  const localDate = useMemo(() => {
    const tz = profile?.timezone || "UTC";
    return computeLocalDate(new Date(), tz);
  }, [profile?.timezone]);

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
  // Pre-session edit handlers.
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
      // Non-fatal: we just drop this swap from the queue without persisting.
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
  // Render
  // ---------------------------------------------------------------------------

  return (
    <section>
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

      {/* Next Up */}
      <div className="mt-6 rounded-xl border border-border bg-neutral-900/40 p-4">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Next Up
        </h2>
        {!programLoaded || rotation === null ? (
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
              Open the program editor to set up your sessions.
            </p>
            <Link
              href="/workout/program"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110"
            >
              Edit program
            </Link>
          </>
        ) : rotation.next ? (
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              {rotation.next.name}
            </p>
            <p className="mt-0.5 text-xs text-muted">
              {(pendingOverride ?? rotation.next.exercises).length} planned exercise
              {(pendingOverride ?? rotation.next.exercises).length === 1 ? "" : "s"}
              {pendingOverride ? (
                <span className="ml-1 rounded-full border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-amber-300">
                  edited
                </span>
              ) : null}
            </p>
            <p className="mt-0.5 text-[11px] text-muted/70">
              {buildRotationCaption(rotation.slots)}
            </p>

            {/* Exercise preview list */}
            {(() => {
              const exercises = pendingOverride ?? rotation.next.exercises;
              const unitSystem = profile?.unitSystem ?? "imperial";
              const MAX_SHOWN = 5;
              const shown = exercises.slice(0, MAX_SHOWN);
              const overflow = exercises.length - MAX_SHOWN;

              return (
                <ul className="mt-3 space-y-1.5">
                  {shown.map((ex) => {
                    const setRep =
                      ex.repRangeLow === ex.repRangeHigh
                        ? `${ex.targetSets} × ${ex.repRangeLow}`
                        : `${ex.targetSets} × ${ex.repRangeLow}-${ex.repRangeHigh}`;

                    const entry = prefillMap?.get(ex.exerciseId);
                    let lastLabel: string;
                    if (!entry || !entry.reps) {
                      lastLabel = "—";
                    } else {
                      const displayWeight =
                        unitSystem === "imperial"
                          ? Math.round(entry.weightKg * 2.20462)
                          : entry.weightKg;
                      const unit = unitSystem === "imperial" ? "lb" : "kg";
                      lastLabel = `${displayWeight} ${unit} × ${entry.reps}`;
                    }

                    return (
                      <li
                        key={ex.exerciseId}
                        className="flex items-baseline gap-2 text-xs"
                      >
                        <span className="min-w-0 flex-1 truncate text-sm text-neutral-100">
                          {ex.name}
                        </span>
                        <span className="shrink-0 text-muted">{setRep}</span>
                        <span className="shrink-0 text-muted">
                          last:{" "}
                          <span className={prefillMap === null ? "opacity-50" : ""}>
                            {prefillMap === null ? "—" : lastLabel}
                          </span>
                        </span>
                      </li>
                    );
                  })}
                  {overflow > 0 && (
                    <li className="text-xs text-muted">+ {overflow} more</li>
                  )}
                </ul>
              );
            })()}

            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={handleStart}
                disabled={starting}
                className="inline-flex h-11 flex-1 items-center justify-center rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {starting ? "Starting…" : "Start session"}
              </button>
              <button
                type="button"
                onClick={() => setEditOpen(true)}
                disabled={starting}
                className="inline-flex h-11 items-center justify-center gap-1.5 rounded-lg border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 transition hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Edit session"
              >
                <Pencil className="h-3.5 w-3.5 text-accent" />
                Edit
              </button>
            </div>
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
          // program exists but has no sessions
          <>
            <p className="mt-1 text-lg font-semibold text-neutral-100">
              No sessions yet
            </p>
            <p className="mt-1 text-xs text-muted">
              Add sessions in the program editor to get started.
            </p>
            <Link
              href="/workout/program"
              className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110"
            >
              Edit program
            </Link>
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
    </section>
  );
}
