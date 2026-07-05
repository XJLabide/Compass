import type { ExpenseCategory, Profile } from "@/lib/db/types";

/**
 * Single source of truth for expense category labels and helpers.
 *
 * Categories are split into:
 *   - SEEDED: a small built-in set with fixed display labels and icons (mapped
 *     elsewhere). Always shown to the user.
 *   - CUSTOM: user-defined free-form strings stored on `profile.customCategories`.
 *
 * Both sources are merged when rendering pickers. Storage on `ExpenseDoc.category`
 * is a free-form string in either case.
 */

export const SEEDED_CATEGORIES: ExpenseCategory[] = [
  "food",
  "groceries",
  "transport",
  "rent",
  "utilities",
  "subscriptions",
  "entertainment",
  "health",
  "shopping",
  "savings",
  "income",
  "other",
];

export const SEEDED_CATEGORY_LABELS: Record<ExpenseCategory, string> = {
  food: "Food",
  groceries: "Groceries",
  transport: "Transport",
  rent: "Rent",
  utilities: "Utilities",
  subscriptions: "Subscriptions",
  entertainment: "Entertainment",
  health: "Health",
  shopping: "Shopping",
  savings: "Savings",
  income: "Income",
  other: "Other",
};

/** Lowercase + trim a free-form category label to its canonical id. */
export function normalizeCategory(input: string): string {
  return input.trim().toLowerCase().slice(0, 32);
}

/** Title-case fallback for displaying a custom category that has no label override. */
export function displayCategory(id: string): string {
  if ((SEEDED_CATEGORY_LABELS as Record<string, string>)[id]) {
    return SEEDED_CATEGORY_LABELS[id as ExpenseCategory];
  }
  if (!id) return "";
  return id
    .split(/[\s-_]+/)
    .map((s) => s.charAt(0).toUpperCase() + s.slice(1))
    .join(" ");
}

export interface CategoryEntry {
  id: string;
  label: string;
  custom: boolean;
}

/** Combined seeded + custom list, deduped, with income filtered out for expense pickers. */
export function listExpenseCategories(
  profile: Profile | null,
  options: { includeIncome?: boolean } = {},
): CategoryEntry[] {
  const { includeIncome = false } = options;
  const out: CategoryEntry[] = [];
  const seen = new Set<string>();

  for (const id of SEEDED_CATEGORIES) {
    if (!includeIncome && id === "income") continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: SEEDED_CATEGORY_LABELS[id], custom: false });
  }

  for (const raw of profile?.customCategories ?? []) {
    const id = normalizeCategory(raw);
    if (!id) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, label: displayCategory(id), custom: true });
  }

  return out;
}
