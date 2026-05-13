"use client";

import clsx from "clsx";

/**
 * Chip selector for 1..5 subjective ratings (sleep quality, mood).
 *
 * Renders 5 buttons in a row, each 44px tall to satisfy the touch-target
 * minimum. The currently selected value gets an accent fill; tapping the
 * already-selected chip clears the selection so partial entry is possible.
 */
export interface RatingChipProps {
  id: string;
  label: string;
  value?: number;
  onChange: (next: number | undefined) => void;
  /** Optional helper text shown under the chip row. */
  hint?: string;
}

const VALUES = [1, 2, 3, 4, 5] as const;

export default function RatingChip({
  id,
  label,
  value,
  onChange,
  hint,
}: RatingChipProps) {
  return (
    <div>
      <div
        id={`${id}-label`}
        className="block text-sm font-medium text-neutral-200"
      >
        {label}
      </div>
      <div
        role="radiogroup"
        aria-labelledby={`${id}-label`}
        className="mt-2 grid grid-cols-5 gap-2"
      >
        {VALUES.map((n) => {
          const selected = value === n;
          return (
            <button
              key={n}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(selected ? undefined : n)}
              className={clsx(
                "h-11 min-w-11 rounded-lg border text-sm font-semibold transition-colors",
                selected
                  ? "border-accent bg-accent/15 text-accent"
                  : "border-border bg-neutral-900 text-neutral-200 hover:bg-neutral-800",
              )}
            >
              {n}
            </button>
          );
        })}
      </div>
      {hint ? <p className="mt-1 text-xs text-muted">{hint}</p> : null}
    </div>
  );
}
