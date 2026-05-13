"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  getDoc,
  getDocs,
  onSnapshot,
  orderBy,
  query,
  where,
} from "firebase/firestore";
import { subWeeks } from "date-fns";

import { useAuth } from "@/lib/auth/useAuth";
import {
  exercisePath,
  profilePath,
  sessionsPath,
} from "@/lib/db/paths";
import type {
  Exercise,
  LoggedSet,
  Profile,
  SessionDoc,
} from "@/lib/db/types";
import { epleyE1RM } from "@/lib/pr";
import { toMillis } from "@/lib/workout/prefill";
import { kgToDisplay, weightUnitLabel } from "@/lib/workout/units";

import E1RMChart, { type E1RMPoint } from "@/components/exercise/E1RMChart";

/**
 * `/exercise/[id]` — per-exercise history page.
 *
 * Shows two things for one exercise:
 *
 *   1. **e1RM line chart** of estimated 1RM over time (Epley, derived from
 *      the best-scoring set per session). PR sessions are dotted out so the
 *      lifter can see when a new estimated 1RM landed.
 *
 *   2. **Session list** of every completed session that touched this
 *      exercise, newest first. Each row is a link to `/workout/[id]` so the
 *      user can drill into the actual logged sets.
 *
 * Data strategy (v1, per task spec): client-side fetch of completed sessions
 * from the last **26 weeks**, then in-memory filter to only those that
 * touched this exercise. We use a `where('status', '==', 'completed')` +
 * `where('date', '>=', cutoff)` + `orderBy('date', 'desc')` query. Read
 * volume is bounded by ~26 sessions/wk worst case → trivial for v1; revisit
 * if it ever crosses a few hundred docs.
 *
 * We deliberately do NOT do a top-level subscription: history of a lift is
 * append-only from the lifter's perspective (no realtime updates we care
 * about), and live subscribing to ~6 months of session docs is wasteful.
 */

const HISTORY_WEEKS = 26;

/** A session row in the history list, with the heaviest-e1RM set surfaced. */
interface HistoryRow {
  sessionId: string;
  session: SessionDoc;
  /** Best set for THIS exercise in this session (max e1RM, ties → more reps). */
  bestSet: LoggedSet;
  bestE1rmKg: number;
}

/**
 * Pick the set with the highest Epley e1RM for `exerciseId` within `sets`.
 * Returns `null` if no real (non-placeholder) set exists for the exercise.
 * Ties: more reps wins (mirrors the rule in `computeCandidatePRs`).
 */
function pickBestSetForExercise(
  sets: LoggedSet[],
  exerciseId: string,
): { set: LoggedSet; e1rmKg: number } | null {
  let best: { set: LoggedSet; e1rmKg: number } | null = null;
  for (const s of sets) {
    if (!s || s.exerciseId !== exerciseId) continue;
    if (s.weightKg <= 0 || s.reps <= 0) continue; // skip placeholder anchors
    const e = epleyE1RM(s.weightKg, s.reps);
    if (e <= 0) continue;
    if (
      !best ||
      e > best.e1rmKg ||
      (e === best.e1rmKg && s.reps > best.set.reps)
    ) {
      best = { set: s, e1rmKg: e };
    }
  }
  return best;
}

