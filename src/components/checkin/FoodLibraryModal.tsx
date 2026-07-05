"use client";

import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Trash2, X } from "lucide-react";
import clsx from "clsx";

import { useBodyScrollLock } from "@/lib/ui/useBodyScrollLock";
import type { FavoriteFood, LoggedMealItem } from "@/lib/db/types";

export interface FoodLibraryModalProps {
  open: boolean;
  onClose: () => void;
  favorites: FavoriteFood[];
  onAddMealItem: (item: Omit<LoggedMealItem, "id" | "createdAt">) => void;
  onSaveFavorite: (item: FavoriteFood) => Promise<void>;
  onDeleteFavorite: (id: string) => Promise<void>;
}

export default function FoodLibraryModal({
  open,
  onClose,
  favorites,
  onAddMealItem,
  onSaveFavorite,
  onDeleteFavorite,
}: FoodLibraryModalProps) {
  useBodyScrollLock(open);

  const [search, setSearch] = useState("");
  const [selectedFood, setSelectedFood] = useState<FavoriteFood | null>(null);
  const [quantity, setQuantity] = useState("1.0");
  const [category, setCategory] = useState<LoggedMealItem["category"]>("breakfast");

  // State for creating a new favorite
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState("");
  const [newCalories, setNewCalories] = useState("");
  const [newProtein, setNewProtein] = useState("");
  const [newCarbs, setNewCarbs] = useState("");
  const [newFat, setNewFat] = useState("");
  const [savingFav, setSavingFav] = useState(false);

  // Esc key to close
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  const filteredFavorites = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return favorites;
    return favorites.filter((f) => f.name.toLowerCase().includes(q));
  }, [favorites, search]);

  const handleAdd = () => {
    if (!selectedFood) return;
    const mult = parseFloat(quantity) || 1.0;
    onAddMealItem({
      name: `${selectedFood.name} (${quantity}x)`,
      calories: Math.round(selectedFood.calories * mult),
      proteinG: Math.round(selectedFood.proteinG * mult),
      carbsG: Math.round(selectedFood.carbsG * mult),
      fatG: Math.round(selectedFood.fatG * mult),
      category,
    });
    setSelectedFood(null);
    setQuantity("1.0");
    onClose();
  };

  const handleCreateFavorite = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newName.trim();
    const c = parseInt(newCalories) || 0;
    const p = parseInt(newProtein) || 0;
    const cb = parseInt(newCarbs) || 0;
    const f = parseInt(newFat) || 0;

    if (!name) return;
    setSavingFav(true);
    try {
      await onSaveFavorite({
        id: `fav-${Date.now()}`,
        name,
        calories: c,
        proteinG: p,
        carbsG: cb,
        fatG: f,
      });
      setNewName("");
      setNewCalories("");
      setNewProtein("");
      setNewCarbs("");
      setNewFat("");
      setShowCreate(false);
    } catch (err) {
      console.error(err);
    } finally {
      setSavingFav(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-[60] flex items-center justify-center bg-black/65 backdrop-blur p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md overflow-hidden rounded-2xl border border-border bg-panel shadow-2xl flex flex-col max-h-[85vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <h2 className="text-sm font-semibold text-neutral-100">Food Library & Favorites</h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-1 text-muted hover:bg-neutral-800 hover:text-neutral-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {selectedFood ? (
            /* Log Item Form */
            <div className="space-y-4">
              <div className="rounded-lg bg-neutral-900/60 p-3 border border-border">
                <h3 className="font-semibold text-neutral-100">{selectedFood.name}</h3>
                <div className="mt-2 grid grid-cols-4 gap-2 text-center text-xs">
                  <div className="rounded bg-neutral-900 p-1">
                    <div className="text-muted">Calories</div>
                    <div className="font-semibold text-neutral-100">{selectedFood.calories} kcal</div>
                  </div>
                  <div className="rounded bg-neutral-900 p-1">
                    <div className="text-muted">Protein</div>
                    <div className="font-semibold text-neutral-100">{selectedFood.proteinG}g</div>
                  </div>
                  <div className="rounded bg-neutral-900 p-1">
                    <div className="text-muted">Carbs</div>
                    <div className="font-semibold text-neutral-100">{selectedFood.carbsG}g</div>
                  </div>
                  <div className="rounded bg-neutral-900 p-1">
                    <div className="text-muted">Fat</div>
                    <div className="font-semibold text-neutral-100">{selectedFood.fatG}g</div>
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                  Serving Multiplier
                </label>
                <input
                  type="text"
                  inputMode="decimal"
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  placeholder="e.g. 1.0, 1.5, 0.5"
                  className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase tracking-wider text-muted mb-1.5">
                  Meal Category
                </label>
                <div className="grid grid-cols-4 gap-1.5">
                  {(["breakfast", "lunch", "dinner", "snack"] as const).map((cat) => (
                    <button
                      key={cat}
                      type="button"
                      onClick={() => setCategory(cat)}
                      className={clsx(
                        "rounded-md border py-1.5 text-xs font-medium uppercase tracking-wider transition-colors text-center",
                        category === cat
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-neutral-900 text-muted hover:text-neutral-200"
                      )}
                    >
                      {cat === "breakfast" ? "Bfast" : cat}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setSelectedFood(null)}
                  className="flex-1 h-10 rounded-lg border border-border bg-neutral-900 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Back
                </button>
                <button
                  type="button"
                  onClick={handleAdd}
                  className="flex-1 h-10 rounded-lg bg-accent text-sm font-semibold text-neutral-950 hover:brightness-110"
                >
                  Log Food
                </button>
              </div>
            </div>
          ) : showCreate ? (
            /* Create Favorite Form */
            <form onSubmit={handleCreateFavorite} className="space-y-4">
              <h3 className="font-semibold text-neutral-100">Add New Favorite Food</h3>

              <div className="space-y-3">
                <div>
                  <label className="block text-xs text-muted mb-1">Food Name</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Protein shake, Avocado toast"
                    className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted mb-1">Calories (kcal)</label>
                    <input
                      type="number"
                      required
                      value={newCalories}
                      onChange={(e) => setNewCalories(e.target.value)}
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Protein (g)</label>
                    <input
                      type="number"
                      required
                      value={newProtein}
                      onChange={(e) => setNewProtein(e.target.value)}
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Carbs (g)</label>
                    <input
                      type="number"
                      required
                      value={newCarbs}
                      onChange={(e) => setNewCarbs(e.target.value)}
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted mb-1">Fat (g)</label>
                    <input
                      type="number"
                      required
                      value={newFat}
                      onChange={(e) => setNewFat(e.target.value)}
                      placeholder="0"
                      className="h-10 w-full rounded-lg border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreate(false)}
                  className="flex-1 h-10 rounded-lg border border-border bg-neutral-900 text-sm text-neutral-200 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={savingFav}
                  className="flex-1 h-10 rounded-lg bg-accent text-sm font-semibold text-neutral-950 hover:brightness-110 disabled:opacity-50"
                >
                  {savingFav ? "Saving..." : "Save Favorite"}
                </button>
              </div>
            </form>
          ) : (
            /* Favorite List */
            <div className="space-y-3">
              {/* Search + Add Bar */}
              <div className="flex gap-2">
                <div className="relative flex-1">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
                  <input
                    type="text"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search favorites..."
                    className="h-10 w-full rounded-lg border border-border bg-neutral-900 pl-9 pr-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setShowCreate(true)}
                  className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-accent/10 text-accent border border-accent/20 hover:bg-accent/20"
                >
                  <Plus className="h-5 w-5" />
                </button>
              </div>

              {/* Favorites list */}
              {filteredFavorites.length === 0 ? (
                <div className="text-center py-6 text-xs text-muted border border-dashed border-border rounded-xl">
                  No favorites found. Click &quot;+&quot; to create one.
                </div>
              ) : (
                <ul className="space-y-2">
                  {filteredFavorites.map((fav) => (
                    <li
                      key={fav.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-border bg-neutral-900/40 p-3 hover:bg-neutral-800/40"
                    >
                      <button
                        type="button"
                        onClick={() => setSelectedFood(fav)}
                        className="flex-1 text-left min-w-0"
                      >
                        <div className="font-semibold text-neutral-100 truncate text-sm">
                          {fav.name}
                        </div>
                        <div className="mt-0.5 text-xs text-muted">
                          {fav.calories} kcal · P: {fav.proteinG}g · C: {fav.carbsG}g · F: {fav.fatG}g
                        </div>
                      </button>

                      <button
                        type="button"
                        onClick={() => onDeleteFavorite(fav.id)}
                        className="rounded p-1.5 text-muted hover:bg-red-500/15 hover:text-red-300 transition"
                        aria-label="Delete favorite"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
