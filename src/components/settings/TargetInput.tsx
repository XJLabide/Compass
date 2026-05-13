"use client";

import { useEffect, useState } from "react";

type Props = {
  id: string;
  label: string;
  /** Canonical numeric value (e.g. grams of protein, lb/week gain). */
  value: number;
  /** Called with the parsed numeric value when the user commits (blur / Enter). */
  onCommit: (next: number) => void;
  /** Suffix shown to the right of the input (e.g. "g", "lb/week"). */
  unit?: string;
  /** Minimum allowed value (inclusive). Defaults to 0. */
  min?: number;
  /** Maximum allowed value (inclusive). */
  max?: number;
  /** Decimal step. Defaults to 1. Use 0.1 for fractional inputs. */
  step?: number;
  disabled?: boolean;
};

function format(value: number, step: number): string {
  if (!Number.isFinite(value)) return "";
  if (step >= 1) return String(Math.round(value));
  // Two decimals max for fractional steps.
  return String(Math.round(value * 100) / 100);
}

/**
 * Numeric target input. Commits on blur or Enter; rejects NaN and out-of-range
 * values by reverting to the last good value.
 */
export default function TargetInput({
  id,
  label,
  value,
  onCommit,
  unit,
  min = 0,
  max,
  step = 1,
  disabled,
}: Props) {
  const [draft, setDraft] = useState<string>(() => format(value, step));

  // Sync external value into the draft when it changes (e.g. after Firestore
  // write resolves). We only overwrite when the input is not currently focused
  // to avoid clobbering an in-progress edit — for that we compare against
  // document.activeElement at effect time.
  useEffect(() => {
    if (typeof document !== "undefined" && document.activeElement?.id === id) {
      return;
    }
    setDraft(format(value, step));
  }, [value, step, id]);

  const commit = () => {
    const parsed = Number(draft);
    if (!Number.isFinite(parsed)) {
      setDraft(format(value, step));
      return;
    }
    if (parsed < min || (max !== undefined && parsed > max)) {
      setDraft(format(value, step));
      return;
    }
    if (parsed === value) {
      // Still normalize formatting (e.g. "180.0" -> "180").
      setDraft(format(parsed, step));
      return;
    }
    onCommit(parsed);
  };

  return (
    <label htmlFor={id} className="block">
      <span className="block text-sm font-medium text-neutral-200">{label}</span>
      <div className="mt-1 flex items-center gap-2">
        <input
          id={id}
          type="number"
          inputMode="decimal"
          value={draft}
          min={min}
          max={max}
          step={step}
          disabled={disabled}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              (e.target as HTMLInputElement).blur();
            }
          }}
          className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 outline-none transition focus:border-neutral-500 disabled:cursor-not-allowed disabled:opacity-60"
        />
        {unit ? (
          <span className="text-xs text-muted whitespace-nowrap">{unit}</span>
        ) : null}
      </div>
    </label>
  );
}
