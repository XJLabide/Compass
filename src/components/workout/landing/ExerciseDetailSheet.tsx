"use client";

import { Archive, Pencil, Repeat } from "lucide-react";

import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import type { Exercise, PlannedExercise, UnitSystem } from "@/lib/db/types";
import {
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";

/**
 * Right-side (mobile: still right — radix-sheet's `right` variant slides in
 * from the edge on all viewport widths) drawer that shows a single exercise
 * in full detail: GIF demo, planned sets/reps, last-time stats, and a
 * three-button action bar.
 *
 * Auto-play GIF: the `<img>` tag plays animated GIFs by default. This is the
 * right UX for a dedicated detail view (the user opened this on purpose);
 * the workout logger keeps its tap-to-play behavior to avoid distraction
 * mid-set.
 */

export interface ExerciseDetailSheetProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  exercise: Exercise | null;
  planned: PlannedExercise | null;
  /** Heaviest set from the most recent prior session of this slot, if any. */
  lastTopSet?: { weightKg: number; reps: number } | null;
  /** User's display preference for weights. */
  unitSystem?: UnitSystem;
  actions: {
    onSwap(): void;
    onEdit(): void;
    onArchive(): void;
  };
}

export default function ExerciseDetailSheet({
  open,
  onOpenChange,
  exercise,
  planned,
  lastTopSet,
  unitSystem = "imperial",
  actions,
}: ExerciseDetailSheetProps) {
  const name = planned?.name ?? exercise?.name ?? "Exercise";
  const gifUrl = exercise?.gifUrl;
  const instructions = exercise?.instructions ?? [];
  const muscle = exercise?.primaryMuscle;
  const equipments = exercise?.equipments ?? [];
  const isMaster = exercise?.source === "master" || exercise?.seeded === true;

  const repsLabel = planned
    ? planned.repRangeLow === planned.repRangeHigh
      ? `${planned.repRangeLow}`
      : `${planned.repRangeLow}-${planned.repRangeHigh}`
    : null;

  const unit = weightUnitLabel(unitSystem);
  const lastLabel = lastTopSet
    ? `${roundDisplayWeight(kgToDisplay(lastTopSet.weightKg, unitSystem))} ${unit} × ${lastTopSet.reps}`
    : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex w-full flex-col gap-0 overflow-hidden border-border bg-panel p-0 sm:max-w-md"
      >
        {/* Sticky header with name + (radix close X is absolute) */}
        <SheetHeader className="shrink-0 border-b border-border px-5 py-4 pr-12 text-left">
          <SheetTitle className="text-base font-semibold text-neutral-100">
            {name}
          </SheetTitle>
          {planned ? (
            <SheetDescription className="text-xs text-muted">
              {planned.targetSets} sets · {repsLabel} reps
            </SheetDescription>
          ) : null}
        </SheetHeader>

        {/* Scrollable body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {/* GIF (auto-plays) */}
          <div className="overflow-hidden rounded-xl border border-border bg-bg">
            {gifUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={gifUrl}
                alt={`${name} demonstration`}
                className="h-56 w-full object-contain"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <div className="flex h-56 w-full items-center justify-center text-xs text-muted">
                No demo available
              </div>
            )}
          </div>

          {/* Muscle + equipment chips */}
          {(muscle || equipments.length > 0) && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {muscle ? (
                <span className="rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium capitalize text-neutral-200">
                  {muscle}
                </span>
              ) : null}
              {equipments.map((eq) => (
                <span
                  key={eq}
                  className="rounded-md bg-neutral-800 px-2 py-0.5 text-[11px] font-medium capitalize text-neutral-200"
                >
                  {eq}
                </span>
              ))}
            </div>
          )}

          {/* Last time + Planned */}
          <dl className="mt-4 space-y-2 text-sm">
            <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-xs uppercase tracking-wide text-muted">
                Last time
              </dt>
              <dd className="font-medium text-neutral-100">
                {lastLabel ?? "—"}
              </dd>
            </div>
            <div className="flex items-baseline justify-between gap-2 border-b border-border/60 pb-2">
              <dt className="text-xs uppercase tracking-wide text-muted">
                Planned
              </dt>
              <dd className="font-medium text-neutral-100">
                {planned
                  ? `${planned.targetSets} × ${repsLabel}`
                  : "—"}
              </dd>
            </div>
          </dl>

          {/* How to (collapsible via native <details>) */}
          {instructions.length > 0 ? (
            <details className="mt-4 rounded-lg border border-border bg-neutral-900/40 px-3 py-2 text-sm">
              <summary className="cursor-pointer select-none text-xs font-semibold uppercase tracking-wide text-muted hover:text-neutral-100">
                How to
              </summary>
              <ol className="mt-2 list-decimal space-y-1.5 pl-5 text-xs text-neutral-200">
                {instructions.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
            </details>
          ) : null}

          {/* Bottom padding so the action bar doesn't clip the last detail */}
          <div className="h-4" aria-hidden="true" />
        </div>

        {/* Action bar */}
        <div className="shrink-0 border-t border-border bg-neutral-900/60 px-3 py-3">
          <div className="grid grid-cols-3 gap-2">
            <ActionButton onClick={actions.onSwap} icon={Repeat} label="Swap" />
            <ActionButton onClick={actions.onEdit} icon={Pencil} label="Edit" />
            <ActionButton
              onClick={actions.onArchive}
              icon={Archive}
              label="Archive"
              disabled={isMaster}
              tone="danger"
            />
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function ActionButton({
  onClick,
  icon: Icon,
  label,
  disabled,
  tone = "default",
}: {
  onClick(): void;
  // Lucide icons are `ForwardRefExoticComponent`s with a wide prop type; accept
  // any component that takes a `className` to avoid wrestling the generic.
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  disabled?: boolean;
  tone?: "default" | "danger";
}) {
  const base =
    "inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border text-xs font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const themed =
    tone === "danger"
      ? "border-red-500/40 bg-red-500/5 text-red-300 hover:bg-red-500/15"
      : "border-border bg-neutral-900 text-neutral-100 hover:bg-neutral-800";
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${themed}`}
      aria-label={label}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}
