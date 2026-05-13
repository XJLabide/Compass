"use client";

import clsx from "clsx";

import type { UnitSystem } from "@/lib/db/types";

type Props = {
  value: UnitSystem;
  onChange: (next: UnitSystem) => void;
  disabled?: boolean;
};

const OPTIONS: ReadonlyArray<{ value: UnitSystem; label: string }> = [
  { value: "imperial", label: "Imperial (lb)" },
  { value: "metric", label: "Metric (kg)" },
];

/**
 * Display-only unit system toggle.
 *
 * IMPORTANT: switching units does NOT rewrite stored history. Stored values
 * remain canonical (kg/ml/g) — display layers convert based on this preference.
 */
export default function UnitToggle({ value, onChange, disabled }: Props) {
  return (
    <div
      role="radiogroup"
      aria-label="Unit system"
      className="inline-flex w-full overflow-hidden rounded-lg border border-border bg-neutral-900"
    >
      {OPTIONS.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            role="radio"
            aria-checked={active}
            disabled={disabled}
            onClick={() => {
              if (!active) onChange(opt.value);
            }}
            className={clsx(
              "flex-1 px-3 py-2 text-sm font-medium transition",
              active
                ? "bg-neutral-100 text-neutral-900"
                : "text-neutral-300 hover:bg-neutral-800",
              disabled && "cursor-not-allowed opacity-60",
            )}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
