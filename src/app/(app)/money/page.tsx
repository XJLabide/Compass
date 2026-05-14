"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type FormEvent,
} from "react";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  where,
} from "firebase/firestore";
import {
  ArrowDownRight,
  ArrowUpRight,
  Trash2,
  Wallet,
} from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { expensePath, expensesPath } from "@/lib/db/paths";
import type { ExpenseDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import BudgetSection from "@/components/money/BudgetSection";
import {
  displayCategory,
  listExpenseCategories,
} from "@/lib/money/categories";

const DEFAULT_CURRENCY = "USD";

function formatMoney(minor: number, currency: string): string {
  const amount = minor / 100;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${amount.toFixed(2)} ${currency}`;
  }
}

type Row = { id: string; data: ExpenseDoc };

export default function MoneyPage() {
  const { uid, profile, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const userCurrency = effectiveProfile?.currency ?? DEFAULT_CURRENCY;
  const today = useMemo(
    () => computeLocalDate(new Date(), tz),
    [tz],
  );
  const monthStart = useMemo(() => `${today.slice(0, 7)}-01`, [today]);

  const [rows, setRows] = useState<Row[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState("");

  const categoryOptions = useMemo(
    () => listExpenseCategories(profile),
    [profile],
  );
  const [adding, setAdding] = useState(false);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      expensesPath(uid),
      where("localDate", ">=", monthStart),
      orderBy("localDate", "desc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, data: d.data() })));
        setError(null);
      },
      (err) => setError(err.message),
    );
    return () => unsub();
  }, [uid, monthStart]);

  const totals = useMemo(() => {
    let income = 0;
    let expense = 0;
    const byCat = new Map<string, number>();
    for (const r of rows ?? []) {
      if (r.data.kind === "income") {
        income += r.data.amountMinor;
      } else {
        expense += r.data.amountMinor;
        byCat.set(
          r.data.category,
          (byCat.get(r.data.category) ?? 0) + r.data.amountMinor,
        );
      }
    }
    return { income, expense, net: income - expense, byCat };
  }, [rows]);

  const currency = rows?.[0]?.data.currency ?? userCurrency;

  const handleSubmit = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid || adding) return;
      const value = parseFloat(amount);
      if (Number.isNaN(value) || value <= 0) return;
      setAdding(true);
      try {
        const minor = Math.round(value * 100);
        await addDoc(expensesPath(uid), {
          amountMinor: minor,
          currency: userCurrency,
          kind,
          category: kind === "income" ? "income" : category,
          note: note.trim() || undefined,
          localDate: today,
          date: serverTimestamp(),
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        } as unknown as ExpenseDoc);
        setAmount("");
        setNote("");
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to add entry",
        );
      } finally {
        setAdding(false);
      }
    },
    [uid, adding, amount, kind, category, note, today, userCurrency],
  );

  const remove = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(expensePath(uid, id));
      } catch (err) {
        setError(
          err instanceof Error ? err.message : "Failed to delete entry",
        );
      }
    },
    [uid],
  );

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: tz,
        month: "long",
        year: "numeric",
      }).format(new Date());
    } catch {
      return today.slice(0, 7);
    }
  }, [tz, today]);

  return (
    <section className="space-y-4">
      <header className="flex items-baseline justify-between gap-3">
        <h1 className="text-2xl font-semibold text-neutral-100">Money</h1>
        <span className="text-xs text-muted">{monthLabel}</span>
      </header>

      {/* Month totals */}
      <div className="grid grid-cols-3 gap-3">
        <SummaryCell
          label="Income"
          value={rows ? formatMoney(totals.income, currency) : null}
          tone="positive"
        />
        <SummaryCell
          label="Spent"
          value={rows ? formatMoney(totals.expense, currency) : null}
          tone="negative"
        />
        <SummaryCell
          label="Net"
          value={rows ? formatMoney(totals.net, currency) : null}
          tone={
            !rows
              ? "neutral"
              : totals.net >= 0
                ? "positive"
                : "negative"
          }
        />
      </div>

      {/* Quick-add form */}
      <form
        onSubmit={handleSubmit}
        className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-3"
      >
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setKind("expense")}
            className={
              kind === "expense"
                ? "h-9 flex-1 rounded-md bg-red-500/20 text-sm font-medium text-red-200"
                : "h-9 flex-1 rounded-md bg-neutral-800/60 text-sm text-muted hover:text-neutral-200"
            }
          >
            Expense
          </button>
          <button
            type="button"
            onClick={() => setKind("income")}
            className={
              kind === "income"
                ? "h-9 flex-1 rounded-md bg-emerald-500/20 text-sm font-medium text-emerald-200"
                : "h-9 flex-1 rounded-md bg-neutral-800/60 text-sm text-muted hover:text-neutral-200"
            }
          >
            Income
          </button>
        </div>

        <div className="flex gap-2">
          <div className="flex-1">
            <label
              htmlFor="money-amount"
              className="block text-[10px] uppercase tracking-wide text-muted"
            >
              Amount
            </label>
            <input
              id="money-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0.00"
              className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
              required
            />
          </div>
          {kind === "expense" ? (
            <div className="flex-1">
              <label
                htmlFor="money-category"
                className="block text-[10px] uppercase tracking-wide text-muted"
              >
                Category
              </label>
              <select
                id="money-category"
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="mt-1 h-11 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 focus:border-accent focus:outline-none"
              >
                {categoryOptions.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                    {c.custom ? " ·" : ""}
                  </option>
                ))}
              </select>
            </div>
          ) : null}
        </div>

        <input
          type="text"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Note (optional)"
          className="h-10 w-full rounded-md border border-border bg-neutral-900 px-3 text-sm text-neutral-100 placeholder:text-muted focus:border-accent focus:outline-none"
        />

        <button
          type="submit"
          disabled={adding || !amount}
          className="h-11 w-full rounded-md bg-accent text-sm font-semibold text-neutral-900 transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {adding ? "Saving…" : kind === "expense" ? "Add expense" : "Add income"}
        </button>
      </form>

      {error ? (
        <div
          role="alert"
          aria-live="polite"
          className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-sm text-red-300"
        >
          {error}
        </div>
      ) : null}

      {/* Budgets */}
      {uid ? (
        <BudgetSection
          uid={uid}
          profile={profile}
          spendByCategory={totals.byCat}
          currency={currency}
        />
      ) : null}

      {/* Category breakdown */}
      {rows && rows.length > 0 && totals.expense > 0 ? (
        <section
          aria-label="Spending by category"
          className="rounded-xl border border-border bg-neutral-900/40 p-4"
        >
          <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
            By category
          </h2>
          <ul className="mt-3 space-y-2">
            {[...totals.byCat.entries()]
              .sort(([, a], [, b]) => b - a)
              .map(([cat, minor]) => {
                const pct = (minor / totals.expense) * 100;
                return (
                  <li key={cat} className="flex items-center gap-3">
                    <span className="w-24 shrink-0 truncate text-xs text-muted">
                      {displayCategory(cat)}
                    </span>
                    <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-neutral-800/70">
                      <div
                        className="absolute inset-y-0 left-0 rounded-full bg-accent/70"
                        style={{ width: `${Math.max(4, pct)}%` }}
                      />
                    </div>
                    <span className="w-24 shrink-0 text-right text-xs tabular-nums text-neutral-200">
                      {formatMoney(minor, currency)}
                    </span>
                  </li>
                );
              })}
          </ul>
        </section>
      ) : null}

      {/* Recent entries */}
      <section aria-label="Entries">
        <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
          This month
        </h2>
        {rows === null ? (
          <div className="mt-2 space-y-2">
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
            <Skeleton className="h-12 w-full" />
          </div>
        ) : rows.length === 0 ? (
          <div className="mt-2 rounded-xl border border-dashed border-border bg-neutral-900/30 px-4 py-8 text-center">
            <Wallet aria-hidden className="mx-auto h-6 w-6 text-muted" />
            <p className="mt-2 text-sm font-medium text-neutral-100">
              No entries this month
            </p>
            <p className="mt-1 text-xs text-muted">
              Add your first expense or income above.
            </p>
          </div>
        ) : (
          <ul className="mt-2 divide-y divide-border overflow-hidden rounded-xl border border-border bg-neutral-900/40">
            {rows.map((r) => (
              <li
                key={r.id}
                className="group flex items-center gap-3 px-3 py-3 transition-colors hover:bg-neutral-800/40"
              >
                <div
                  className={
                    r.data.kind === "income"
                      ? "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-400"
                      : "flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-red-500/10 text-red-400"
                  }
                >
                  {r.data.kind === "income" ? (
                    <ArrowDownRight className="h-4 w-4" />
                  ) : (
                    <ArrowUpRight className="h-4 w-4" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-medium text-neutral-100">
                    {r.data.note || displayCategory(r.data.category)}
                  </div>
                  <div className="mt-0.5 text-xs text-muted">
                    {displayCategory(r.data.category)} · {r.data.localDate}
                  </div>
                </div>
                <span
                  className={
                    r.data.kind === "income"
                      ? "shrink-0 text-sm font-semibold text-emerald-300 tabular-nums"
                      : "shrink-0 text-sm font-semibold text-neutral-100 tabular-nums"
                  }
                >
                  {r.data.kind === "income" ? "+" : "−"}
                  {formatMoney(r.data.amountMinor, r.data.currency)}
                </span>
                <button
                  type="button"
                  onClick={() => remove(r.id)}
                  aria-label="Delete entry"
                  className="shrink-0 rounded-md p-1 text-muted opacity-0 transition-opacity hover:bg-red-500/10 hover:text-red-300 focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </section>
  );
}

function SummaryCell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string | null;
  tone: "positive" | "negative" | "neutral";
}) {
  const color =
    tone === "positive"
      ? "text-emerald-300"
      : tone === "negative"
        ? "text-red-300"
        : "text-neutral-200";
  return (
    <div className="rounded-lg border border-border bg-neutral-900/60 px-3 py-2">
      <div className="text-[10px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      {value === null ? (
        <Skeleton className="mt-1 h-5 w-20" />
      ) : (
        <div className={`mt-0.5 text-base font-semibold tabular-nums ${color}`}>
          {value}
        </div>
      )}
    </div>
  );
}
