"use client";

import { useEffect, useRef, useState } from "react";
import { Check, HelpCircle, Trash2, Trophy } from "lucide-react";

import type { LoggedSet, UnitSystem } from "@/lib/db/types";
import {
  displayToKg,
  kgToDisplay,
  roundDisplayWeight,
  weightUnitLabel,
} from "@/lib/workout/units";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";

import {
  REP_STEP,
  StepperButton,
  WEIGHT_STEP_KG_IMPERIAL,
  WEIGHT_STEP_KG_METRIC,
} from "./Stepper";

/**
 * SetRow — a single (weight, reps, RPE) row inside an `ExerciseCard`.
 *
 * Design rules (from `fn-4-p9x.2`, refreshed in p9x.4 UX overhaul):
 *   - +/- steppers on weight and reps using smart deltas (reps = 1,
 *     metric weight = 2.5 kg, imperial weight = 5 lb).
 *   - Direct numeric entry via `inputmode="decimal"` for the soft-numpad.
 *   - 44px touch targets (handled by Stepper + here via `h-11 min-h-11`).
 *   - RPE is an optional 1..10 selector. We use a compact `<select>` so it
 *     drops a native picker on mobile — overkill for desktop but the right
 *     primitive for thumb-driven use.
 *   - Empty state: untouched inputs render `null`, NOT `0`. The placeholder
 *     (ghost / last-set value) shows in muted grey. First +/- press jumps to
 *     the placeholder before incrementing.
 *   - Labels (WEIGHT (LB|KG) / REPS / RPE+?) only render on the first set
 *     row of an exercise — controlled by `showLabels`.
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
 *
 *   Inline edit mode (logged rows only):
 *   Tapping anywhere on a logged row enters edit mode — inputs become live,
 *   pre-filled with the stored values. Blur that leaves the row saves; Escape
 *   reverts. A trash icon appears in edit mode for deletion with inline confirm.
 */
/** Maximum number of identical sets that can be bulk-logged in one tap. */
export const MAX_BULK_SETS = 10;

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
   * Ghost prefill — last set's weight & reps (or last-session top set as
   * fallback). Rendered as muted-grey placeholder text when the input is
   * empty. First +/- press jumps to this value, then increments. Typing
   * replaces it.
   *
   * Weight is in canonical kg; converted to display units locally.
   */
  placeholderWeightKg?: number;
  placeholderReps?: number;
  /**
   * Default value for the SETS stepper on the editable row. The parent
   * computes this as `max(1, targetSets - alreadyLoggedCount)` so the lifter
   * can bulk-log the entire remaining plan in one tap. Defaults to 1.
   */
  defaultSetCount?: number;
  /** Called when the user commits the row by pressing Log. */
  onLogged?: (input: {
    weightKg: number;
    reps: number;
    rpe?: number;
    setCount: number;
  }) => void;
  /** Disable interaction while a write is in flight. */
  disabled?: boolean;
  /**
   * If true the weight input auto-focuses on mount. The parent sets this on
   * the freshly-revealed next-set row to satisfy the "auto-advance focus"
   * acceptance criterion.
   */
  autoFocus?: boolean;
  /**
   * If true the row renders the WEIGHT/REPS/RPE eyebrow labels above each
   * input. Parent passes true only for the FIRST set row of an exercise to
   * cut visual repetition on subsequent sets.
   */
  showLabels?: boolean;
  /**
   * Called when the user edits and saves a logged set. Receives the updated
   * values in canonical kg. Only applies to rows with `logged` present.
   */
  onEdit?: (updates: { weightKg: number; reps: number; rpe?: number }) => Promise<void>;
  /**
   * Called when the user confirms deletion of a logged set. Only applies to
   * rows with `logged` present.
   */
  onDelete?: () => Promise<void>;
}

