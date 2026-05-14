"use client";

import { useCallback, useMemo, useState } from "react";
import { serverTimestamp, setDoc } from "firebase/firestore";
import { Pencil, Save, X } from "lucide-react";

import { profilePath } from "@/lib/db/paths";
import type { Profile } from "@/lib/db/types";
import {
  displayCategory,
  listExpenseCategories,
} from "@/lib/money/categories";

/**
 * Budget tracker for the /money page. Renders one row per category that has
 * either a configured budget OR any spend this month. Inline edit lets the
 * user set/clear a budget per category.
 *
 * Spend is passed in (already computed by the parent). Budgets are merged with
 * the user's profile via `setDoc({merge: true})`.
 */
export interface BudgetSectionProps {
  uid: string;
  profile: Profile | null;
  /** Minor-unit spend per category for the current month. */
  spendByCategory: Map<string, number>;
  currency: string;
}

interface BudgetRow {
  category: string;
  budget: number;
  spent: number;
}

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

export default function BudgetSection({
  uid,
  profile,
  spendByCategory,
  currency,
}: BudgetSectionProps) {
  const budgets = useMemo(() => profile?.budgets ?? {}, [profile?.budgets]);

  const allCategories = useMemo(
    () => listExpenseCategories(profile),
    [profile],
  );

  const rows = useMemo<BudgetRow[]>(() => {
    const out: BudgetRow[] = [];
    const seen = new Set<string>();
    for (const entry of allCategories) {
      if (entry.id === "income") continue;
      const budget = budgets[entry.id] ?? 0;
      const spent = spendByCategory.get(entry.id) ?? 0;
      if (budget > 0 || spent > 0) {
        out.push({ category: entry.id, budget, spent });
        seen.add(entry.id);
      }
    }
    // Surface a few common categories even if zero, so the user can find them.
    for (const cat of ["food", "groceries", "transport"]) {
      if (!seen.has(cat)) {
        out.push({ category: cat, budget: 0, spent: 0 });
      }
    }
    // Include any spent-but-unbudgeted category that came from a doc whose
    // category was deleted from customCategories (legacy data).
    for (const [cat, spent] of spendByCategory.entries()) {
      if (!seen.has(cat)) {
        out.push({ category: cat, budget: budgets[cat] ?? 0, spent });
        seen.add(cat);
      }
    }
    return out;
  }, [allCategories, budgets, spendByCategory]);

  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const startEdit = useCallback((cat: string, current: number) => {
    setEditing(cat);
    setDraft(current > 0 ? (current / 100).toString() : "");
    setError(null);
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
    setDraft("");
  }, []);

  const saveBudget = useCallback(
    async (cat: string) => {
      if (!uid) return;
      const value = parseFloat(draft);
      const minor = Number.isFinite(value) && value > 0 ? Math.round(value * 100) : 0;
      setSaving(true);
      setError(null);
      try {
        const next = { ...budgets };
        if (minor === 0) {
          delete next[cat];
        } else {
          next[cat] = minor;
        }
        await setDoc(
          profilePath(uid),
          { budgets: next, updatedAt: serverTimestamp() },
          { merge: true },
        );
        setEditing(null);
        setDraft("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to save budget",
        );
      } finally {
        setSaving(false);
      }
    },
    [uid, draft, budgets],
  );

  return (
    <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
      <div className="flex items-baseline justify-between">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          Budgets
        </h2>
        <span className="text-[10px] text-muted">this month</span>
      </div>

      {error ? (
        <div className="mt-3 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-xs text-red-300">
          {error}
        </div>
      ) : null}

      <ul className="mt-3 space-y-3">
        {rows.map((row) => {
          const isEditing = editing === row.category;
          const pct =
            row.budget > 0 ? Math.min(150, (row.spent / row.budget) * 100) : 0;
          const tone: "ok" | "warn" | "over" =
            row.budget === 0
              ? "ok"
              : pct > 100
                ? "over"
                : pct >= 80
                  ? "warn"
                  : "ok";
          const barColor =
            tone === "over"
              ? "bg-red-500"
              : tone === "warn"
                ? "bg-amber-400"
                : "bg-accent/70";
          return (
            <li key={row.category}>
              <div className="flex items-center justify-between gap-2">
                <div className="flex-1">
                  <div className="text-xs font-medium text-neutral-200">
                    {displayCategory(row.category)}
                  </div>
                  <div className="mt-0.5 text-[11px] text-muted tabular-nums">
                    {formatMoney(row.spent, currency)}
                    {row.budget > 0 ? (
                      <>
                        {" / "}
                        <span className="text-neutral-300">
                          {formatMoney(row.budget, currency)}
                        </span>
                        {tone === "over" ? (
                          <span className="ml-2 rounded-full bg-red-500/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-red-300">
                            Over
                          </span>
                        ) : tone === "warn" ? (
                          <span className="ml-2 rounded-full bg-amber-400/20 px-1.5 py-0.5 text-[9px] font-semibold uppercase text-amber-300">
                            {Math.round(pct)}%
                          </span>
                        ) : null}
                      </>
                    ) : (
                      <span className="ml-1 text-muted">· no budget</span>
                    )}
                  </div>
                </div>
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <input
                      type="number"
                      inputMode="decimal"
                      step="1"
                      min="0"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      placeholder="0"
                      autoFocus
                      className="h-8 w-20 rounded-md border border-border bg-neutral-900 px-2 text-right text-xs text-neutral-100 tabular-nums focus:border-accent focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => saveBudget(row.category)}
                      disabled={saving}
                      aria-label="Save"
                      className="rounded-md bg-accent p-1.5 text-neutral-900 hover:brightness-110 disabled:opacity-50"
                    >
                      <Save className="h-3.5 w-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={cancelEdit}
                      aria-label="Cancel"
                      className="rounded-md border border-border bg-neutral-900 p-1.5 text-muted hover:text-neutral-200"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => startEdit(row.category, row.budget)}
                    aria-label={`Edit ${displayCategory(row.category)} budget`}
                    className="rounded-md border border-border bg-neutral-900 px-2 py-1 text-[10px] font-medium text-muted hover:text-neutral-200"
                  >
                    <Pencil className="h-3 w-3" />
                  </button>
                )}
              </div>
              <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-neutral-800/70">
                <div
                  className={`h-full ${barColor} transition-[width] duration-300`}
                  style={{ width: `${Math.min(100, pct)}%` }}
                />
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
