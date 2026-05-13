import type { UnitSystem } from "@/lib/db/types";

/**
 * Weight unit conversion helpers.
 *
 * Storage is always canonical kilograms (see `LoggedSet.weightKg`). These
 * helpers convert to/from the user's display preference so the UI can show
 * "lb" without polluting the data layer.
 *
 * The conversion factor is the NIST-defined exact value
 * (1 lb = 0.45359237 kg); we keep all precision in the math and round only at
 * display time.
 */

const KG_PER_LB = 0.45359237;

export function kgToLb(kg: number): number {
  return kg / KG_PER_LB;
}

export function lbToKg(lb: number): number {
  return lb * KG_PER_LB;
}

/** Convert a canonical kg value to the user's display unit. */
export function kgToDisplay(kg: number, system: UnitSystem): number {
  return system === "imperial" ? kgToLb(kg) : kg;
}

/** Convert a display-unit value back to canonical kg for storage. */
export function displayToKg(value: number, system: UnitSystem): number {
  return system === "imperial" ? lbToKg(value) : value;
}

export function weightUnitLabel(system: UnitSystem): "kg" | "lb" {
  return system === "imperial" ? "lb" : "kg";
}

/**
 * Round to a tidy display precision for weights — half-unit granularity, which
 * matches both the metric 2.5 kg step and the imperial 5 lb step nicely.
 */
export function roundDisplayWeight(value: number): number {
  return Math.round(value * 2) / 2;
}
