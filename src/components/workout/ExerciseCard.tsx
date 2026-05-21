"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Dumbbell, ChevronDown } from "lucide-react";

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
   * Cross-session ghost suggestion sourced from the heaviest set of this
   * exercise in the most recent completed session of the same program slot
   * (fn-4-p9x.3). Surfaces only on the editable "next set" row and only
   * when no sets have been logged for this exercise yet — once the lifter
   * has logged at least one set THIS session, in-session prefill (last set
   * just logged) is the more useful suggestion.
   */
  lastSessionGhost?: { weightKg: number; reps: number; rpe?: number };
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
  /** Animated GIF URL from ExerciseDB. Rendered as an always-visible thumbnail. */
  gifUrl?: string;
  /** Step-by-step instructions from ExerciseDB. */
  instructions?: string[];
}

export default function ExerciseCard({
  planned,
  loggedSetsForExercise,
  unitSystem,
  lastSessionGhost,
  onLogSet,
  gifUrl,
  instructions,
}: ExerciseCardProps) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [howToOpen, setHowToOpen] = useState(false);

  // Sort defensively — `LoggedSet.order` is the source of truth.
  const logged = useMemo(
    () =>
      [...loggedSetsForExercise].sort((a, b) => a.order - b.order),
    [loggedSetsForExercise],
  );

  // In-session prefill: once the user has logged at least one set this
  // session, prefill the next row from the last set they just logged. This
  // is the "minimum-friction" path — they only adjust what changed.
  //
  // First set of the exercise (logged.length === 0) intentionally gets NO
  // prefill — the cross-session ghost prop (rendered as a placeholder
  // affordance, not auto-filled) handles that hint per task spec.
  const inSessionPrefill = useMemo(() => {
    const last = logged[logged.length - 1];
    if (!last) return undefined;
    return {
      weightKg: last.weightKg,
      reps: last.reps,
      rpe: last.rpe,
    };
  }, [logged]);

  // Ghost only renders on the very first set of the exercise. After the
  // user has logged something this session, the in-session prefill is the
  // better suggestion.
  const ghostForNext = logged.length === 0 ? lastSessionGhost : undefined;

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
          {/* Header doubles as a link to the per-exercise history page so the
              lifter can pull up their e1RM chart for this lift without
              leaving the session context. Wrapped in Link rather than a
              full-card anchor to keep the rest of the card (set rows) as
              its own interactive surface. */}
          <Link
            href={`/exercise/${planned.exerciseId}`}
            className="block min-w-0 hover:text-accent"
            aria-label={`View history for ${planned.name}`}
          >
            <h3 className="truncate text-sm font-semibold text-neutral-100 hover:text-accent">
              {planned.name}
            </h3>
          </Link>
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

      {planned.notes && planned.notes.trim().length > 0 ? (
        <p className="border-b border-border bg-neutral-900/30 px-3 py-1.5 text-[11px] italic text-muted">
          {planned.notes}
        </p>
      ) : null}

      {/* GIF demo + How-to instructions */}
      {(gifUrl || (instructions && instructions.length > 0)) ? (
        <div className="border-b border-border px-3 py-2 flex flex-col gap-2">
          {/* GIF thumbnail — always shown when gifUrl is present */}
          <div className="shrink-0 h-20 w-20 rounded-lg border border-border bg-neutral-800 overflow-hidden">
            {gifUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gifUrl}
                alt={`${planned.name} demo`}
                loading="lazy"
                decoding="async"
                className="h-full w-full object-cover"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Dumbbell className="h-6 w-6 text-neutral-600" />
              </div>
            )}
          </div>

          {/* Collapsible How-to instructions */}
          {instructions && instructions.length > 0 ? (
            <details
              open={howToOpen}
              onToggle={(e) => setHowToOpen((e.currentTarget as HTMLDetailsElement).open)}
              className="group"
            >
              <summary className="flex cursor-pointer list-none items-center gap-1 text-[11px] font-medium text-neutral-400 hover:text-neutral-200 transition select-none">
                <ChevronDown
                  className={`h-3.5 w-3.5 transition-transform duration-200 ${howToOpen ? "rotate-180" : ""}`}
                  aria-hidden="true"
                />
                How to
              </summary>
              <ol className="mt-2 space-y-1 pl-4">
                {instructions.map((step, i) => {
                  // Strip leading "Step:N " or "Step N: " prefix if present
                  const cleaned = step.replace(/^step\s*:?\s*\d+\s*:?\s*/i, "").trim();
                  return (
                    <li key={i} className="text-[11px] text-neutral-400 leading-relaxed">
                      {cleaned}
                    </li>
                  );
                })}
              </ol>
            </details>
          ) : null}
        </div>
      ) : null}

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
          prefill={inSessionPrefill}
          ghost={ghostForNext}
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
