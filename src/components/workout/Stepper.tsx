"use client";

import { Minus, Plus } from "lucide-react";

/**
 * Stepper — paired `+` / `-` buttons surrounding a labeled value display or
 * input. The actual value display lives in the parent (a `<SetRow />`); this
 * component just renders the buttons. Splitting the visual control this way
 * lets a numeric `<input>` sit between the buttons and own its own focus/edit
 * state without being re-keyed on every increment.
 *
 * Touch targets are 44x44 px to satisfy the WCAG/AAA mobile recommendation;
 * the parent row should reserve at least that much height. We render `Minus`
 * and `Plus` icons via `lucide-react` for visual parity with the rest of the
 * app shell.
 */
export function StepperButton({
  direction,
  onPress,
  ariaLabel,
  disabled,
}: {
  direction: "decrement" | "increment";
  onPress: () => void;
  ariaLabel: string;
  disabled?: boolean;
}) {
  const Icon = direction === "increment" ? Plus : Minus;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={disabled}
      aria-label={ariaLabel}
      className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-lg border border-border bg-panel2 text-neutral-100 transition active:scale-95 hover:bg-neutral-800 disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon aria-hidden="true" className="h-4 w-4" />
    </button>
  );
}

/**
 * Smart deltas — what a single `+` / `-` press changes the value by.
 *
 * Reps are always integer steps of 1. Weight steps depend on the user's
 * display unit system: metric users adjust in 2.5 kg increments (matches the
 * smallest pair of plates on a standard rack), imperial users in 5 lb
 * increments. The 5 lb delta is converted to kg before storage so the
 * canonical `weightKg` stays consistent (5 lb ≈ 2.2679 kg).
 */
export const REP_STEP = 1;
export const WEIGHT_STEP_KG_METRIC = 2.5;
export const WEIGHT_STEP_KG_IMPERIAL = 5 / 2.2046226218;
