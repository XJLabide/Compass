"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { X, Search, ArrowLeftRight, Plus, Library } from "lucide-react";
import clsx from "clsx";
import { serverTimestamp, setDoc } from "firebase/firestore";

import { EXERCISE_MASTER, type SeedExercise } from "@/lib/data/exerciseMaster";
import { inferCategory, mapApiMuscle } from "@/lib/data/muscleMapping";
import { exercisePath } from "@/lib/db/paths";
import type {
  Exercise,
  ExerciseCategory,
  MuscleGroup,
} from "@/lib/db/types";
import { suggestSubstitutes } from "@/lib/workout/exerciseSubs";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import { getRecent, pushRecent } from "@/lib/workout/recentExercises";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Modal that picks a replacement exercise for a swap, or any exercise for an
 * "add" action. When `forExerciseId` is provided, the top section shows
 * smart substitutes (same primary muscle, ranked by same-category first).
 *
 * Picker sections (top to bottom):
 *   1. Muscle filter chips
 *   2. Recent (if any items in localStorage)
 *   3. Suggestions (same-muscle as `forExerciseId`, swap mode only) /
 *      Common adds (add mode)
 *   4. All exercises grouped by muscle, filtered by chip + search
 *   5. "+ Create custom exercise" button (and inline form)
 *
 * Pool: merge of `EXERCISE_MASTER` + user's `users/{uid}/exercises/*` (passed
 * in by the caller via `pool`). User-created exercises win on id conflict.
 */
export interface ExerciseSwapPickerProps {
  open: boolean;
  /** Authenticated user id — required for "Create custom exercise" writes. */
  uid: string;
  /**
   * Search universe: typically `EXERCISE_MASTER ∪ user's exercises`. We use
   * this for suggestions, recent lookups, and the "All exercises" list.
   */
  pool: ReadonlyArray<{
    id: string;
    name: string;
    primaryMuscle: string;
    category: string;
    /** Alternative names — used for dedup against the library-search results. */
    aliases?: string[];
    /** ExerciseDB id — used for exact dedup against library-search results. */
    apiId?: string;
  }>;
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

/** Order matches the chip strip below. Sourced from the `MuscleGroup` enum. */
const MUSCLE_FILTERS: MuscleGroup[] = [
  "chest",
  "back",
  "shoulders",
  "biceps",
  "triceps",
  "quads",
  "hamstrings",
  "glutes",
  "calves",
  "core",
  "forearms",
  "other",
];

const CATEGORY_OPTIONS: ExerciseCategory[] = [
  "compound",
  "isolation",
  "accessory",
  "cardio",
  "other",
];

const RECENT_SHOWN = 5;

/** Slugify a free-form name into a stable id prefix. */
function slugify(name: string): string {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);
}

/** Generate a custom-exercise id: slug + "-" + 6 hex chars from a UUID. */
function generateCustomId(name: string): string {
  const slug = slugify(name) || "exercise";
  // `crypto.randomUUID` is available in modern browsers + Node 19+. The picker
  // is client-only ("use client" + open=true gate), so window is defined.
  const uuid =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const suffix = uuid.replace(/-/g, "").slice(0, 6);
  return `${slug}-${suffix}`;
}

/**
 * Canonical form of an exercise name for dedup comparison.
 *
 * Strips everything that isn't a letter or digit, so "Bench Press",
 * "bench-press", and "BENCH  press" all collapse to "benchpress".
 */
