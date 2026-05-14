"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { arrayUnion, serverTimestamp, setDoc, updateDoc } from "firebase/firestore";
import { Plus, X } from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { profilePath } from "@/lib/db/paths";
import {
  SEEDED_CATEGORIES,
  displayCategory,
  normalizeCategory,
} from "@/lib/money/categories";

/**
 * Settings section for managing user-defined expense categories.
 *
 * Storage: `profile.customCategories: string[]`. Seeded categories (food,
 * transport, etc.) are always available and cannot be removed — this UI only
 * surfaces the user-extensible slice.
 */
export default function CustomCategoriesSection() {
  const { uid, profile } = useUserData();
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const custom = useMemo(
    () => profile?.customCategories ?? [],
    [profile?.customCategories],
  );

  const seededSet = useMemo(() => new Set<string>(SEEDED_CATEGORIES), []);

  const handleAdd = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid || saving) return;
      const id = normalizeCategory(draft);
      if (!id) return;
      if (seededSet.has(id)) {
        setError("That's already a built-in category.");
        return;
      }
      if (custom.includes(id)) {
        setError("You've already added that category.");
        return;
      }
      if (custom.length >= 50) {
        setError("You've hit the 50-category cap.");
        return;
      }
      setError(null);
      setSaving(true);
      try {
        // Use updateDoc with arrayUnion when the doc exists. If the profile
        // doesn't have customCategories yet, fall back to setDoc with merge.
        try {
          await updateDoc(profilePath(uid), {
            customCategories: arrayUnion(id),
            updatedAt: serverTimestamp(),
          });
        } catch {
          await setDoc(
            profilePath(uid),
            {
              customCategories: [...custom, id],
              updatedAt: serverTimestamp(),
            },
            { merge: true },
          );
        }
        setDraft("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to save");
      } finally {
        setSaving(false);
      }
    },
    [uid, draft, custom, seededSet, saving],
  );

  const handleRemove = useCallback(
    async (id: string) => {
      if (!uid || saving) return;
      setSaving(true);
      setError(null);
      try {
        const next = custom.filter((c) => c !== id);
        // Also strip the deleted category from any budgets that referenced it.
        const budgets = { ...(profile?.budgets ?? {}) };
        delete budgets[id];
        await setDoc(
          profilePath(uid),
          {
            customCategories: next,
            budgets,
            updatedAt: serverTimestamp(),
          },
          { merge: true },
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to remove");
      } finally {
        setSaving(false);
      }
    },
    [uid, custom, profile?.budgets, saving],
  );

  return (
    <div className="space-y-3">
      <p className="text-[11px] text-muted">
        Built-in categories (food, transport, etc.) are always available.
        Add your own here — they&apos;ll appear in expense pickers and budgets.
      </p>

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          type="text"
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="e.g. coffee, pets, subscriptions"
          maxLength={32}
          className="h-10 flex-1 rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
        />
        <button
          type="submit"
          disabled={saving || !normalizeCategory(draft)}
          className="inline-flex h-10 items-center gap-1 rounded-md bg-accent px-3 text-xs font-semibold text-neutral-900 hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add
        </button>
      </form>

      {error ? (
        <div className="rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      {custom.length > 0 ? (
        <ul className="flex flex-wrap gap-1.5">
          {custom.map((id) => (
            <li
              key={id}
              className="group inline-flex items-center gap-1 rounded-full border border-border bg-neutral-900 py-1 pl-3 pr-1 text-xs text-neutral-100"
            >
              <span>{displayCategory(id)}</span>
              <button
                type="button"
                onClick={() => handleRemove(id)}
                disabled={saving}
                aria-label={`Remove ${displayCategory(id)}`}
                className="rounded-full p-0.5 text-muted hover:bg-red-500/10 hover:text-red-300 disabled:opacity-50"
              >
                <X className="h-3 w-3" />
              </button>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-[11px] text-muted">
          No custom categories yet. Add anything specific to your life.
        </p>
      )}
    </div>
  );
}