export default function SetRow(props: SetRowProps) {
  const {
    setNumber,
    unitSystem,
    logged,
    placeholderWeightKg,
    placeholderReps,
    defaultSetCount,
    onLogged,
    disabled,
    autoFocus,
    showLabels,
    onEdit,
    onDelete,
  } = props;

  const isLogged = Boolean(logged);

  // -- Inline-edit mode for logged rows ---------------------------------------
  // "readonly" = normal green-checkmark display
  // "active"   = inputs live, pre-filled, save-on-blur
  const [editMode, setEditMode] = useState<"readonly" | "active">("readonly");
  // Show inline delete confirm beneath the edit row
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  // "saving" or "deleting" spinner hint
  const [editPending, setEditPending] = useState<"saving" | "deleting" | null>(null);
  const [editError, setEditError] = useState<string | null>(null);

  // Container ref for outside-click / blur detection
  const rowContainerRef = useRef<HTMLDivElement>(null);

  // -- Local edit state ------------------------------------------------------
  // Stored in DISPLAY units for weight so the input string the user sees
  // matches the underlying number exactly (no kg<->lb thrash on every render).
  //
  // For UNTOUCHED editable rows, weight & reps are `null` (empty). The
  // placeholder (ghost) renders as muted-grey hint text in that state.
  // For LOGGED rows we always use the committed values.
  const initialWeightDisplay: number | null = isLogged
    ? roundDisplayWeight(kgToDisplay(logged!.weightKg, unitSystem))
    : null;
  const initialReps: number | null = isLogged ? logged!.reps : null;
  const initialRpe = logged?.rpe;

  const [weightDisplay, setWeightDisplay] = useState<number | null>(
    initialWeightDisplay,
  );
  const [reps, setReps] = useState<number | null>(initialReps);
  const [rpe, setRpe] = useState<number | undefined>(initialRpe);

  // Shadow copies — used to detect whether anything changed on blur.
  const savedWeightDisplay = useRef<number | null>(initialWeightDisplay);
  const savedReps = useRef<number | null>(initialReps);
  const savedRpe = useRef<number | undefined>(initialRpe);

  // Bulk-log "SETS" stepper. Defaults to the parent-supplied remaining-target
  // count (clamped to [1, MAX_BULK_SETS]); a value of 1 keeps today's
  // one-set-per-tap behavior identical. Only meaningful on editable rows.
  const initialSetCount = isLogged
    ? 1
    : Math.min(MAX_BULK_SETS, Math.max(1, defaultSetCount ?? 1));
  const [setCount, setSetCount] = useState<number>(initialSetCount);

  const weightInputRef = useRef<HTMLInputElement | null>(null);
  const repsInputRef = useRef<HTMLInputElement | null>(null);

  // Derived placeholder values, in display units.
  const placeholderWeightDisplay: number | null =
    typeof placeholderWeightKg === "number"
      ? roundDisplayWeight(kgToDisplay(placeholderWeightKg, unitSystem))
      : null;
  const placeholderRepsValue: number | null =
    typeof placeholderReps === "number" ? placeholderReps : null;

  // Reset local state if the placeholder identity or unit system changes
  // (e.g. a previous set was just logged and bumped our placeholder, or
  // the user toggled units in settings while we were on this page).
  // We only touch logged rows once at mount via initial state.
  useEffect(() => {
    if (isLogged) return;
    setWeightDisplay(null);
    setReps(null);
    setRpe(undefined);
    setSetCount(Math.min(MAX_BULK_SETS, Math.max(1, defaultSetCount ?? 1)));
    // We intentionally re-run on placeholder identity / unit change so the
    // ghost text updates and the row visibly "resets" after the parent
    // re-keys it post-log. defaultSetCount is included so the SETS stepper
    // re-syncs to the parent's "remaining target" computation when a fresh
    // next-row mounts after a bulk-log.
  }, [
    isLogged,
    placeholderWeightKg,
    placeholderReps,
    unitSystem,
    defaultSetCount,
  ]);

  // Auto-focus the weight field when the parent advances to this row.
  useEffect(() => {
    if (autoFocus && !isLogged) {
      weightInputRef.current?.focus();
      weightInputRef.current?.select?.();
    }
  }, [autoFocus, isLogged]);

  // When entering edit mode on a logged row, focus the weight input.
  useEffect(() => {
    if (editMode === "active" && isLogged) {
      weightInputRef.current?.focus();
      weightInputRef.current?.select?.();
    }
  }, [editMode, isLogged]);

  // -- Inline edit helpers for logged rows ------------------------------------

  function enterEditMode() {
    if (!isLogged || disabled || editPending) return;
    // Re-seed edit state from the logged values so we always start fresh.
    const w = roundDisplayWeight(kgToDisplay(logged!.weightKg, unitSystem));
    const r = logged!.reps;
    const rpeVal = logged?.rpe;
    setWeightDisplay(w);
    setReps(r);
    setRpe(rpeVal);
    savedWeightDisplay.current = w;
    savedReps.current = r;
    savedRpe.current = rpeVal;
    setShowDeleteConfirm(false);
    setEditError(null);
    setEditMode("active");
  }

  function cancelEditMode() {
    // Revert to saved values, close confirm, go back to readonly.
    setWeightDisplay(savedWeightDisplay.current);
    setReps(savedReps.current);
    setRpe(savedRpe.current);
    setShowDeleteConfirm(false);
    setEditError(null);
    setEditMode("readonly");
  }

  async function commitEdit() {
    if (!onEdit || editPending) return;
    // Check if anything actually changed.
    const wKg =
      weightDisplay != null
        ? Math.round(displayToKg(weightDisplay, unitSystem) * 1000) / 1000
        : Math.round(logged!.weightKg * 1000) / 1000;
    const effectiveReps = reps ?? logged!.reps;

    const noChange =
      wKg === Math.round(logged!.weightKg * 1000) / 1000 &&
      effectiveReps === logged!.reps &&
      rpe === logged?.rpe;

    if (noChange) {
      setEditMode("readonly");
      return;
    }

    setEditPending("saving");
    setEditError(null);
    try {
      await onEdit({
        weightKg: wKg,
        reps: effectiveReps,
        rpe,
      });
      // Update shadows after successful save.
      savedWeightDisplay.current = weightDisplay;
      savedReps.current = effectiveReps;
      savedRpe.current = rpe;
      setEditMode("readonly");
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to save.");
    } finally {
      setEditPending(null);
    }
  }

  async function commitDelete() {
    if (!onDelete || editPending) return;
    setEditPending("deleting");
    setEditError(null);
    try {
      await onDelete();
      // Row will unmount after parent removes it from the array.
    } catch (err) {
      setEditError(err instanceof Error ? err.message : "Failed to delete.");
      setEditPending(null);
    }
  }

  /**
   * Handle blur events on the row container. When focus moves outside the
   * container entirely (relatedTarget is null or not a descendant), save.
   */
  function handleContainerBlur(e: React.FocusEvent<HTMLDivElement>) {
    if (!isLogged || editMode !== "active") return;
    const container = rowContainerRef.current;
    const next = e.relatedTarget as Node | null;
    // If focus is staying inside the row (moving to another input/button in
    // the same container), do nothing.
    if (container && next && container.contains(next)) return;
    // Focus left the row — save.
    void commitEdit();
  }

  /**
   * Keydown handler for the row container in edit mode — Escape reverts.
   */
  function handleContainerKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    if (!isLogged || editMode !== "active") return;
    if (e.key === "Escape") {
      e.preventDefault();
      cancelEditMode();
    }
  }

  // -- Step handlers ---------------------------------------------------------
  // Weight steps are defined in kg (so the canonical store stays clean) and
  // converted to display units on the fly.
  const weightStepKg =
    unitSystem === "imperial" ? WEIGHT_STEP_KG_IMPERIAL : WEIGHT_STEP_KG_METRIC;
  // Silence unused-var warning while keeping the canonical-step constant
  // imported for future use (e.g. analytics on adjustment magnitude).
  void weightStepKg;
  const weightStepDisplay = unitSystem === "imperial" ? 5 : 2.5;

  function stepWeight(direction: 1 | -1) {
    setWeightDisplay((curr) => {
      // First-press semantics: if the field is empty, jump to the placeholder
      // (or 0 if none) BEFORE applying the increment. This mirrors the
      // "tap-to-accept-the-suggestion-then-tweak" workflow from the spec.
      const base = curr ?? placeholderWeightDisplay ?? 0;
      const next = roundDisplayWeight(base + direction * weightStepDisplay);
      return Math.max(0, next);
    });
  }

  function stepReps(direction: 1 | -1) {
    setReps((curr) => {
      const base = curr ?? placeholderRepsValue ?? 0;
      return Math.max(0, base + direction * REP_STEP);
    });
  }

  function stepSetCount(direction: 1 | -1) {
    setSetCount((curr) =>
      Math.min(MAX_BULK_SETS, Math.max(1, curr + direction)),
    );
  }

  // -- Commit ----------------------------------------------------------------
  function commit() {
    if (!onLogged || disabled || isLogged) return;
    // Resolve effective values: if user hasn't touched a field, fall back to
    // the placeholder. A row with neither typed nor placeholder values is
    // unloggable.
    const effectiveWeightDisplay =
      weightDisplay ?? placeholderWeightDisplay ?? null;
    const effectiveReps = reps ?? placeholderRepsValue ?? null;
    if (effectiveReps == null || effectiveReps <= 0) return; // require at least 1 rep
    if (effectiveWeightDisplay == null) return;
    const weightKg = displayToKg(effectiveWeightDisplay, unitSystem);
    // Clamp setCount defensively at the commit boundary — the stepper enforces
    // [1, MAX_BULK_SETS] but a stray prop could push it out of range.
    const safeSetCount = Math.min(
      MAX_BULK_SETS,
      Math.max(1, Math.floor(setCount)),
    );
    onLogged({
      // round canonical kg to 0.001 so we don't accumulate float drift across
      // many lb<->kg roundtrips on imperial-mode increments.
      weightKg: Math.round(weightKg * 1000) / 1000,
      reps: effectiveReps,
      rpe,
      setCount: safeSetCount,
    });
  }

  function handleWeightKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isLogged && editMode === "active") {
        repsInputRef.current?.focus();
        repsInputRef.current?.select?.();
      } else {
        repsInputRef.current?.focus();
        repsInputRef.current?.select?.();
      }
    }
  }
  function handleRepsKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isLogged && editMode === "active") {
        void commitEdit();
      } else {
        commit();
      }
    }
  }

  // -- Render ----------------------------------------------------------------
  // We use controlled inputs where empty string === null in our state model.
  const weightLabel = weightUnitLabel(unitSystem);
  const weightLabelUpper = weightLabel.toUpperCase();

  // Display strings for the inputs. Empty string when null so the `placeholder`
  // attribute is what the user sees.
  const weightInputValue =
    weightDisplay == null
      ? ""
      : Number.isFinite(weightDisplay)
        ? String(weightDisplay)
        : "";
  const repsInputValue =
    reps == null ? "" : Number.isFinite(reps) ? String(reps) : "";

  // Placeholder strings — what's shown when the field is empty. Fall back
  // to em-dash so the field is never visually blank.
  const weightPlaceholder =
    placeholderWeightDisplay != null ? String(placeholderWeightDisplay) : "—";
  const repsPlaceholder =
    placeholderRepsValue != null ? String(placeholderRepsValue) : "—";

  // Common eyebrow-label classes — match `text-muted` muted labels elsewhere.
  const eyebrowClass =
    "text-[10px] font-medium uppercase tracking-wider text-muted";

  // Whether inputs are interactive. For logged rows: only in active edit mode.
  const inputsDisabled = isLogged
    ? editMode !== "active" || !!editPending || !!disabled
    : !!disabled;

  // Row container click — enter edit mode when tapping a logged row in readonly.
  function handleRowClick(e: React.MouseEvent<HTMLDivElement>) {
    if (!isLogged || editMode !== "readonly") return;
    // Don't enter edit if the click is on an interactive element inside (future-proof).
    const target = e.target as HTMLElement;
    if (target.tagName === "BUTTON" || target.tagName === "A") return;
    enterEditMode();
  }

  return (
    <div
      className="space-y-1"
      ref={rowContainerRef}
      onBlur={handleContainerBlur}
      onKeyDown={handleContainerKeyDown}
    >
      <div
        data-set-number={setNumber}
        onClick={handleRowClick}
        role={isLogged && editMode === "readonly" ? "button" : undefined}
        tabIndex={isLogged && editMode === "readonly" ? 0 : undefined}
        onKeyDown={
          isLogged && editMode === "readonly"
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  enterEditMode();
                }
              }
            : undefined
        }
        aria-label={
          isLogged && editMode === "readonly"
            ? `Set ${setNumber}: tap to edit`
            : undefined
        }
        className={`flex min-h-11 items-stretch gap-2 rounded-lg border px-2 py-2 text-sm ${
          isLogged && editMode === "readonly"
            ? "border-border/60 bg-neutral-900/30 text-neutral-300 cursor-pointer hover:border-border hover:bg-neutral-900/50 transition-colors"
            : isLogged && editMode === "active"
              ? "border-accent/60 bg-neutral-900/60 text-neutral-100 ring-1 ring-accent/30"
              : "border-border bg-neutral-900/60 text-neutral-100"
        }`}
      >
        {/* Set number badge — vertically centered in the row regardless of
            whether labels are visible. On the editable row, when SETS > 1 the
            badge widens to a range (e.g. "1–3") to telegraph which set
            numbers the Log tap will create. */}
        <div className="flex min-w-8 shrink-0 items-end justify-center pb-2 text-center text-xs font-medium text-muted">
          {!isLogged && setCount > 1
            ? `${setNumber}–${setNumber + setCount - 1}`
            : setNumber}
        </div>

        {/* Weight cluster */}
        <div className="flex flex-col gap-0.5">
          {showLabels ? (
            <label
              htmlFor={`weight-${setNumber}`}
              className={eyebrowClass}
            >
              WEIGHT ({weightLabelUpper})
            </label>
          ) : null}
          <div className="flex items-center gap-1">
            <StepperButton
              direction="decrement"
              ariaLabel={`Decrease weight by ${weightStepDisplay} ${weightLabel}`}
              onPress={() => stepWeight(-1)}
              disabled={inputsDisabled}
            />
            <input
              ref={weightInputRef}
              id={`weight-${setNumber}`}
              type="text"
              inputMode="decimal"
              pattern="[0-9]*\.?[0-9]*"
              value={weightInputValue}
              placeholder={weightPlaceholder}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setWeightDisplay(null);
                  return;
                }
                // Allow partial decimal entry — only commit numbers when
                // valid; reject NaN by ignoring the keystroke.
                const parsed = Number(raw);
                if (!Number.isNaN(parsed)) {
                  setWeightDisplay(parsed);
                }
              }}
              onKeyDown={handleWeightKeyDown}
              onFocus={(e) => e.currentTarget.select()}
              disabled={inputsDisabled}
              aria-label={`Set ${setNumber} weight in ${weightLabel}`}
              className="h-11 w-16 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-base tabular-nums text-neutral-100 outline-none focus:border-accent disabled:opacity-70 placeholder:text-neutral-500 placeholder:font-mono"
            />
            <StepperButton
              direction="increment"
              ariaLabel={`Increase weight by ${weightStepDisplay} ${weightLabel}`}
              onPress={() => stepWeight(1)}
              disabled={inputsDisabled}
            />
          </div>
        </div>

        {/* Reps cluster */}
        <div className="flex flex-col gap-0.5">
          {showLabels ? (
            <label htmlFor={`reps-${setNumber}`} className={eyebrowClass}>
              REPS
            </label>
          ) : null}
          <div className="flex items-center gap-1">
            <StepperButton
              direction="decrement"
              ariaLabel="Decrease reps"
              onPress={() => stepReps(-1)}
              disabled={inputsDisabled}
            />
            <input
              ref={repsInputRef}
              id={`reps-${setNumber}`}
              type="text"
              inputMode="numeric"
              pattern="[0-9]*"
              value={repsInputValue}
              placeholder={repsPlaceholder}
              onChange={(e) => {
                const raw = e.target.value;
                if (raw === "") {
                  setReps(null);
                  return;
                }
                const parsed = Number(raw);
                if (!Number.isNaN(parsed)) {
                  setReps(Math.max(0, Math.floor(parsed)));
                }
              }}
              onKeyDown={handleRepsKeyDown}
              onFocus={(e) => e.currentTarget.select()}
              disabled={inputsDisabled}
              aria-label={`Set ${setNumber} reps`}
              className="h-11 w-12 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-base tabular-nums text-neutral-100 outline-none focus:border-accent disabled:opacity-70 placeholder:text-neutral-500 placeholder:font-mono"
            />
            <StepperButton
              direction="increment"
              ariaLabel="Increase reps"
              onPress={() => stepReps(1)}
              disabled={inputsDisabled}
            />
          </div>
        </div>

        {/* Sets cluster — bulk-log N identical sets in one tap. Hidden on
            already-logged rows since each historical row is a single set. */}
        {!isLogged ? (
          <div className="ml-auto flex flex-col gap-0.5">
            {showLabels ? (
              <label htmlFor={`sets-${setNumber}`} className={eyebrowClass}>
                SETS
              </label>
            ) : null}
            <div className="flex items-center gap-1">
              <StepperButton
                direction="decrement"
                ariaLabel="Decrease set count"
                onPress={() => stepSetCount(-1)}
                disabled={disabled || setCount <= 1}
              />
              <input
                id={`sets-${setNumber}`}
                type="text"
                inputMode="numeric"
                pattern="[0-9]*"
                value={String(setCount)}
                onChange={(e) => {
                  const raw = e.target.value;
                  if (raw === "") {
                    setSetCount(1);
                    return;
                  }
                  const parsed = Number(raw);
                  if (!Number.isNaN(parsed)) {
                    setSetCount(
                      Math.min(
                        MAX_BULK_SETS,
                        Math.max(1, Math.floor(parsed)),
                      ),
                    );
                  }
                }}
                onFocus={(e) => e.currentTarget.select()}
                disabled={disabled}
                aria-label={`Number of identical sets to log (1 to ${MAX_BULK_SETS})`}
                className="h-11 w-10 rounded-md border border-border bg-panel2 px-1 text-center font-mono text-base tabular-nums text-neutral-100 outline-none focus:border-accent disabled:opacity-70"
              />
              <StepperButton
                direction="increment"
                ariaLabel="Increase set count"
                onPress={() => stepSetCount(1)}
                disabled={disabled || setCount >= MAX_BULK_SETS}
              />
            </div>
          </div>
        ) : null}

        {/* RPE — compact native select for mobile, with help tooltip */}
        <div className={`${isLogged ? "ml-auto" : ""} flex flex-col gap-0.5`}>
          {showLabels ? (
            <div className="flex items-center gap-1">
              <label htmlFor={`rpe-${setNumber}`} className={eyebrowClass}>
                RPE
              </label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    aria-label="What is RPE?"
                    className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-full text-muted transition hover:text-neutral-200 focus:outline-none focus-visible:ring-1 focus-visible:ring-accent"
                  >
                    <HelpCircle aria-hidden="true" className="h-3 w-3" />
                  </button>
                </PopoverTrigger>
                <PopoverContent
                  side="top"
                  align="end"
                  className="max-w-[14rem] text-[11px] leading-relaxed"
                >
                  Rate of Perceived Exertion (1 = very easy, 10 = max effort).
                  Optional.
                </PopoverContent>
              </Popover>
            </div>
          ) : null}
          <select
            id={`rpe-${setNumber}`}
            value={rpe ?? ""}
            onChange={(e) => {
              const v = e.target.value;
              setRpe(v === "" ? undefined : Number(v));
            }}
            disabled={inputsDisabled}
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

        {/* Commit button / logged indicator / edit-mode trash */}
        <div className="flex flex-col gap-0.5">
          {showLabels ? (
            // Invisible spacer so the Log button stays vertically aligned
            // with the inputs when labels are showing.
            <span aria-hidden="true" className={eyebrowClass}>
              &nbsp;
            </span>
          ) : null}
          {isLogged ? (
            editMode === "active" ? (
              /* Trash icon — only visible in edit mode */
              <button
                type="button"
                aria-label="Delete this set"
                onClick={(e) => {
                  e.stopPropagation();
                  setShowDeleteConfirm((v) => !v);
                }}
                disabled={!!editPending}
                className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-red-500/40 bg-red-500/10 text-red-400 transition hover:bg-red-500/20 disabled:cursor-not-allowed disabled:opacity-50"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </button>
            ) : logged?.isPR ? (
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
              disabled={
                disabled ||
                // Disable Log when there's nothing to commit AND nothing to
                // fall back to via placeholder.
                ((reps ?? placeholderRepsValue ?? 0) <= 0) ||
                (weightDisplay == null && placeholderWeightDisplay == null)
              }
              className="inline-flex h-11 shrink-0 items-center justify-center rounded-lg bg-accent px-3 text-sm font-semibold text-neutral-900 transition active:scale-95 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Log
            </button>
          )}
        </div>
      </div>

      {/* Saving indicator */}
      {editPending === "saving" ? (
        <p className="px-2 text-[11px] text-muted">Saving…</p>
      ) : null}

      {/* Edit error */}
      {editError ? (
        <p
          role="alert"
          className="px-2 text-[11px] text-red-400"
        >
          {editError}
        </p>
      ) : null}

      {/* Inline delete confirm */}
      {showDeleteConfirm ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2">
          <p className="flex-1 text-[12px] text-red-300">Delete this set?</p>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void commitDelete();
            }}
            disabled={!!editPending}
            className="rounded-md bg-red-500 px-3 py-1 text-[11px] font-semibold text-white transition hover:bg-red-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {editPending === "deleting" ? "Deleting…" : "Delete"}
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShowDeleteConfirm(false);
            }}
            disabled={!!editPending}
            className="rounded-md border border-border bg-neutral-800 px-3 py-1 text-[11px] font-medium text-neutral-300 transition hover:bg-neutral-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Cancel
          </button>
        </div>
      ) : null}
    </div>
  );
}
