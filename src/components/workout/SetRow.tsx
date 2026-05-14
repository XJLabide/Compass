"use client";

import { useEffect, useRef, useState } from "react";
import { Check, Trophy } from "lucide-react";

import type { LoggedSet, UnitSystem } from "@/lib/db/types";
import {
  displayToKg,
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";

import {
  REP_STEP,
  StepperButton,
  WEIGHT_STEP_KG_IMPERIAL,
  WEIGHT_STEP_KG_METRIC,
} from "./Stepper";

/**
 * SetRow — a single (weight, reps, RPE) row inside an `ExerciseCard`.
 *
 * Design rules (from `fn-4-p9x.2`):
 *   - +/- steppers on weight and reps using smart deltas (reps = 1,
 *     metric weight = 2.5 kg, imperial weight = 5 lb).
 *   - Direct numeric entry via `inputmode="decimal"` for the soft-numpad.
 *   - 44px touch targets (handled by Stepper + here via `h-11 min-h-11`).
 *   - RPE is an optional 1..10 selector. We use a compact `<select>` so it
 *     drops a native picker on mobile — overkill for desktop but the right
 *     primitive for thumb-driven use.
 *
 * Data model:
 *   The row is "uncommitted" until the user presses **Log**. While editing,
 *   state lives locally so direct keyboard entry doesn't fire a Firestore
 *   write per keystroke. Pressing Log calls `onLogged(set)`; the parent owns
 *   the array semantics (append vs. replace) and the Firestore write. After
 *   logging, the row resets to its starting target (or last value, parent's
 *   call via `prefill`) and `onLogged` may move focus to the next row.
 *
 *   Already-logged sets are rendered read-only with the same row shape so
 *   the eye doesn't have to re-parse the layout — the only difference is the
 *   "Log" button collapses into a checkmark and inputs are disabled.
 */
export interface SetRowProps {
  /** Display index — what the lifter sees ("Set 1", "Set 2", ...). 1-based. */
  setNumber: number;
  /** Which unit system to render weight in. Storage is always kg. */
  unitSystem: UnitSystem;
  /**
   * If present, the row represents an already-logged set (read-only). If
   * absent the row is the "next set" editor.
   */
  logged?: LoggedSet;
  /**
   * Starting values for the editor. Typically derived from the previous set
   * of the same exercise so a lifter only adjusts what changed.
   */
  prefill?: { weightKg: number; reps: number; rpe?: number };
  /**
   * Optional "ghost" suggestion sourced from a prior session (fn-4-p9x.3
   * cross-session prefill). Unlike `prefill`, ghost values are NOT pushed
   * into the input state — they render as placeholder/hint text inside the
   * empty input. The user must touch the stepper or type a value to "accept"
   * the suggestion (which then becomes the committed value). This prevents
   * accidentally logging stale numbers without thinking.
   */
  ghost?: { weightKg: number; reps: number; rpe?: number };
  /** Called when the user commits the row by pressing Log. */
  onLogged?: (input: { weightKg: number; reps: number; rpe?: number }) => void;
  /** Disable interaction while a write is in flight. */
  disabled?: boolean;
  /**
   * If true the weight input auto-focuses on mount. The parent sets this on
   * the freshly-revealed next-set row to satisfy the "auto-advance focus"
   * acceptance criterion.
   */
  autoFocus?: boolean;
}

export default function SetRow(props: SetRowProps) {
  const {
    setNumber,
    unitSystem,
    logged,
    prefill,
    ghost,
    onLogged,
    disabled,
    autoFocus,
  } = props;

  const isLogged = Boolean(logged);

  // -- Local edit state ------------------------------------------------------
  // Stored in DISPLAY units for weight so the input string the user sees
  // matches the underlying number exactly (no kg<->lb thrash on every render).
  const initialWeightDisplay = roundDisplayWeight(
    kgToDisplay(
      logged?.weightKg ?? prefill?.weightKg ?? 0,
      unitSystem,
    ),
  );
  const initialReps = logged?.reps ?? prefill?.reps ?? 0;
  const initialRpe = logged?.rpe ?? prefill?.rpe;

  const [weightDisplay, setWeightDisplay] =
    useState<number>(initialWeightDisplay);
  const [reps, setReps] = useState<number>(initialReps);
  const [rpe, setRpe] = useState<number | undefined>(initialRpe);

  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const repsInputRef = useRef<HTMLInputElement | null>(null);

  // Reset local state if the prefill or unit system changes (e.g. a previous
  // set was just logged and bumped our prefill, or the user toggled units in
  // settings while we were on this page).
  useEffect(() => {
    if (isLogged) return;
    setWeightDisplay(
      roundDisplayWeight(
        kgToDisplay(prefill?.weightKg ?? 0, unitSystem),
      ),
    );
    setReps(prefill?.reps ?? 0);
    setRpe(prefill?.rpe);
    // We intentionally re-run on prefill identity / unit change.
  }, [
    isLogged,
    prefill?.weightKg,
    prefill?.reps,
    prefill?.rpe,
    unitSystem,
  ]);

  // Auto-focus the weight field when the parent advances to this row.
  useEffect(() => {
    if (autoFocus && !isLogged) {
      weightInputRef.current?.focus();
      weightInputRef.current?.select?.();
    }
  }, [autoFocus, isLogged]);

  // -- Step handlers ---------------------------------------------------------
  // Weight steps are defined in kg (so the canonical store stays clean) and
  // converted to display units on the fly.
  const weightStepKg =
    unitSystem === "imperial" ? WEIGHT_STEP_KG_IMPERIAL : WEIGHT_STEP_KG_METRIC;
  const weightStepDisplay = unitSystem === "imperial" ? 5 : 2.5;

  function stepWeight(direction: 1 | -1) {
    setWeightDisplay((curr) => {
      const next = roundDisplayWeight(curr + direction * weightStepDisplay);
      return Math.max(0, next);
    });
  }

  function stepReps(direction: 1 | -1) {
    setReps((curr) => Math.max(0, curr + direction * REP_STEP));
  }

  // -- Commit ----------------------------------------------------------------
  function commit() {
    if (!onLogged || disabled || isLogged) return;
    if (reps <= 0) return; // require at least 1 rep
    const weightKg = displayToKg(weightDisplay, unitSystem);
    onLogged({
      // round canonical kg to 0.001 so we don't accumulate float drift across
      // many lb<->kg roundtrips on imperial-mode increments.
      weightKg: Math.round(weightKg * 1000) / 1000,
      reps,
      rpe,
    });
  }

  function handleWeightKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      repsInputRef.current?.focus();
      repsInputRef.current?.select?.();
    }
  }
  function handleRepsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      commit();
    }
  }

  // -- Ghost (cross-session suggestion) -------------------------------------
  // We show the ghost as placeholder-style text inside the empty inputs and
  // as a one-tap "Use last" affordance. Accepting the ghost pushes its
  // values into local state (same path the stepper buttons use), so the
  // ordinary commit flow handles persistence.
  const ghostWeightDisplay = ghost
    ? roundDisplayWeight(kgToDisplay(ghost.weightKg, unitSystem))
    : null;
  const ghostReps = ghost?.reps ?? null;
  const ghostVisible =
    !isLogged && ghost !== undefined && weightDisplay === 0 && reps === 0;

  function acceptGhost() {
    if (!ghost) return;
    setWeightDisplay(
      roundDisplayWeight(kgToDisplay(ghost.weightKg, unitSystem)),
    );
    setReps(ghost.reps);
    if (typeof ghost.rpe === "number") setRpe(ghost.rpe);
  }

  // -- Render ----------------------------------------------------------------
  // Note: we use uncontrolled-ish patterns for the number inputs (controlled
  // value but accepting bare text) so the user can transiently clear the
  // field while typing. Empty becomes 0.
  const weightLabel = weightUnitLabel(unitSystem);

  return (
    <div className="space-y-1">
    {ghostVisible ? (
      <button
        type="button"
        onClick={acceptGhost}
        className="ml-10 inline-flex items-center gap-1 rounded-md border border-dashed border-border bg-transparent px-2 py-0.5 text-[10px] font-medium text-muted transition hover:border-accent2/60 hover:text-accent2"
        aria-label={`Use previous: ${ghostWeightDisplay} ${weightLabel} × ${ghostReps} reps`}
      >
        Last: {ghostWeightDisplay} {weightLabel} × {ghostReps}
        {typeof ghost?.rpe === "number" ? ` @${ghost.rpe}` : ""}
        <span aria-hidden="true">↩</span>
      </button>
    ) : null}
    <div
      data-set-number={setNumber}
      className={`flex min-h-11 items-center gap-2 rounded-lg border px-2 py-2 text-sm ${
        isLogged
          ? "border-border/60 bg-neutral-900/30 text-neutral-300"
          : "border-border bg-neutral-900/60 text-neutral-100"
      }`}
    >
      {/* Set number badge */}
      <div className="w-8 shrink-0 text-center text-xs font-medium text-muted">
        {setNumber}
      </div>

      {/* Weight cluster */}
      <div className="flex items-center gap-1">
        <StepperButton
          direction="decrement"
          ariaLabel={`Decrease weight by ${weightStepDisplay} ${weightLabel}`}
          onPress={() => stepWeight(-1)}
          disabled={isLogged || disabled}
        />
        <label className="sr-only" htmlFor={`weight-${setNumber}`}>
          Weight in {weightLabel}
        </label>
        <input
          ref={weightInputRef}
          id={`weight-${setNumber}`}
          type="number"
          inputMode="decimal"
          step={weightStepDisplay}
          min={0}
          value={Number.isFinite(weightDisplay) ? weightDisplay : 0}
          onChange={(e) => {
            const raw = e.target.value;
            setWeightDisplay(raw === "" ? 0 : Number(raw));
          }}
          onKeyDown={handleWeightKeyDown}
          onFocus={(e) => e.currentTarget.select()}
          disabled={isLogged || disabled}
          aria-label={`Set ${setNumber} weight in ${weightLabel}`}
          className="h-11 w-16 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-base tabular-nums text-neutral-100 outline-none focus:border-accent disabled:opacity-70"
        />
        <StepperButton
          direction="increment"
          ariaLabel={`Increase weight by ${weightStepDisplay} ${weightLabel}`}
          onPress={() => stepWeight(1)}
          disabled={isLogged || disabled}
        />
      </div>

      {/* Reps cluster */}
      <div className="flex items-center gap-1">
        <StepperButton
          direction="decrement"
          ariaLabel="Decrease reps"
          onPress={() => stepReps(-1)}
          disabled={isLogged || disabled}
        />
        <label className="sr-only" htmlFor={`reps-${setNumber}`}>
          Reps
        </label>
        <input
          ref={repsInputRef}
          id={`reps-${setNumber}`}
          type="number"
          inputMode="numeric"
          step={1}
          min={0}
          value={Number.isFinite(reps) ? reps : 0}
          onChange={(e) => {
            const raw = e.target.value;
            setReps(raw === "" ? 0 : Math.max(0, Math.floor(Number(raw))));
          }}
          onKeyDown={handleRepsKeyDown}
          onFocus={(e) => e.currentTarget.select()}
          disabled={isLogged || disabled}
          aria-label={`Set ${setNumber} reps`}
          className="h-11 w-12 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-base tabular-nums text-neutral-100 outline-none focus:border-accent disabled:opacity-70"
        />
        <StepperButton
          direction="increment"
          ariaLabel="Increase reps"
          onPress={() => stepReps(1)}
          disabled={isLogged || disabled}
        />
      </div>

      {/* RPE — compact native select for mobile */}
      <div className="ml-auto flex items-center gap-1">
        <label
          htmlFor={`rpe-${setNumber}`}
          className="text-[10px] font-medium uppercase tracking-wide text-muted"
        >
          RPE
        </label>
        <select
          id={`rpe-${setNumber}`}
          value={rpe ?? ""}
          onChange={(e) => {
            const v = e.target.value;
            setRpe(v === "" ? undefined : Number(v));
          }}
          disabled={isLogged || disabled}
          aria-label={`Set ${setNumber} RPE`}
          className="h-11 w-14 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-sm text-neutral-100 outline-none focus:border-accent disabled:opacity-70"
        >
          <option value="">–</option>
          {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </div>

      {/* Commit button — collapses into a static check (or PR trophy) for already-logged rows */}
      {isLogged ? (
        logged?.isPR ? (
          <span
            aria-label="Personal record"
            title="Personal record"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-amber-400/50 bg-amber-400/10 text-amber-300 shadow-[0_0_0_1px_rgba(251,191,36,0.15)]"
          >
            <Trophy className="h-4 w-4" />
          </span>
        ) : (
          <span
            aria-label="Logged"
            className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-accent2/40 bg-accent2/10 text-accent2"
            title="Logged"
          >
            <Check className="h-4 w-4" />
          </span>
        )
      ) : (
        <button
          type="button"
          onClick={commit}
          disabled={disabled || reps <= 0}
          className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-3 text-sm font-semibold text-neutral-900 transition active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          Log
        </button>
      )}
    </div>
    </div>
  );
}