function normalizedName(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

/** Shape of a single result row returned by `/api/exercises/search`. */
interface LibrarySearchResult {
  apiId: string;
  name: string;
  gifUrl: string;
  bodyParts: string[];
  targetMuscles: string[];
  secondaryMuscles: string[];
  equipments: string[];
  instructions: string[];
}

/** Resolved dedup outcome for one library-search row. */
type DedupOutcome =
  | { kind: "new" }
  | { kind: "match"; existingId: string; existingName: string };

const SEARCH_DEBOUNCE_MS = 400;
const SEARCH_MIN_LEN = 2;

export default function ExerciseSwapPicker({
  open,
  uid,
  pool,
  forExerciseId,
  excludeIds,
  onPick,
  onCancel,
}: ExerciseSwapPickerProps) {
  const [query, setQuery] = useState("");
  const [showAll, setShowAll] = useState(false);
  const [muscleFilter, setMuscleFilter] = useState<MuscleGroup | null>(null);
  const [recentIds, setRecentIds] = useState<string[]>([]);

  // Create-custom inline form state.
  const [createOpen, setCreateOpen] = useState(false);
  const [createName, setCreateName] = useState("");
  const [createMuscle, setCreateMuscle] = useState<MuscleGroup>("chest");
  const [createCategory, setCreateCategory] =
    useState<ExerciseCategory>("accessory");
  const [createError, setCreateError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);

  // Library-search state (Step 4: lazy ExerciseDB search).
  const [libQuery, setLibQuery] = useState("");
  const [libResults, setLibResults] = useState<LibrarySearchResult[]>([]);
  const [libLoading, setLibLoading] = useState(false);
  const [libError, setLibError] = useState<string | null>(null);
  const [libSearched, setLibSearched] = useState(false);
  /** Per-result row "adding to library" / inline error state. Keyed by apiId. */
  const [libAddingId, setLibAddingId] = useState<string | null>(null);
  const [libRowErrors, setLibRowErrors] = useState<Record<string, string>>({});
  const libAbortRef = useRef<AbortController | null>(null);

  useBodyScrollLock(open);

  // Reset state whenever the picker is opened. Read "recent" from localStorage
  // once at open time (it's a snapshot; updates don't need to be reactive).
  useEffect(() => {
    if (open) {
      setQuery("");
      setShowAll(false);
      setMuscleFilter(null);
      setRecentIds(getRecent());
      setCreateOpen(false);
      setCreateName("");
      setCreateMuscle("chest");
      setCreateCategory("accessory");
      setCreateError(null);
      setCreating(false);
      setLibQuery("");
      setLibResults([]);
      setLibLoading(false);
      setLibError(null);
      setLibSearched(false);
      setLibAddingId(null);
      setLibRowErrors({});
      libAbortRef.current?.abort();
      libAbortRef.current = null;
    }
  }, [open]);

  // Cancel any in-flight search when the picker unmounts.
  useEffect(() => {
    return () => {
      libAbortRef.current?.abort();
      libAbortRef.current = null;
    };
  }, []);

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
  // Reads from the merged pool, not EXERCISE_MASTER directly.
  const suggestions = useMemo(() => {
    if (forExerciseId) {
      return suggestSubstitutes(forExerciseId, pool).filter(
        (e) => !excludeSet.has(e.id),
      );
    }
    // Add flow: use the curated common-adds list, intersected with the pool
    // (so a seeded id that's been overridden by a user doc still resolves).
    const byId = new Map(pool.map((e) => [e.id, e] as const));
    return COMMON_ADD_IDS.map((id) => byId.get(id)).filter(
      (e): e is (typeof pool)[number] => !!e && !excludeSet.has(e.id),
    );
  }, [forExerciseId, excludeSet, pool]);

  // Recent ids, filtered to entries that still exist in the pool and aren't
  // excluded. Capped to the top `RECENT_SHOWN`.
  const recentItems = useMemo(() => {
    const byId = new Map(pool.map((e) => [e.id, e] as const));
    const out: (typeof pool)[number][] = [];
    for (const id of recentIds) {
      if (out.length >= RECENT_SHOWN) break;
      if (excludeSet.has(id)) continue;
      const entry = byId.get(id);
      if (entry) out.push(entry);
    }
    return out;
  }, [recentIds, pool, excludeSet]);

  // Full library minus excluded + muscle filter + search query.
  const filteredAll = useMemo(() => {
    const q = query.trim().toLowerCase();
    let base = pool.filter((e) => !excludeSet.has(e.id));
    if (muscleFilter) {
      base = base.filter((e) => e.primaryMuscle === muscleFilter);
    }
    if (q) {
      base = base.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          e.primaryMuscle.toLowerCase().includes(q),
      );
    }
    return base;
  }, [excludeSet, query, pool, muscleFilter]);

  // Group filtered library by primary muscle (alphabetic muscle, alphabetic name within).
  const grouped = useMemo(() => {
    const map = new Map<string, (typeof pool)[number][]>();
    filteredAll.forEach((e) => {
      const arr = map.get(e.primaryMuscle) ?? [];
      arr.push(e);
      map.set(e.primaryMuscle, arr);
    });
    const groups: Array<{ muscle: string; items: (typeof pool)[number][] }> = [];
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

  // Build a dedup index over the merged pool. Recomputed when the pool
  // changes. We index by:
  //   - apiId  (exact match against API result.apiId)
  //   - normalizedName(name) + each normalizedName(alias)
  const dedupIndex = useMemo(() => {
    const byApiId = new Map<string, { id: string; name: string }>();
    const byName = new Map<string, { id: string; name: string }>();
    for (const e of pool) {
      if (e.apiId) byApiId.set(e.apiId, { id: e.id, name: e.name });
      const nName = normalizedName(e.name);
      if (nName) byName.set(nName, { id: e.id, name: e.name });
      if (Array.isArray(e.aliases)) {
        for (const a of e.aliases) {
          const nAlias = normalizedName(a);
          if (nAlias) byName.set(nAlias, { id: e.id, name: e.name });
        }
      }
    }
    return { byApiId, byName };
  }, [pool]);

  // Decide for each result whether it already lives in our pool.
  const resolveDedup = useCallback(
    (r: LibrarySearchResult): DedupOutcome => {
      if (r.apiId) {
        const apiHit = dedupIndex.byApiId.get(r.apiId);
        if (apiHit) {
          return {
            kind: "match",
            existingId: apiHit.id,
            existingName: apiHit.name,
          };
        }
      }
      const nName = normalizedName(r.name);
      if (nName) {
        const nameHit = dedupIndex.byName.get(nName);
        if (nameHit) {
          return {
            kind: "match",
            existingId: nameHit.id,
            existingName: nameHit.name,
          };
        }
      }
      return { kind: "new" };
    },
    [dedupIndex],
  );

  // Debounced library search. Fires when libQuery is at least SEARCH_MIN_LEN
  // characters AND has not changed for SEARCH_DEBOUNCE_MS.
  useEffect(() => {
    if (!open) return;
    const q = libQuery.trim();
    if (q.length < SEARCH_MIN_LEN) {
      setLibResults([]);
      setLibError(null);
      setLibLoading(false);
      setLibSearched(false);
      libAbortRef.current?.abort();
      libAbortRef.current = null;
      return;
    }

    const handle = window.setTimeout(() => {
      // Cancel any previous in-flight request.
      libAbortRef.current?.abort();
      const ac = new AbortController();
      libAbortRef.current = ac;
      setLibLoading(true);
      setLibError(null);
      setLibRowErrors({});

      fetch(`/api/exercises/search?q=${encodeURIComponent(q)}`, {
        signal: ac.signal,
      })
        .then(async (res) => {
          const json = (await res.json().catch(() => null)) as
            | { results?: LibrarySearchResult[]; error?: string }
            | null;
          if (!res.ok) {
            throw new Error(json?.error ?? `Search failed (${res.status})`);
          }
          if (ac.signal.aborted) return;
          setLibResults(Array.isArray(json?.results) ? json!.results : []);
          setLibSearched(true);
          setLibLoading(false);
        })
        .catch((err: unknown) => {
          if ((err as { name?: string })?.name === "AbortError") return;
          const msg = err instanceof Error ? err.message : "Search failed";
          setLibError(msg);
          setLibResults([]);
          setLibSearched(true);
          setLibLoading(false);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(handle);
    };
  }, [libQuery, open]);

  if (!open) return null;

  const title = forExerciseId ? "Swap exercise" : "Add exercise";
  const showSearch = showAll || !!query;
  const hasMuscleOrSearch = !!muscleFilter || !!query;

  // ---------------------------------------------------------------------------
  // Handlers
  // ---------------------------------------------------------------------------

  function pick(exerciseId: string) {
    // Track the chosen id for the next "recent" render. The parent edit-flow
    // also calls pushRecent on swap-confirm; this covers the picker-only path
    // (e.g. add flow doesn't always go through a confirm dialog).
    pushRecent(exerciseId);
    onPick(exerciseId);
  }

  async function handleCreate() {
    const trimmed = createName.trim();
    if (!trimmed) {
      setCreateError("Name is required.");
      return;
    }
    if (trimmed.length > 100) {
      setCreateError("Name must be 100 characters or fewer.");
      return;
    }
    if (!createMuscle) {
      setCreateError("Pick a primary muscle.");
      return;
    }
    setCreating(true);
    setCreateError(null);
    try {
      const id = generateCustomId(trimmed);
      const payload: Omit<Exercise, "createdAt"> & { createdAt: unknown } = {
        name: trimmed,
        primaryMuscle: createMuscle,
        category: createCategory,
        seeded: false,
        createdAt: serverTimestamp(),
      };
      await setDoc(exercisePath(uid, id), payload as Exercise);
      // Immediately select it — the subscription in the parent will pick up
      // the new doc on the next snapshot tick.
      pushRecent(id);
      onPick(id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create exercise.";
      setCreateError(message);
      setCreating(false);
    }
  }

  /**
   * Persist a library-search result as a new `users/{uid}/exercises/*` doc
   * and immediately select it. Mapped fields:
   *   - `primaryMuscle`: first targetMuscle that mapApiMuscle accepts (or
   *     scans secondaryMuscles as a last-ditch fallback). If nothing
   *     resolves we surface an inline error rather than picking a wrong bucket.
   *   - `secondaryMuscles`: deduped list of mapApiMuscle-recognised secondaries
   *   - `category`: inferCategory() on name + equipments
   *   - `aliases`: starts as `[result.name]`
   *   - `source: "api"`, `apiId: result.apiId`
   */
  async function handleAddFromLibrary(result: LibrarySearchResult) {
    setLibRowErrors((prev) => {
      if (!(result.apiId in prev)) return prev;
      const { [result.apiId]: _omit, ...rest } = prev;
      return rest;
    });

    // Resolve a primary muscle. Walk targetMuscles first, then secondaries.
    let primary: MuscleGroup | null = null;
    for (const m of result.targetMuscles) {
      const mapped = mapApiMuscle(m);
      if (mapped) {
        primary = mapped;
        break;
      }
    }
    if (!primary) {
      for (const m of result.secondaryMuscles) {
        const mapped = mapApiMuscle(m);
        if (mapped) {
          primary = mapped;
          break;
        }
      }
    }
    if (!primary) {
      setLibRowErrors((prev) => ({
        ...prev,
        [result.apiId]:
          "Couldn't map this exercise's muscle group. Try Create custom.",
      }));
      return;
    }

    // Secondary muscles — keep only ones we recognise, deduped.
    const secondarySet = new Set<MuscleGroup>();
    for (const m of result.secondaryMuscles) {
      const mapped = mapApiMuscle(m);
      if (mapped && mapped !== primary) secondarySet.add(mapped);
    }

    const id = generateCustomId(result.name);
    const payload: Omit<Exercise, "createdAt"> & { createdAt: unknown } = {
      name: result.name,
      primaryMuscle: primary,
      category: inferCategory(result.name, result.equipments),
      seeded: false,
      source: "api",
      apiId: result.apiId || undefined,
      gifUrl: result.gifUrl || undefined,
      instructions:
        result.instructions.length > 0 ? result.instructions : undefined,
      equipments: result.equipments.length > 0 ? result.equipments : undefined,
      secondaryMuscles: secondarySet.size > 0 ? [...secondarySet] : undefined,
      aliases: [result.name],
      createdAt: serverTimestamp(),
    };

    setLibAddingId(result.apiId || id);
    try {
      await setDoc(exercisePath(uid, id), payload as Exercise);
      pushRecent(id);
      onPick(id);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add to library.";
      setLibRowErrors((prev) => ({
        ...prev,
        [result.apiId]: message,
      }));
      setLibAddingId(null);
    }
  }

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

        {/* Muscle filter chips */}
        <div className="border-b border-border px-2 py-2">
          <div className="flex gap-1.5 overflow-x-auto pb-0.5">
            <button
              type="button"
              onClick={() => setMuscleFilter(null)}
              className={clsx(
                "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition",
                muscleFilter === null
                  ? "border-accent/60 bg-accent/15 text-accent"
                  : "border-border bg-neutral-900 text-muted hover:bg-neutral-800",
              )}
              aria-pressed={muscleFilter === null}
            >
              All
            </button>
            {MUSCLE_FILTERS.map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMuscleFilter(m)}
                className={clsx(
                  "shrink-0 rounded-full border px-2.5 py-1 text-[11px] font-medium uppercase tracking-wide transition",
                  muscleFilter === m
                    ? "border-accent/60 bg-accent/15 text-accent"
                    : "border-border bg-neutral-900 text-muted hover:bg-neutral-800",
                )}
                aria-pressed={muscleFilter === m}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* Search (visible when "show all" toggled on OR a query is typed) */}
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
          {/* Recent — only when not searching and not muscle-filtering */}
          {!hasMuscleOrSearch && recentItems.length > 0 ? (
            <div className="mb-3">
              <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                Recent
              </p>
              <ul className="space-y-1">
                {recentItems.map((e) => (
                  <li key={`recent-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => pick(e.id)}
                      className="flex w-full items-center justify-between gap-2 rounded-md border border-border bg-neutral-900/40 px-3 py-2 text-left text-sm text-neutral-100 transition hover:border-accent/60 hover:bg-neutral-900/70"
                    >
                      <span className="min-w-0 flex-1 truncate font-medium">
                        {e.name}
                      </span>
                      <span className="shrink-0 rounded-full border border-border bg-bg px-2 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                        {e.primaryMuscle}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {/* Suggestions / Common adds — only when not searching/filtering */}
          {!hasMuscleOrSearch && suggestions.length > 0 ? (
            <>
              <p className="px-1 py-1 text-[10px] font-medium uppercase tracking-wider text-muted">
                {forExerciseId ? "Suggestions" : "Common adds"}
              </p>
              <ul className="space-y-1">
                {suggestions.map((e) => (
                  <li key={`sug-${e.id}`}>
                    <button
                      type="button"
                      onClick={() => pick(e.id)}
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

          {/* Full library — shown when filter/search active OR "show all" OR no suggestions */}
          {(showAll || hasMuscleOrSearch || suggestions.length === 0) ? (
            <div
              className={
                !hasMuscleOrSearch && suggestions.length > 0
                  ? "mt-4 border-t border-border pt-3"
                  : ""
              }
            >
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
                            onClick={() => pick(e.id)}
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

          {/* Library search — lazy ExerciseDB lookup with dedup. */}
          <div className="mt-4 border-t border-border pt-3">
            <div className="mb-2 flex items-center justify-between gap-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted">
                <Library
                  aria-hidden="true"
                  className="mr-1 inline-block h-3 w-3 -translate-y-px"
                />
                Can&apos;t find it? Search the library
              </p>
              <span className="shrink-0 rounded-full border border-border bg-bg px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-muted">
                External
              </span>
            </div>
            <div className="relative">
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted"
              />
              <input
                type="search"
                value={libQuery}
                onChange={(e) => setLibQuery(e.target.value)}
                placeholder="Search 1500+ exercises…"
                className="h-10 w-full rounded-md border border-border bg-bg pl-9 pr-3 text-sm text-neutral-100 outline-none focus:border-accent"
              />
            </div>

            {libError ? (
              <p
                role="alert"
                className="mt-2 rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1.5 text-xs text-red-300"
              >
                Couldn&apos;t reach the exercise library. Try again later.
              </p>
            ) : null}

            {libLoading ? (
              <ul className="mt-2 space-y-1.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <li
                    key={`lib-skel-${i}`}
                    className="flex items-center gap-3 rounded-md border border-border bg-neutral-900/40 p-2"
                  >
                    <Skeleton className="h-14 w-14 shrink-0" />
                    <div className="flex-1 space-y-1.5">
                      <Skeleton className="h-3.5 w-3/4" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                    <Skeleton className="h-7 w-20 shrink-0" />
                  </li>
                ))}
              </ul>
            ) : null}

            {!libLoading &&
            !libError &&
            libSearched &&
            libResults.length === 0 &&
            libQuery.trim().length >= SEARCH_MIN_LEN ? (
              <p className="mt-3 px-1 text-center text-xs text-muted">
                No matches in ExerciseDB. Try another search or use
                &quot;Create custom exercise&quot; below.
              </p>
            ) : null}

            {!libLoading && libResults.length > 0 ? (
              <ul className="mt-2 space-y-1.5">
                {libResults.map((r) => {
                  const dedup = resolveDedup(r);
                  const rowError = libRowErrors[r.apiId];
                  const adding = libAddingId === r.apiId;
                  const primaryDisplay =
                    r.targetMuscles[0] || r.bodyParts[0] || "—";
                  const equipDisplay = r.equipments[0];
                  return (
                    <li
                      key={`lib-${r.apiId || r.name}`}
                      className="rounded-md border border-border bg-neutral-900/40 p-2"
                    >
                      <div className="flex items-center gap-3">
                        {r.gifUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- animated GIFs from external host; next/image cannot animate them
                          <img
                            src={r.gifUrl}
                            alt=""
                            loading="lazy"
                            width={56}
                            height={56}
                            className="h-14 w-14 shrink-0 rounded-md border border-border bg-bg object-cover"
                          />
                        ) : (
                          <div
                            aria-hidden
                            className="h-14 w-14 shrink-0 rounded-md border border-border bg-bg"
                          />
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-neutral-100">
                            {r.name}
                          </p>
                          <div className="mt-1 flex flex-wrap items-center gap-1">
                            <span className="rounded-full border border-border bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                              {primaryDisplay}
                            </span>
                            {equipDisplay ? (
                              <span className="rounded-full border border-border bg-bg px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted">
                                {equipDisplay}
                              </span>
                            ) : null}
                          </div>
                        </div>
                        {dedup.kind === "match" ? (
                          <button
                            type="button"
                            onClick={() => pick(dedup.existingId)}
                            className="shrink-0 rounded-md border border-border bg-neutral-900 px-2 py-1.5 text-[11px] font-medium text-neutral-200 hover:bg-neutral-800"
                          >
                            Select
                          </button>
                        ) : (
                          <button
                            type="button"
                            onClick={() => void handleAddFromLibrary(r)}
                            disabled={adding}
                            className="inline-flex shrink-0 items-center gap-1 rounded-md bg-accent px-2 py-1.5 text-[11px] font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
                          >
                            <Plus aria-hidden="true" className="h-3 w-3" />
                            {adding ? "Adding…" : "Add to library"}
                          </button>
                        )}
                      </div>
                      {dedup.kind === "match" ? (
                        <p className="mt-1.5 text-[11px] text-muted">
                          Already in library: {dedup.existingName}
                        </p>
                      ) : null}
                      {rowError ? (
                        <p
                          role="alert"
                          className="mt-1.5 rounded border border-red-500/40 bg-red-500/10 px-2 py-1 text-[11px] text-red-300"
                        >
                          {rowError}
                        </p>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            ) : null}
          </div>

          {/* Create custom exercise */}
          <div className="mt-4 border-t border-border pt-3">
            {createOpen ? (
              <div className="rounded-lg border border-border bg-neutral-900/40 p-3 space-y-2">
                <p className="text-[11px] font-medium uppercase tracking-wider text-muted">
                  Create custom exercise
                </p>
                <label className="block">
                  <span className="text-[11px] text-muted">Name</span>
                  <input
                    type="text"
                    autoFocus
                    maxLength={100}
                    value={createName}
                    onChange={(e) => setCreateName(e.target.value)}
                    placeholder="Hack Squat"
                    className="mt-1 h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-neutral-100 outline-none focus:border-accent"
                  />
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <label className="block">
                    <span className="text-[11px] text-muted">Primary muscle</span>
                    <select
                      value={createMuscle}
                      onChange={(e) =>
                        setCreateMuscle(e.target.value as MuscleGroup)
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-neutral-100 outline-none focus:border-accent"
                    >
                      {MUSCLE_FILTERS.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className="text-[11px] text-muted">Category</span>
                    <select
                      value={createCategory}
                      onChange={(e) =>
                        setCreateCategory(e.target.value as ExerciseCategory)
                      }
                      className="mt-1 h-9 w-full rounded-md border border-border bg-bg px-2 text-sm text-neutral-100 outline-none focus:border-accent"
                    >
                      {CATEGORY_OPTIONS.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                {createError ? (
                  <p
                    role="alert"
                    className="rounded-md border border-red-500/40 bg-red-500/10 px-2 py-1 text-xs text-red-300"
                  >
                    {createError}
                  </p>
                ) : null}
                <div className="flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setCreateOpen(false)}
                    disabled={creating}
                    className="h-8 rounded-md border border-border bg-neutral-900 px-3 text-[11px] font-medium text-neutral-100 hover:bg-neutral-800 disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleCreate()}
                    disabled={creating}
                    className="inline-flex h-8 items-center gap-1 rounded-md bg-accent px-3 text-[11px] font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
                  >
                    {creating ? "Creating…" : "Create"}
                  </button>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={() => setCreateOpen(true)}
                className="inline-flex h-10 w-full items-center justify-center gap-1.5 rounded-lg border border-dashed border-border bg-neutral-900/30 px-3 text-xs font-medium text-neutral-200 hover:bg-neutral-900/60"
              >
                <Plus aria-hidden="true" className="h-3.5 w-3.5" />
                Create custom exercise
              </button>
            )}
          </div>
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

/**
 * Build the picker's pool from the seeded master + user's exercises.
 *
 * User docs take precedence on id collision (so a user can override a
 * seeded exercise's name/muscle/category without forking the seed list).
 *
 * Exported so the dialog and other consumers share one merge implementation.
 */
export function buildPickerPool(
  userExercises: ReadonlyArray<{ id: string; ex: Exercise }>,
): Array<{
  id: string;
  name: string;
  primaryMuscle: string;
  category: string;
  aliases?: string[];
  apiId?: string;
}> {
  const byId = new Map<
    string,
    {
      id: string;
      name: string;
      primaryMuscle: string;
      category: string;
      aliases?: string[];
      apiId?: string;
    }
  >();
  EXERCISE_MASTER.forEach((e: SeedExercise) => {
    byId.set(e.id, {
      id: e.id,
      name: e.name,
      primaryMuscle: e.primaryMuscle,
      category: e.category,
      aliases: e.aliases,
      apiId: e.apiId,
    });
  });
  userExercises.forEach(({ id, ex }) => {
    byId.set(id, {
      id,
      name: ex.name,
      primaryMuscle: ex.primaryMuscle,
      category: ex.category,
      aliases: ex.aliases,
      apiId: ex.apiId,
    });
  });
  return [...byId.values()];
}
