"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import {
  doc,
  onSnapshot,
  query,
  orderBy,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import { Plus, Search, X } from "lucide-react";

import { exercisesPath } from "@/lib/db/paths";
import { EXERCISE_MASTER } from "@/lib/data/exerciseMaster";
import { getFirebaseDb } from "@/lib/firebase";
import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import type { Exercise, ExerciseCategory, MuscleGroup } from "@/lib/db/types";

const MUSCLE_GROUPS: MuscleGroup[] = [
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

const CATEGORIES: ExerciseCategory[] = [
  "compound",
  "isolation",
  "accessory",
  "cardio",
  "other",
];

interface ExercisePickerProps {
  uid: string;
  /** Exercise ids already in the current session — shown as "Added" and disabled. */
  excludeIds?: string[];
  onPick: (exercise: { id: string; name: string }) => void;
  onClose: () => void;
}

/**
 * Modal picker for selecting an exercise. Loads the user's `exercises`
 * collection (seeded + custom) in real time. Includes a search filter and an
 * inline "Add custom" form that writes a new doc to the collection.
 */
export default function ExercisePicker({
  uid,
  excludeIds = [],
  onPick,
  onClose,
}: ExercisePickerProps) {
  const [items, setItems] = useState<{ id: string; data: Exercise }[] | null>(
    null,
  );
  const [search, setSearch] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const q = query(exercisesPath(uid), orderBy("name"));
    const unsub = onSnapshot(
      q,
      (snap) => {
        // Merge master (read-only, code-side) with user's Firestore docs.
        // User doc wins on id collision so custom overrides shadow master.
        const userMap = new Map(snap.docs.map((d) => [d.id, d.data()]));
        const masterItems = EXERCISE_MASTER
          .filter((e) => !userMap.has(e.id))
          .map((e) => ({
            id: e.id,
            data: {
              name: e.name,
              primaryMuscle: e.primaryMuscle as Exercise["primaryMuscle"],
              category: e.category as Exercise["category"],
              seeded: true,
              createdAt: null as unknown as Exercise["createdAt"],
            },
          }));
        const userItems = snap.docs
          .map((d) => ({ id: d.id, data: d.data() }))
          .filter((it) => !it.data.archived);
        const merged = [...masterItems, ...userItems].sort((a, b) =>
          a.data.name.localeCompare(b.data.name),
        );
        setItems(merged);
      },
      () => setItems([]),
    );
    return () => unsub();
  }, [uid]);

  const filtered = useMemo(() => {
    if (!items) return [];
    const s = search.trim().toLowerCase();
    if (!s) return items;
    return items.filter(
      (it) =>
        it.data.name.toLowerCase().includes(s) ||
        it.data.primaryMuscle.toLowerCase().includes(s),
    );
  }, [items, search]);

  // Esc closes
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useBodyScrollLock(true);

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur p-4"
      onClick={onClose}
    >
      <div
        className="flex w-full max-w-md flex-col overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">
            Add exercise
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-md p-1.5 text-muted hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="border-b border-border px-4 py-3">
          <div className="flex items-center gap-2 rounded-md border border-border bg-neutral-900 px-2.5 py-1.5">
            <Search className="h-3.5 w-3.5 text-muted" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search bench, squat, pull…"
              className="h-7 flex-1 bg-transparent text-sm text-neutral-100 placeholder:text-muted focus:outline-none"
              autoFocus
            />
          </div>
        </div>

        <div className="max-h-[50vh] overflow-y-auto px-2 py-2">
          {items === null ? (
            <p className="px-3 py-4 text-sm text-muted">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="px-3 py-4 text-sm text-muted">
              No matches. Add a custom exercise below.
            </p>
          ) : (
            <ul className="space-y-0.5">
              {filtered.map((it) => {
                const already = excludeIds.includes(it.id);
                return (
                  <li key={it.id}>
                    <button
                      type="button"
                      disabled={already}
                      onClick={() =>
                        onPick({ id: it.id, name: it.data.name })
                      }
                      className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm text-neutral-100 transition-colors hover:bg-neutral-800/60 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <span className="truncate">{it.data.name}</span>
                      <span className="ml-2 shrink-0 text-[10px] uppercase tracking-wide text-muted">
                        {already ? "Added" : it.data.primaryMuscle}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="border-t border-border px-4 py-3">
          {showAdd ? (
            <AddCustomForm
              uid={uid}
              onAdded={(ex) => {
                setShowAdd(false);
                onPick(ex);
              }}
              onCancel={() => setShowAdd(false)}
              onError={setError}
            />
          ) : (
            <button
              type="button"
              onClick={() => setShowAdd(true)}
              className="inline-flex h-9 items-center gap-1 rounded-md border border-border bg-neutral-900 px-3 text-xs font-medium text-neutral-100 hover:bg-neutral-800"
            >
              <Plus className="h-3.5 w-3.5 text-accent" />
              Add a custom exercise
            </button>
          )}
          {error ? (
            <p className="mt-2 text-xs text-red-300">{error}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 64);
}

function AddCustomForm({
  uid,
  onAdded,
  onCancel,
  onError,
}: {
  uid: string;
  onAdded: (ex: { id: string; name: string }) => void;
  onCancel: () => void;
  onError: (msg: string) => void;
}) {
  const [name, setName] = useState("");
  const [primaryMuscle, setPrimaryMuscle] = useState<MuscleGroup>("chest");
  const [category, setCategory] = useState<ExerciseCategory>("accessory");
  const [saving, setSaving] = useState(false);

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      const trimmed = name.trim();
      if (!trimmed) return;
      const slug = slugify(trimmed) || `exercise-${Date.now()}`;
      setSaving(true);
      try {
        const db = getFirebaseDb();
        const ref = doc(db, "users", uid, "exercises", slug);
        await setDoc(ref, {
          name: trimmed,
          primaryMuscle,
          category,
          seeded: false,
          createdAt: serverTimestamp(),
        });
        onAdded({ id: slug, name: trimmed });
      } catch (err) {
        onError(err instanceof Error ? err.message : "Failed to add exercise");
      } finally {
        setSaving(false);
      }
    },
    [name, primaryMuscle, category, uid, onAdded, onError],
  );

  return (
    <form onSubmit={handleSubmit} className="space-y-2">
      <input
        type="text"
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Exercise name"
        maxLength={64}
        autoFocus
        className="h-9 w-full rounded-md border border-border bg-neutral-900 px-2.5 text-sm text-neutral-100 focus:border-accent focus:outline-none"
      />
      <div className="grid grid-cols-2 gap-2">
        <select
          value={primaryMuscle}
          onChange={(e) => setPrimaryMuscle(e.target.value as MuscleGroup)}
          className="h-9 rounded-md border border-border bg-neutral-900 px-2 text-xs text-neutral-100 focus:border-accent focus:outline-none"
        >
          {MUSCLE_GROUPS.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <select
          value={category}
          onChange={(e) => setCategory(e.target.value as ExerciseCategory)}
          className="h-9 rounded-md border border-border bg-neutral-900 px-2 text-xs text-neutral-100 focus:border-accent focus:outline-none"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
      </div>
      <div className="flex justify-end gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="h-9 rounded-md border border-border bg-neutral-900 px-3 text-xs text-muted hover:text-neutral-200"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={saving || !name.trim()}
          className="h-9 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:opacity-50"
        >
          {saving ? "Adding…" : "Add"}
        </button>
      </div>
    </form>
  );
}