export default function ExerciseHistoryPage() {
  const params = useParams<{ id: string }>();
  const exerciseId = params?.id;
  const { user } = useAuth();

  const [profile, setProfile] = useState<Profile | null>(null);
  const [exercise, setExercise] = useState<Exercise | null>(null);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  // Set of session ids that hold the "new best e1RM at time of session"
  // marker. Computed by scanning rows newest-last and flagging strict
  // ascents — cheap and avoids needing to read the PR feed here.
  const [prSessionIds, setPrSessionIds] = useState<Set<string>>(
    () => new Set(),
  );

  // ---------------------------------------------------------------------------
  // Profile (for unit system display).
  // ---------------------------------------------------------------------------
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
  // Exercise (for display name). One-shot read — the exercise master doc
  // rarely changes mid-view.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid || !exerciseId) return;
    let cancelled = false;
    getDoc(exercisePath(user.uid, exerciseId))
      .then((snap) => {
        if (cancelled) return;
        setExercise(snap.data() ?? null);
      })
      .catch((err) => {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, [user?.uid, exerciseId]);

  // ---------------------------------------------------------------------------
  // History fetch: last 26 weeks of completed sessions, filtered in-memory
  // to those that touched this exercise.
  // ---------------------------------------------------------------------------
  useEffect(() => {
    if (!user?.uid || !exerciseId) return;
    let cancelled = false;

    const run = async () => {
      try {
        const cutoff = subWeeks(new Date(), HISTORY_WEEKS);
        // `date` is a Firestore Timestamp; Firestore JS SDK accepts JS Date
        // for inequality bounds and coerces to Timestamp at the wire layer.
        const q = query(
          sessionsPath(user.uid),
          where("status", "==", "completed"),
          where("date", ">=", cutoff),
          orderBy("date", "desc"),
        );
        const snap = await getDocs(q);
        if (cancelled) return;

        const collected: HistoryRow[] = [];
        snap.forEach((d) => {
          const data = d.data();
          const sets = data.sets ?? [];
          const best = pickBestSetForExercise(sets, exerciseId);
          if (!best) return; // session didn't touch this exercise
          collected.push({
            sessionId: d.id,
            session: data,
            bestSet: best.set,
            bestE1rmKg: best.e1rmKg,
          });
        });

        // Flag sessions where the e1RM made a strict ascent vs everything
        // before it. We walk chronologically (oldest first) keeping a
        // running max; any row that strictly exceeds the running max is a
        // "new e1RM at the time" marker.
        const chronological = [...collected].sort(
          (a, b) =>
            (toMillis(a.session.date) ?? 0) -
            (toMillis(b.session.date) ?? 0),
        );
        const prs = new Set<string>();
        let runningMax = 0;
        for (const r of chronological) {
          if (r.bestE1rmKg > runningMax) {
            prs.add(r.sessionId);
            runningMax = r.bestE1rmKg;
          }
        }

        setRows(collected); // already newest-first from the query
        setPrSessionIds(prs);
      } catch (err) {
        if (cancelled) return;
        setError(err instanceof Error ? err.message : String(err));
        setRows([]);
      }
    };

    run();
    return () => {
      cancelled = true;
    };
  }, [user?.uid, exerciseId]);

  // ---------------------------------------------------------------------------
  // Chart points: chronological order, oldest -> newest, so the line moves
  // left-to-right through time.
  // ---------------------------------------------------------------------------
  const chartPoints: E1RMPoint[] = useMemo(() => {
    if (!rows) return [];
    return [...rows]
      .sort(
        (a, b) =>
          (toMillis(a.session.date) ?? 0) -
          (toMillis(b.session.date) ?? 0),
      )
      .map((r) => ({
        localDate: r.session.localDate,
        e1rmKg: r.bestE1rmKg,
        isPR: prSessionIds.has(r.sessionId),
        sessionId: r.sessionId,
      }));
  }, [rows, prSessionIds]);

  const unitSystem = profile?.unitSystem ?? "metric";
  const unitLabel = weightUnitLabel(unitSystem);

  return (
    <section className="pb-24">
      <Link
        href="/workout"
        className="text-xs font-medium text-muted hover:text-neutral-200"
      >
        ← Workout
      </Link>

      <h1 className="mt-2 text-2xl font-semibold text-neutral-100">
        {exercise?.name ?? exerciseId ?? "Exercise"}
      </h1>
      <p className="mt-1 text-xs text-muted">
        e1RM (Epley) over the last {HISTORY_WEEKS} weeks
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

      {/* Chart */}
      <div className="mt-5">
        {rows === null ? (
          <div className="flex h-56 items-center justify-center rounded-xl border border-border bg-neutral-900/40 text-sm text-muted">
            Loading…
          </div>
        ) : (
          <E1RMChart points={chartPoints} unitSystem={unitSystem} />
        )}
      </div>

      {/* Session list */}
      <div className="mt-6">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Sessions
        </h2>
        {rows === null ? (
          <p className="mt-2 text-sm text-muted">Loading…</p>
        ) : rows.length === 0 ? (
          <p className="mt-2 text-sm text-muted">
            No completed sessions touched this exercise in the last{" "}
            {HISTORY_WEEKS} weeks.
          </p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rows.map((row) => {
              const isPR = prSessionIds.has(row.sessionId);
              const weight = kgToDisplay(
                row.bestSet.weightKg,
                unitSystem,
              ).toFixed(1);
              const e1rm = kgToDisplay(row.bestE1rmKg, unitSystem).toFixed(1);
              return (
                <li key={row.sessionId}>
                  <Link
                    href={`/workout/${row.sessionId}`}
                    className="flex min-h-[3.5rem] items-center justify-between gap-3 rounded-lg border border-border bg-neutral-900/40 px-3 py-2 transition hover:bg-neutral-800/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="truncate text-sm font-medium text-neutral-100">
                          {row.session.name || "Session"}
                        </p>
                        {isPR ? (
                          <span className="inline-flex items-center rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wide text-amber-300">
                            PR
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-0.5 text-xs text-muted">
                        {row.session.localDate}
                        <span aria-hidden="true"> · </span>
                        Best: {weight} {unitLabel} × {row.bestSet.reps}
                        <span aria-hidden="true"> · </span>
                        e1RM {e1rm} {unitLabel}
                      </p>
                    </div>
                    <span aria-hidden className="text-muted">
                      ›
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </section>
  );
}
