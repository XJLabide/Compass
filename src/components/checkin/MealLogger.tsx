"use client";

import { useMemo, useState } from "react";
import { BookOpen, Coffee, Cookie, Flame, Plus, Trash2, Utensils } from "lucide-react";
import clsx from "clsx";

import type { FavoriteFood, LoggedMealItem, Profile } from "@/lib/db/types";
import FoodLibraryModal from "./FoodLibraryModal";
import MacroRatioChart from "./MacroRatioChart";

const PRESETS = [
  { name: "Eggs (2 large)", emoji: "🥚", calories: 140, protein: 12, carbs: 0, fat: 10 },
  { name: "Chicken & Rice", emoji: "🍗", calories: 450, protein: 35, carbs: 50, fat: 8 },
  { name: "Oats with Honey", emoji: "🥣", calories: 280, protein: 8, carbs: 55, fat: 4 },
  { name: "Protein Shake", emoji: "🥤", calories: 160, protein: 25, carbs: 3, fat: 2 },
  { name: "Banana", emoji: "🍌", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Avocado Toast", emoji: "🥑", calories: 320, protein: 8, carbs: 30, fat: 18 },
  { name: "Whole Milk (glass)", emoji: "🥛", calories: 150, protein: 8, carbs: 12, fat: 8 },
  { name: "Mixed Nuts (handful)", emoji: "🥜", calories: 180, protein: 5, carbs: 6, fat: 16 },
];

export interface MealLoggerProps {
  loggedMeals: LoggedMealItem[];
  profile: Profile;
  onUpdateMeals?: (newMeals: LoggedMealItem[]) => void;
  onUpdateProfileFavorites?: (newFavorites: FavoriteFood[]) => Promise<void>;
  readOnly?: boolean;
}

export default function MealLogger({
  loggedMeals = [],
  profile,
  onUpdateMeals,
  onUpdateProfileFavorites,
  readOnly = false,
}: MealLoggerProps) {
  const [showAddForm, setShowAddForm] = useState(false);
  const [showLibrary, setShowLibrary] = useState(false);

  // Quick-add form state
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [category, setCategory] = useState<LoggedMealItem["category"]>("breakfast");

  // Daily totals
  const totals = useMemo(() => {
    return loggedMeals.reduce(
      (acc, meal) => {
        acc.calories += meal.calories;
        acc.protein += meal.proteinG;
        acc.carbs += meal.carbsG;
        acc.fat += meal.fatG;
        return acc;
      },
      { calories: 0, protein: 0, carbs: 0, fat: 0 }
    );
  }, [loggedMeals]);

  // Profile targets
  const targets = useMemo(() => {
    return {
      calories: profile.calorieTargetKcal || 2000,
      protein: profile.proteinTargetG || 150,
      carbs: profile.carbTargetG || 250,
      fat: profile.fatTargetG || 70,
    };
  }, [profile]);

  // Grouped meals
  const groupedMeals = useMemo(() => {
    const groups: Record<LoggedMealItem["category"], LoggedMealItem[]> = {
      breakfast: [],
      lunch: [],
      dinner: [],
      snack: [],
    };
    loggedMeals.forEach((meal) => {
      groups[meal.category] = groups[meal.category] || [];
      groups[meal.category].push(meal);
    });
    return groups;
  }, [loggedMeals]);

  const handleAddMealItem = (item: Omit<LoggedMealItem, "id" | "createdAt">) => {
    if (readOnly) return;
    const newItem: LoggedMealItem = {
      ...item,
      id: `meal-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
      createdAt: { toDate: () => new Date() } as any, // Mock Timestamp or SDK compatible representation
    };
    onUpdateMeals?.([...loggedMeals, newItem]);
  };

  const handleQuickAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    handleAddMealItem({
      name: name.trim(),
      calories: parseInt(calories) || 0,
      proteinG: parseInt(protein) || 0,
      carbsG: parseInt(carbs) || 0,
      fatG: parseInt(fat) || 0,
      category,
    });

    // Reset form
    setName("");
    setCalories("");
    setProtein("");
    setCarbs("");
    setFat("");
    setShowAddForm(false);
  };

  const handleDelete = (id: string) => {
    if (readOnly) return;
    onUpdateMeals?.(loggedMeals.filter((m) => m.id !== id));
  };

  // Favorites handling
  const favorites = profile.favoriteFoods || [];

  const handleSaveFavorite = async (fav: FavoriteFood) => {
    if (readOnly) return;
    const nextFavorites = [...favorites, fav];
    await onUpdateProfileFavorites?.(nextFavorites);
  };

  const handleDeleteFavorite = async (favId: string) => {
    if (readOnly) return;
    const nextFavorites = favorites.filter((f) => f.id !== favId);
    await onUpdateProfileFavorites?.(nextFavorites);
  };

  const macroProgress = (current: number, target: number) => {
    const pct = target > 0 ? Math.round((current / target) * 100) : 0;
    return { pct, width: `${Math.min(pct, 100)}%` };
  };

  const calProg = macroProgress(totals.calories, targets.calories);
  const protProg = macroProgress(totals.protein, targets.protein);
  const carbProg = macroProgress(totals.carbs, targets.carbs);
  const fatProg = macroProgress(totals.fat, targets.fat);

  const CATEGORY_META = {
    breakfast: { label: "Breakfast", icon: Coffee, color: "text-amber-300" },
    lunch: { label: "Lunch", icon: Utensils, color: "text-emerald-300" },
    dinner: { label: "Dinner", icon: Utensils, color: "text-indigo-300" },
    snack: { label: "Snacks", icon: Cookie, color: "text-rose-300" },
  };

  return (
    <div className="space-y-4">
      {/* Target Progress Bar / Ring panel */}
      <div className="rounded-xl border border-border bg-neutral-900/60 p-4 space-y-4">
        <div>
          <div className="flex items-baseline justify-between">
            <span className="text-xs font-semibold uppercase tracking-wider text-muted flex items-center gap-1.5">
              <Flame className="h-4 w-4 text-orange-400" />
              Calories
            </span>
            <span className="text-sm font-semibold text-neutral-100 tabular-nums">
              {totals.calories} / {targets.calories} kcal ({calProg.pct}%)
            </span>
          </div>
          <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-neutral-800">
            <div
              className="h-full bg-gradient-to-r from-orange-500 to-amber-400 transition-[width] duration-300"
              style={{ width: calProg.width }}
            />
          </div>
        </div>

        {/* Macros */}
        <div className="grid grid-cols-3 gap-3">
          {/* Protein */}
          <div className="rounded-lg bg-neutral-900/40 p-2.5 border border-border/40">
            <div className="flex items-baseline justify-between text-[10px] font-bold text-muted">
              <span>Protein</span>
              <span className="tabular-nums">{totals.protein}/{targets.protein}g</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-cyan-400 transition-[width]" style={{ width: protProg.width }} />
            </div>
            <div className="mt-0.5 text-[9px] text-right text-muted">{protProg.pct}%</div>
          </div>

          {/* Carbs */}
          <div className="rounded-lg bg-neutral-900/40 p-2.5 border border-border/40">
            <div className="flex items-baseline justify-between text-[10px] font-bold text-muted">
              <span>Carbs</span>
              <span className="tabular-nums">{totals.carbs}/{targets.carbs}g</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-amber-300 transition-[width]" style={{ width: carbProg.width }} />
            </div>
            <div className="mt-0.5 text-[9px] text-right text-muted">{carbProg.pct}%</div>
          </div>

          {/* Fat */}
          <div className="rounded-lg bg-neutral-900/40 p-2.5 border border-border/40">
            <div className="flex items-baseline justify-between text-[10px] font-bold text-muted">
              <span>Fat</span>
              <span className="tabular-nums">{totals.fat}/{targets.fat}g</span>
            </div>
            <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800">
              <div className="h-full bg-rose-400 transition-[width]" style={{ width: fatProg.width }} />
            </div>
            <div className="mt-0.5 text-[9px] text-right text-muted">{fatProg.pct}%</div>
          </div>
        </div>
      </div>

      <MacroRatioChart
        proteinG={totals.protein}
        carbsG={totals.carbs}
        fatG={totals.fat}
      />

      {/* Action Buttons */}
      {!readOnly && (
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => {
              setShowAddForm(!showAddForm);
              setShowLibrary(false);
            }}
            className={clsx(
              "flex-1 h-10 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition border",
              showAddForm
                ? "border-border bg-neutral-900 text-neutral-200"
                : "border-accent/40 bg-accent/10 text-accent hover:bg-accent/20"
            )}
          >
            <Plus className="h-4 w-4" />
            Quick Log Food
          </button>
          <button
            type="button"
            onClick={() => {
              setShowLibrary(true);
              setShowAddForm(false);
            }}
            className="flex-1 h-10 rounded-lg flex items-center justify-center gap-1.5 text-xs font-semibold transition border border-border bg-neutral-900 text-neutral-200 hover:bg-neutral-800"
          >
            <BookOpen className="h-4 w-4 text-accent" />
            Favorites Library
          </button>
        </div>
      )}

      {/* Quick Add Form */}
      {showAddForm && (
        <form
          onSubmit={handleQuickAdd}
          className="rounded-xl border border-dashed border-accent/40 bg-accent/5 p-4 space-y-4"
        >
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-bold uppercase tracking-wider text-accent">Quick Log Food</h4>
            <button
              type="button"
              onClick={() => setShowAddForm(false)}
              className="text-[10px] text-muted hover:text-neutral-200"
            >
              Cancel
            </button>
          </div>

          {/* Presets Grid */}
          <div className="space-y-2">
            <h5 className="text-[10px] font-bold uppercase tracking-wider text-muted">Quick Presets</h5>
            <div className="grid grid-cols-4 gap-1.5">
              {PRESETS.map((p) => (
                <button
                  key={p.name}
                  type="button"
                  onClick={() => {
                    setName(p.name);
                    setCalories(String(p.calories));
                    setProtein(String(p.protein));
                    setCarbs(String(p.carbs));
                    setFat(String(p.fat));
                  }}
                  className="flex flex-col items-center justify-center rounded-lg border border-border bg-neutral-900/60 p-2 text-center transition hover:bg-neutral-800"
                >
                  <span className="text-lg">{p.emoji}</span>
                  <span className="mt-1 text-[8px] font-bold text-neutral-300 truncate w-full px-0.5">
                    {p.name.split(" ")[0]}
                  </span>
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-4 border-t border-border/40 pt-3">
            <div className="space-y-1">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Food Name</label>
              <input
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Oatmeal"
                className="h-9 w-full rounded-lg border border-border bg-neutral-900 px-3 text-xs text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
              />
            </div>

            <div className="space-y-3">
              {/* Calories Input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-16 shrink-0 text-xs font-semibold text-neutral-300">Calories</div>
                <input
                  type="number"
                  value={calories}
                  onChange={(e) => setCalories(e.target.value)}
                  placeholder="kcal"
                  className="h-8 w-24 rounded-lg border border-border bg-neutral-900 px-2.5 text-xs text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-1">
                  {["+50", "+100", "+250"].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setCalories((c) => String((parseInt(c) || 0) + parseInt(inc)))}
                      className="rounded bg-neutral-800 px-2 py-0.5 text-[10px] font-bold text-neutral-300 hover:bg-neutral-700 transition"
                    >
                      {inc}
                    </button>
                  ))}
                </div>
              </div>

              {/* Protein Input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-16 shrink-0 text-xs font-semibold text-neutral-300">Protein</div>
                <input
                  type="number"
                  value={protein}
                  onChange={(e) => setProtein(e.target.value)}
                  placeholder="grams"
                  className="h-8 w-24 rounded-lg border border-border bg-neutral-900 px-2.5 text-xs text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-1">
                  {["+5", "+10", "+25"].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setProtein((p) => String((parseInt(p) || 0) + parseInt(inc)))}
                      className="rounded bg-cyan-950/40 border border-cyan-800/30 px-2 py-0.5 text-[10px] font-bold text-cyan-300 hover:bg-cyan-900/40 transition"
                    >
                      {inc}g
                    </button>
                  ))}
                </div>
              </div>

              {/* Carbs Input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-16 shrink-0 text-xs font-semibold text-neutral-300">Carbs</div>
                <input
                  type="number"
                  value={carbs}
                  onChange={(e) => setCarbs(e.target.value)}
                  placeholder="grams"
                  className="h-8 w-24 rounded-lg border border-border bg-neutral-900 px-2.5 text-xs text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-1">
                  {["+10", "+25", "+50"].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setCarbs((c) => String((parseInt(c) || 0) + parseInt(inc)))}
                      className="rounded bg-amber-950/40 border border-amber-800/30 px-2 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-900/40 transition"
                    >
                      {inc}g
                    </button>
                  ))}
                </div>
              </div>

              {/* Fat Input */}
              <div className="flex flex-wrap items-center gap-2">
                <div className="w-16 shrink-0 text-xs font-semibold text-neutral-300">Fat</div>
                <input
                  type="number"
                  value={fat}
                  onChange={(e) => setFat(e.target.value)}
                  placeholder="grams"
                  className="h-8 w-24 rounded-lg border border-border bg-neutral-900 px-2.5 text-xs text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
                />
                <div className="flex gap-1">
                  {["+5", "+10", "+15"].map((inc) => (
                    <button
                      key={inc}
                      type="button"
                      onClick={() => setFat((f) => String((parseInt(f) || 0) + parseInt(inc)))}
                      className="rounded bg-rose-950/40 border border-rose-800/30 px-2 py-0.5 text-[10px] font-bold text-rose-300 hover:bg-rose-900/40 transition"
                    >
                      {inc}g
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="space-y-1.5 border-t border-border/40 pt-3">
              <label className="text-[10px] font-bold uppercase tracking-wider text-muted">Meal Category</label>
              <div className="grid grid-cols-4 gap-1.5">
                {(["breakfast", "lunch", "dinner", "snack"] as const).map((cat) => (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategory(cat)}
                    className={clsx(
                      "rounded-md border py-1.5 text-[10px] font-semibold uppercase tracking-wider text-center transition-colors",
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
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-border/40">
            <button
              type="submit"
              disabled={!name.trim()}
              className="h-9 rounded-lg bg-accent px-5 text-xs font-bold text-neutral-950 hover:brightness-110 disabled:opacity-50 transition"
            >
              Add Entry
            </button>
          </div>
        </form>
      )}

      {/* Meals Categorized List */}
      <div className="space-y-3 pt-1">
        {(["breakfast", "lunch", "dinner", "snack"] as const).map((cat) => {
          const catMeals = groupedMeals[cat] || [];
          const catCalories = catMeals.reduce((sum, m) => sum + m.calories, 0);
          const Meta = CATEGORY_META[cat];
          const Icon = Meta.icon;

          return (
            <div
              key={cat}
              className="rounded-xl border border-border bg-neutral-900/40 overflow-hidden"
            >
              {/* Category Header */}
              <div className="flex items-center justify-between bg-neutral-900/60 px-4 py-2.5 border-b border-border/30">
                <div className="flex items-center gap-2">
                  <Icon className={clsx("h-4 w-4", Meta.color)} />
                  <span className="text-xs font-bold uppercase tracking-wider text-neutral-100">
                    {Meta.label}
                  </span>
                </div>
                <span className="text-xs font-semibold text-muted tabular-nums">
                  {catCalories} kcal
                </span>
              </div>

              {/* Items List */}
              {catMeals.length === 0 ? (
                <div className="px-4 py-3 text-xs text-muted italic text-center">
                  No items logged for {Meta.label}
                </div>
              ) : (
                <ul className="divide-y divide-border/20">
                  {catMeals.map((meal) => (
                    <li
                      key={meal.id}
                      className="flex items-center justify-between gap-3 px-4 py-2 hover:bg-neutral-800/25"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="text-sm font-medium text-neutral-100 truncate">
                          {meal.name}
                        </div>
                        <div className="mt-0.5 text-[11px] text-muted">
                          {meal.calories} kcal · P: {meal.proteinG}g · C: {meal.carbsG}g · F: {meal.fatG}g
                        </div>
                      </div>
                      {!readOnly && (
                        <button
                          type="button"
                          onClick={() => handleDelete(meal.id)}
                          className="rounded p-1 text-muted hover:bg-red-500/10 hover:text-red-300 transition"
                          aria-label="Delete entry"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          );
        })}
      </div>

      {/* Favorites Library Modal */}
      <FoodLibraryModal
        open={showLibrary}
        onClose={() => setShowLibrary(false)}
        favorites={favorites}
        onAddMealItem={handleAddMealItem}
        onSaveFavorite={handleSaveFavorite}
        onDeleteFavorite={handleDeleteFavorite}
      />
    </div>
  );
}
