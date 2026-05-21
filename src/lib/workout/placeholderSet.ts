import type { LoggedSet } from "@/lib/db/types";

/**
 * Returns true if a logged set is an "anchor" placeholder (written when the
 * user quick-adds an exercise so it surfaces as a card before any real set
 * is logged).
 *
 * Source of truth is the explicit `placeholder: true` flag. We additionally
 * accept the legacy `weight=0 && reps=0` pattern ONLY when `placeholder` is
 * `undefined` (i.e. the doc was written before the field existed). A set
 * with `placeholder === false` is always treated as real, so a user who
 * legitimately logs 0kg × 0reps (e.g. assisted bodyweight failed rep) is
 * not silently dropped.
 */
export function isPlaceholderSet(s: Pick<LoggedSet, "placeholder" | "weightKg" | "reps">): boolean {
  if (s.placeholder === true) return true;
  if (s.placeholder === undefined && s.weightKg === 0 && s.reps === 0) return true;
  return false;
}
