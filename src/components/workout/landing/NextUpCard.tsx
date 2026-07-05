"use client";

import { Clock, Dumbbell, MoreHorizontal, Pencil, PlayCircle } from "lucide-react";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import type { PlannedExercise } from "@/lib/db/types";
import type { RotationView } from "@/lib/workout/scheduling";

/**
 * The "Next Up" card on the `/workout` landing page. Renders the rotation-
 * picked session as a punchy list with sets/reps chips, a kebab menu per row,
 * and a single accent Start CTA at the bottom.
 *
 * This component is purely presentational — the page above it owns:
 *   - The rotation logic (already computed)
 *   - The pending override (from the in-page Edit dialog)
 *   - The handlers (start session, open editor, open detail sheet, etc.)
 *
 * Action semantics:
 *   - Tapping a row calls `onExerciseAction(planned, "view")` so the parent
 *     can pop the detail sheet.
 *   - The kebab opens a dropdown with view / swap / edit / archive. The parent
 *     decides what those do (typically: view -> sheet, swap/edit -> Edit
 *     dialog scoped to that row, archive -> destructive write).
 */

export type NextUpAction = "view" | "swap" | "edit" | "archive";

export interface NextUpCardProps {
  rotation: RotationView;
  /** When non-null, planned exercises have been edited in this session — render
   *  the override list instead of the program template. */
  pendingOverride: PlannedExercise[] | null;
  /** Estimated session length in minutes (see `estimateSessionMinutes`). */
  estimatedMinutes: number;
  starting?: boolean;
  startError?: string | null;
  onStart(): void;
  onEdit(): void;
  onExerciseAction(planned: PlannedExercise, action: NextUpAction): void;
  /** "View details" link in the card header — defaults to opening the first
   *  exercise in the detail sheet. */
  onHeaderViewDetails?(): void;
}

const MAX_INLINE = 6;

export default function NextUpCard({
  rotation,
  pendingOverride,
  estimatedMinutes,
  starting,
  startError,
  onStart,
  onEdit,
  onExerciseAction,
  onHeaderViewDetails,
}: NextUpCardProps) {
  if (!rotation.next) {
    // The parent already guards the no-program case; this is a defensive
    // fallback for a program with zero sessions.
    return null;
  }

  const exercises = pendingOverride ?? rotation.next.exercises;
  const shown = exercises.slice(0, MAX_INLINE);
  const overflow = exercises.length - shown.length;
  const totalCount = exercises.length;

  return (
    <div className="rounded-2xl border border-border bg-panel/60 p-4 sm:p-5">
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <span className="inline-flex items-center rounded-full bg-accent/10 px-2.5 py-0.5 text-[10px] font-semibold uppercase tracking-[0.12em] text-accent">
          Next Up
        </span>
        {onHeaderViewDetails ? (
          <button
            type="button"
            onClick={onHeaderViewDetails}
            className="text-xs font-medium text-muted hover:text-neutral-100"
          >
            View details →
          </button>
        ) : null}
      </div>

      {/* Title + meta row */}
      <h2 className="mt-2 text-2xl font-semibold tracking-tight text-neutral-100">
        {rotation.next.name}
        {pendingOverride ? (
          <span className="ml-2 align-middle text-[10px] font-medium uppercase tracking-wide text-amber-300">
            edited
          </span>
        ) : null}
      </h2>

      <div className="mt-1.5 flex items-center gap-2 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <Dumbbell aria-hidden="true" className="h-3.5 w-3.5" />
          {totalCount} {totalCount === 1 ? "exercise" : "exercises"}
        </span>
        <span aria-hidden="true" className="text-muted/50">
          •
        </span>
        <span className="inline-flex items-center gap-1.5">
          <Clock aria-hidden="true" className="h-3.5 w-3.5" />
          ~{estimatedMinutes} min
        </span>
      </div>

      {/* Exercise rows */}
      <ul className="mt-4 space-y-1.5">
        {shown.map((ex, idx) => {
          const repsLabel =
            ex.repRangeLow === ex.repRangeHigh
              ? `${ex.repRangeLow} reps`
              : `${ex.repRangeLow}-${ex.repRangeHigh} reps`;

          return (
            <li
              key={`${ex.exerciseId}-${idx}`}
              className="group flex items-center gap-2 rounded-lg px-1.5 py-1.5 hover:bg-neutral-900/50"
            >
              <button
                type="button"
                onClick={() => onExerciseAction(ex, "view")}
                className="flex min-w-0 flex-1 items-center gap-3 text-left"
              >
                <span className="inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-neutral-800 text-[11px] font-semibold text-muted">
                  {idx + 1}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-medium text-neutral-100">
                  {ex.name}
                </span>
                <span className="inline-flex shrink-0 items-center gap-1.5">
                  <Chip>{ex.targetSets} sets</Chip>
                  <Chip>{repsLabel}</Chip>
                </span>
              </button>

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label={`More actions for ${ex.name}`}
                    className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-100"
                  >
                    <MoreHorizontal aria-hidden="true" className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-44">
                  <DropdownMenuItem
                    onSelect={() => onExerciseAction(ex, "view")}
                  >
                    View details
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onExerciseAction(ex, "swap")}
                  >
                    Swap exercise
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => onExerciseAction(ex, "edit")}
                  >
                    Edit
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => onExerciseAction(ex, "archive")}
                    className="text-red-300 focus:bg-red-500/10 focus:text-red-200"
                  >
                    Archive
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>

              {/* Mobile-only chips row below the name */}
              <div className="sr-only">
                {ex.targetSets} sets, {repsLabel}
              </div>
            </li>
          );
        })}
        {overflow > 0 ? (
          <li className="pl-9 text-xs text-muted">+ {overflow} more</li>
        ) : null}
      </ul>

      <div className="mt-4 flex items-center gap-2">
        <button
          type="button"
          onClick={onStart}
          disabled={starting}
          className="inline-flex h-11 min-w-0 flex-1 items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <PlayCircle aria-hidden="true" className="h-[18px] w-[18px]" />
          {starting ? "Starting…" : "Start session"}
        </button>
        <button
          type="button"
          onClick={onEdit}
          disabled={starting}
          aria-label="Edit next session"
          title="Edit"
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-neutral-900 text-muted transition hover:bg-neutral-800 hover:text-neutral-100 disabled:cursor-not-allowed disabled:opacity-60"
        >
          <Pencil aria-hidden="true" className="h-4 w-4" />
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
    </div>
  );
}

function Chip({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium text-neutral-200">
      {children}
    </span>
  );
}
