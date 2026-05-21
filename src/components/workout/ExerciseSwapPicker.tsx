"use client";

import { useEffect, useMemo, useState } from "react";
import { X, Search, ArrowLeftRight } from "lucide-react";
import clsx from "clsx";

import { EXERCISE_MASTER, type SeedExercise } from "@/lib/data/exerciseMaster";
import { suggestSubstitutes } from "@/lib/workout/exerciseSubs";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";

/**
 * Modal that picks a replacement exercise for a swap, or any exercise for an
 * "add" action. When `forExerciseId` is provided, the top section shows
 * smart substitutes (same primary muscle, ranked by same-category first).
 * When omitted (add flow), the suggestions section shows a curated "common
 * adds" list, with the full library beneath.
 *
 * UX:
 *   - Title + close button
 *   - Search field (live filter across the entire library)
 *   - Suggestions section (collapsible by virtue of "Show all" toggle)
 *   - All exercises section grouped by primaryMuscle alphabetically
 *
 * The picker does not write to Firestore — it just calls `onPick(newId)`.
 */
export interface ExerciseSwapPickerProps {
  open: boolean;
  /** Original exercise id being replaced. Omit for "add new" flow. */
  forExerciseId?: string;
  /** Hide these ids from the list (already-planned in the parent edit dialog). */
  excludeIds?: string[];
  onPick: (newExerciseId: string) => void;
  onCancel: () => void;
}

// Curated "common adds" for the add-exercise flow — one or two popular picks
// per primary muscle, ordered to feel like a typical accessory menu.
const COMMON_ADD_IDS = [
  "bench-press",
  "barbell-row",
  "overhead-press",
  "back-squat",
  "deadlift",
  "lat-pulldown",
  "barbell-curl",
  "tricep-pushdown",
  "lateral-raise",
  "hip-thrust",
  "plank",
];

export default function ExerciseSwapPicker({
  open,
  forExerciseId,
  excludeIds,
  onPick,
  onCancel,
}: ExerciseSwapPickerProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);

  useBodyScrollLock(open);

  // Reset state whenever the picker is opened.
  useEffect(() => {
    if (open) {
      setQuery("");
      setShowAll(false);
    }
  }, [open]);

  // Esc to close
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onCancel]);

  const excludeSet = useMemo(() => {
    const s = new Set<string>(excludeIds ?? []);
    if (forExerciseId) s.add(forExerciseId);
    return s;
  }, [excludeIds, forExerciseId]);

  // Suggestions — either substitutes (swap flow) or common adds (add flow).
  const suggestions: SeedExercise[] = useMemo(() => {
    if (forExerciseId) {
      return suggestSubstitutes(forExerciseId).filter((e) => !excludeSet.has(e.id));
    }
    return COMMON_ADD_IDS
      .map((id) => EXERCISE_MASTER.find((e) => e.id === id))
      .filter((e): e is SeedExercise => !!e && !excludeSet.has(e.id));
  }, [forExerciseId, excludeSet]);

  // Full library minus excluded + minus a stripped query filter.
  const filteredAll: SeedExercise[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    const base = EXERCISE_MASTER.filter((e) => !excludeSet.has(e.id));
    if (!q) return base;
    return base.filter(
      (e) =>
        e.name.toLowerCase().includes(q) ||
        e.primaryMuscle.toLowerCase().includes(q),
    );
  }, [excludeSet, query]);

  // Group filtered library by primary muscle (alphabetic muscle, alphabetic name within).
  const grouped = useMemo(() => {
    const map = new Map<string, SeedExercise[]>();
    filteredAll.forEach((e) => {
      const arr = map.get(e.primaryMuscle) ?? [];
      arr.push(e);
      map.set(e.primaryMuscle, arr);
    });
    const groups: Array<{ muscle: string; items: SeedExercise[] }> = [];
    [...map.keys()]
      .sort((a, b) => a.localeCompare(b))
      .forEach((muscle) => {
        const items = (map.get(muscle) ?? []).sort((a, b) =>
          a.name.localeCompare(b.name),
        );
        groups.push({ muscle, items });
      });
    return groups;
  }, [filteredAll]);

  if (!open) return null;

  const title = forExerciseId ? "Swap exercise" : "Add exercise";
  const showSearch = showAll || !!query;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={title}
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/65 backdrop-blur sm:items-center p-4"
      onClick={onCancel}
    >
      <div
        className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center gap-2.5 border-b border-border px-4 py-3.5">
          <ArrowLeftRight className="h-4 w-4 text-accent" />
          <h2 className="text-sm font-semibold text-neutral-100">{title}</h2>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Close"
            className="ml-auto inline-flex h-8 w-8 items-center justify-center rounded-md text-muted hover:bg-neutral-800 hover:text-neutral-100"
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </button>
        </div>

        {/* Search (always visible when "show all" toggled on) */}
        {showSearch ? (
          <div className="border-b border-border p-2">
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                autoFocus
                placeholder="Search exercises…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                className="h-10 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-neutral-100 outline-none focus:border-accent"
              />
            </div>
          </div>
        ) : null}

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-3 py-2">
          {/* Suggestions */}
          {!query && suggestions.length > 0 ? (
            <>
              <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                {forExerciseId ? "Suggestions" : "Common adds"}
              </p>
              <ul className="space-y-1">
                {suggestions.map((e) => (
                  <li key={`sug-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => onPick(e.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-neutral-900/40 px-3 py-2 text-left text-sm text-neutral-100 transition hover:border-accent/60 hover:bg-neutral-900/70"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {e.name}
                      </span>
                      <span className="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        {e.primaryMuscle}
                      </span>
                      <span
                        className={clsx(
                          "shrink-0 rounded-full px-2 py-0.5 text-[10px] uppercase tracking-wide",
                          e.category === "compound"
                            ? "border border-accent/40 bg-accent/10 text-accent"
                            : "border border-border bg-bg text-muted",
                        )}
                      >
                        {e.category}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>

              {!showAll ? (
                <button
                  type="button"
                  onClick={() => setShowAll(true)}
                  className="mt-2 inline-flex h-8 items-center justify-center rounded-md border border-border bg-neutral-900 px-3 text-[11px] font-medium text-neutral-200 hover:bg-neutral-800"
                >
                  Show all exercises
                </button>
              ) : null}
            </>
          ) : null}

          {/* Full library — shown when "show all", searching, or no suggestions */}
          {(showAll || query || suggestions.length === 0) ? (
            <div className={!query && suggestions.length > 0 ? "mt-4 border-t border-border pt-3" : ""}>
              <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                All exercises
              </p>
              {grouped.length === 0 ? (
                <p className="px-1 py-6 text-center text-sm text-muted">
                  No matches.
                </p>
              ) : (
                grouped.map((g) => (
                  <div key={g.muscle} className="mb-3 last:mb-0">
                    <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted/70">
                      {g.muscle}
                    </p>
                    <ul className="space-y-1">
                      {g.items.map((e) => (
                        <li key={`all-${e.id}`}>
                          <button
                            type="button"
                            onClick={() => onPick(e.id)}
                            className="flex w-full items-center justify-between gap-2 rounded-md px-3 py-2 text-left text-sm text-neutral-200 transition hover:bg-neutral-800"
                          >
                            <span className="min-w-0 flex-1 truncate">
                              {e.name}
                            </span>
                            <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                              {e.category}
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 border-t border-border bg-neutral-900/40 px-4 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
