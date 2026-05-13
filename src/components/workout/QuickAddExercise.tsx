"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { onSnapshot, type QuerySnapshot } from "firebase/firestore";
import { Plus, Search, X } from "lucide-react";

import { exercisesPath } from "@/lib/db/paths";
import type { Exercise } from "@/lib/db/types";

/**
 * QuickAddExercise — searchable picker for the master exercise list.
 *
 * Purpose (fn-4-p9x.3): let a lifter append an unplanned exercise to the
 * current session without leaving the logger. Examples: a cable curl finisher
 * that's not in today's plan, or a swap when a machine is occupied.
 *
 * UX:
 *   - Renders as a single inline trigger ("+ Add exercise") in the bottom of
 *     the session page. Tapping it expands an overlay with:
 *       - a text input bound to a fuzzy substring filter on `exercise.name`,
 *       - a scrollable list of matches with name + primary muscle pill,
 *       - tap = select. We do NOT have a cancel button — the X in the corner
 *         and tap-outside-to-close are sufficient.
 *   - Selecting an exercise calls `onSelect(exercise)`. The parent is
 *     responsible for the freeform-set semantics (no planned target, append
 *     a placeholder set to the session).
 *
 * Data:
 *   - Subscribes to `users/{uid}/exercises/*` so the master list stays live
 *     (seeded list + any user-added exercise from a future task).
 *
 * Accessibility:
 *   - The overlay is rendered as a `role="dialog"` with `aria-modal`; focus
 *     drops into the search box on open and returns to the trigger on close.
 *   - Up/Down arrows move the active item; Enter selects it; Escape closes.
 */
export interface QuickAddExerciseProps {
  uid: string;
  /** Called when the user picks an exercise. Receives the doc id + payload. */
  onSelect: (input: { exerciseId: string; exercise: Exercise }) => void | Promise<void>;
  /** Disable the trigger (e.g. while another write is pending). */
  disabled?: boolean;
}

type Row = { id: string; ex: Exercise };

export default function QuickAddExercise({
  uid,
  onSelect,
  disabled,
}: QuickAddExerciseProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);

  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // -- Live subscription to the master exercise list ------------------------
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(
      exercisesPath(uid),
      (snap: QuerySnapshot<Exercise>) => {
        const next: Row[] = snap.docs.map((d) => ({ id: d.id, ex: d.data() }));
        // Sort alphabetically by name; this is the stable list order for the
        // filtered view too (the filter preserves order, doesn't re-rank).
        next.sort((a, b) =>
          a.ex.name.localeCompare(b.ex.name, undefined, { sensitivity: "base" }),
        );
        setRows(next);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid]);

  // -- Filter ----------------------------------------------------------------
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.ex.name.toLowerCase().includes(q));
  }, [rows, query]);

  // Keep activeIdx in range when the filtered list shrinks.
  useEffect(() => {
    if (activeIdx >= filtered.length) setActiveIdx(0);
  }, [filtered.length, activeIdx]);

  // -- Open/close ------------------------------------------------------------
  function openPicker() {
    setOpen(true);
    setQuery("");
    setActiveIdx(0);
    // Focus the search after the dialog mounts. RAF is enough; a microtask is
    // not because the input isn't in the DOM yet on the same tick.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function closePicker() {
    setOpen(false);
    setError(null);
    triggerRef.current?.focus();
  }

  // -- Select ----------------------------------------------------------------
  async function selectRow(row: Row) {
    if (adding) return;
    setAdding(true);
    setError(null);
    try {
      await onSelect({ exerciseId: row.id, exercise: row.ex });
      closePicker();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add exercise.");
    } finally {
      setAdding(false);
    }
  }

  // -- Keyboard nav ----------------------------------------------------------
  function onKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Escape") {
      e.preventDefault();
      closePicker();
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(filtered.length - 1, i + 1));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const row = filtered[activeIdx];
      if (row) void selectRow(row);
    }
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPicker}
        disabled={disabled}
        className="mt-4 inline-flex h-11 w-full items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-neutral-900/30 px-4 text-sm font-medium text-neutral-200 transition hover:bg-neutral-900/60 disabled:cursor-not-allowed disabled:opacity-50"
      >
        <Plus aria-hidden="true" className="h-4 w-4" />
        Add exercise
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Add exercise"
          onKeyDown={onKey}
          className="fixed inset-0 z-40 flex items-end justify-center bg-black/60 sm:items-center"
          onClick={(e) => {
            // Click on the backdrop (but not the panel) closes.
            if (e.target === e.currentTarget) closePicker();
          }}
        >
          <div
            className="flex max-h-[80vh] w-full max-w-md flex-col rounded-t-2xl border border-border bg-panel2 shadow-2xl sm:rounded-2xl"
            // As a bottom-sheet on mobile, reserve the iOS home-indicator
            // inset so the panel's last interactive row never sits under it.
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <header className="flex items-center justify-between gap-2 border-b border-border px-3 py-2">
              <h2 className="text-sm font-semibold text-neutral-100">
                Add exercise
              </h2>
              <button
                type="button"
                onClick={closePicker}
                aria-label="Close"
                className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-muted hover:text-neutral-100"
              >
                <X aria-hidden="true" className="h-4 w-4" />
              </button>
            </header>

            <div className="border-b border-border p-2">
              <label className="sr-only" htmlFor="quick-add-search">
                Search exercises
              </label>
              <div className="relative">
                <Search
                  aria-hidden="true"
                  className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
                />
                <input
                  ref={inputRef}
                  id="quick-add-search"
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  placeholder="Search…"
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setActiveIdx(0);
                  }}
                  className="h-11 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-neutral-100 outline-none focus:border-accent"
                />
              </div>
            </div>

            <ul className="min-h-[10rem] flex-1 overflow-y-auto py-1">
              {filtered.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-muted">
                  {rows.length === 0 ? "Loading exercises…" : "No matches."}
                </li>
              ) : (
                filtered.map((row, i) => {
                  const isActive = i === activeIdx;
                  return (
                    <li key={row.id}>
                      <button
                        type="button"
                        onClick={() => void selectRow(row)}
                        onMouseEnter={() => setActiveIdx(i)}
                        disabled={adding}
                        className={`flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm transition ${
                          isActive
                            ? "bg-accent/10 text-neutral-100"
                            : "text-neutral-200 hover:bg-neutral-800"
                        } disabled:cursor-not-allowed disabled:opacity-50`}
                      >
                        <span className="truncate font-medium">
                          {row.ex.name}
                        </span>
                        <span className="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                          {row.ex.primaryMuscle}
                        </span>
                      </button>
                    </li>
                  );
                })
              )}
            </ul>

            {error ? (
              <div
                role="alert"
                aria-live="polite"
                className="border-t border-red-500/40 bg-red-500/10 px-3 py-2 text-xs text-red-300"
              >
                {error}
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </>
  );
}
