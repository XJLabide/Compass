"use client";

import { useMemo, useState } from "react";

import type { LoggedSet, PlannedExercise, UnitSystem } from "@/lib/db/types";

import SetRow from "./SetRow";

/**
 * ExerciseCard — one card per planned exercise on the live logger.
 *
 * Layout:
 *   - Sticky header (`top-0`) with the exercise name + target rep range +
 *     progress (logged sets / target sets). The header sticks while the user
 *     scrolls through this exercise's set rows so they always know what lift
 *     they're loading.
 *   - A list of `SetRow`s: one per already-logged set (read-only), then one
 *     editable "next set" row.
 *   - When the user logs a set, the parent persists it; this card simply
 *     re-renders the new set list and shifts the editable row down.
 *
 * The card itself owns no Firestore state — it only knows about (a) what's
 * been logged for THIS exercise and (b) how to ask the parent to persist a
 * new set. Keeping persistence in one place at the page level is what makes
 * the multi-tab safety guarantee tractable (one atomic `sets[]` replacement
 * per write).
 */
export interface ExerciseCardProps {
  planned: PlannedExercise;
  /** Subset of `session.sets` filtered to this exercise, in `order` order. */
  loggedSetsForExercise: LoggedSet[];
  /** User's display unit system. */
  unitSystem: UnitSystem;
  /**
   * Persist a single new set. The parent immutably replaces `sets[]` on the
   * session doc. Throws / rejects on failure — the card surfaces the error.
   */
  onLogSet: (input: {
    exerciseId: string;
    weightKg: number;
    reps: number;
    rpe?: number;
  }) => Promise<void>;
}

export default function ExerciseCard({
  planned,
  loggedSetsForExercise,
  unitSystem,
  onLogSet,
}: ExerciseCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sort defensively — `LoggedSet.order` is the source of truth.
  const logged = useMemo(
    () =>
      [...loggedSetsForExercise].sort((a, b) => a.order - b.order),
    [loggedSetsForExercise],
  );

  // Prefill the next-set row from the last logged set, falling back to a
  // sensible zero state. This is the "minimum-friction" version of the
  // last-session prefill; the cross-session version ships in a later task.
  const prefill = useMemo(() => {
    const last = logged[logged.length - 1];
    if (!last) {
      return {
        weightKg: 0,
        reps: planned.repRangeLow,
        rpe: undefined as number | undefined,
      };
    }
    return {
      weightKg: last.weightKg,
      reps: last.reps,
      rpe: last.rpe,
    };
  }, [logged, planned.repRangeLow]);

  const targetSets = planned.targetSets;
  const completed = logged.length;

  async function handleLogged(input: {
    weightKg: number;
    reps: number;
    rpe?: number;
  }) {
    setPending(true);
    setError(null);
    try {
      await onLogSet({
        exerciseId: planned.exerciseId,
        weightKg: input.weightKg,
        reps: input.reps,
        rpe: input.rpe,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save set.");
    } finally {
      setPending(false);
    }
  }

  return (
    <article className="rounded-xl border border-border bg-neutral-900/40">
      {/* Sticky header — stays visible while scrolling this card's rows.
          z-10 keeps it above the rows; `bg-bg` (matches app background)
          prevents row content bleeding through. */}
      <header className="sticky top-0 z-10 flex items-center justify-between gap-2 rounded-t-xl border-b border-border bg-bg/95 px-3 py-2 backdrop-blur">
        <div className="min-w-0 flex-1">
          <h3 className="truncate text-sm font-semibold text-neutral-100">
            {planned.name}
          </h3>
          <p className="mt-0.5 text-[11px] text-muted">
            Target: {targetSets} × {planned.repRangeLow}
            {planned.repRangeHigh !== planned.repRangeLow
              ? `–${planned.repRangeHigh}`
              : ""}
          </p>
        </div>
        <div
          className="shrink-0 rounded-full border border-border bg-panel2 px-2 py-0.5 font-mono text-[11px] tabular-nums text-neutral-200"
          aria-label={`${completed} of ${targetSets} sets logged`}
        >
          {completed}/{targetSets}
        </div>
      </header>

      <div className="space-y-1.5 p-2">
        {logged.map((set, i) => (
          <SetRow
            // Keying on stable `order` so a new "next set" row remounts
            // (and re-focuses) rather than reusing the previous row's input.
            key={`logged-${set.order}`}
            setNumber={i + 1}
            unitSystem={unitSystem}
            logged={set}
          />
        ))}

        {/* The active "next set" editor. Auto-focuses when it appears.
            We don't render it once the user has hit the target — they can
            still add more via .3 (quick-add) but visually we don't push them
            past their plan. */}
        <SetRow
          // Key includes `completed` so the row remounts (and refocuses /
          // re-prefills) after each successful Log.
          key={`next-${completed}`}
          setNumber={completed + 1}
          unitSystem={unitSystem}
          prefill={prefill}
          onLogged={handleLogged}
          disabled={pending}
          autoFocus={completed > 0}
        />

        {error ? (
          <div
            role="alert"
            aria-live="polite"
            className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300"
          >
            {error}
          </div>
        ) : null}
      </div>
    </article>
  );
}
