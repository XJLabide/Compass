"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
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
  TrendingUp,
  Trash2,
  Wallet,
  PieChart,
  DollarSign,
} from "lucide-react";
import clsx from "clsx";

import { useUserData } from "@/lib/data/UserDataProvider";
import { accountsPath, expensePath, expensesPath, portfolioPath } from "@/lib/db/paths";
import type { AccountBalanceDoc, ExpenseDoc, PortfolioHoldingDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";
import BudgetSection from "@/components/money/BudgetSection";
import RecurringFeesSection, {
  type RecurringSummary,
} from "@/components/money/RecurringFeesSection";
import { displayCategory, listExpenseCategories } from "@/lib/money/categories";
import PortfolioTab from "@/components/money/PortfolioTab";
import BalancesTab from "@/components/money/BalancesTab";

const DEFAULT_CURRENCY = "USD";
const EMPTY_RECURRING_SUMMARY: RecurringSummary = {
  monthlyCommitted: 0,
  activeCount: 0,
  dueSoonCount: 0,
};

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

type ExpenseRow = { id: string; data: ExpenseDoc };

export default function FinancePage() {
  const { uid, profile, effectiveProfile } = useUserData();
  const tz = effectiveProfile?.timezone ?? "UTC";
  const userCurrency = effectiveProfile?.currency ?? DEFAULT_CURRENCY;
  const today = useMemo(() => computeLocalDate(new Date(), tz), [tz]);
  const monthStart = useMemo(() => `${today.slice(0, 7)}-01`, [today]);

  const [activeTab, setActiveTab] = useState<"portfolio" | "balances" | "cashflow">("portfolio");

  // State for net worth aggregation
  const [liquidTotal, setLiquidTotal] = useState(0);
  const [portfolioTotal, setPortfolioTotal] = useState(0);

  // Cash flow state
  const [rows, setRows] = useState<ExpenseRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>("food");
  const [kind, setKind] = useState<"expense" | "income">("expense");
  const [note, setNote] = useState("");
  const [recurringSummary, setRecurringSummary] = useState<RecurringSummary>(EMPTY_RECURRING_SUMMARY);
  const [adding, setAdding] = useState(false);

  const categoryOptions = useMemo(() => listExpenseCategories(profile), [profile]);

  // Subscribe to liquid accounts total for Net Worth hero
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(accountsPath(uid), (snap) => {
      const total = snap.docs.reduce((acc, doc) => acc + (doc.data().balanceMinor || 0) / 100, 0);
      setLiquidTotal(total);
    });
    return unsub;
  }, [uid]);

  // Subscribe to portfolio holdings total for Net Worth hero
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(portfolioPath(uid), (snap) => {
      const tickers = Array.from(new Set(snap.docs.map((d) => d.data().ticker)));
      if (tickers.length === 0) return;

      // Fetch live stock quotes
      fetch(`/api/finance/quote?symbols=${encodeURIComponent(tickers.join(","))}`)
        .then((r) => r.json())
        .then((json) => {
          const quotes = json?.quotes || {};
          let sum = 0;
          snap.docs.forEach((d) => {
            const h = d.data() as PortfolioHoldingDoc;
            const price = quotes[h.ticker]?.price ?? h.costBasisPerShare ?? 100;
            sum += price * h.shares;
          });
          setPortfolioTotal(sum);
        })
        .catch(() => {});
    });
    return unsub;
  }, [uid]);

  // Subscribe to cash flow expenses
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
      (err) => {
        setError(err.message);
        setRows([]);
      },
    );
    return unsub;
  }, [uid, monthStart]);

  const { monthIncomeMinor, monthExpenseMinor } = useMemo(() => {
    if (!rows) return { monthIncomeMinor: 0, monthExpenseMinor: 0 };
    let inc = 0;
    let exp = 0;
    for (const r of rows) {
      if (r.data.kind === "income") inc += r.data.amountMinor;
      else exp += r.data.amountMinor;
    }
    return { monthIncomeMinor: inc, monthExpenseMinor: exp };
  }, [rows]);

  const spendByCategory = useMemo(() => {
    const map = new Map<string, number>();
    if (!rows) return map;
    for (const r of rows) {
      if (r.data.kind === "expense") {
        const cat = r.data.category || "other";
        map.set(cat, (map.get(cat) || 0) + r.data.amountMinor);
      }
    }
    return map;
  }, [rows]);

  const handleAddExpense = useCallback(
    async (e: FormEvent) => {
      e.preventDefault();
      if (!uid) return;

      const num = parseFloat(amount);
      if (!Number.isFinite(num) || num <= 0) {
        setError("Please enter a valid positive amount.");
        return;
      }
      const amountMinor = Math.round(num * 100);

      setAdding(true);
      setError(null);

      try {
        await addDoc(expensesPath(uid), {
          amountMinor,
          currency: userCurrency,
          kind,
          category: category.trim() || "other",
          localDate: today,
          date: serverTimestamp() as any,
          note: note.trim() || undefined,
          createdAt: serverTimestamp() as any,
          updatedAt: serverTimestamp() as any,
        });

        setAmount("");
        setNote("");
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add entry.");
      } finally {
        setAdding(false);
      }
    },
    [uid, amount, userCurrency, kind, category, today, note],
  );

  const handleDeleteExpense = useCallback(
    async (id: string) => {
      if (!uid) return;
      try {
        await deleteDoc(expensePath(uid, id));
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to delete entry.");
      }
    },
    [uid],
  );

  if (!uid) return null;

  const totalNetWorth = liquidTotal + portfolioTotal;

  return (
    <section className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col gap-1 border-b border-border pb-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold tracking-tight text-neutral-100">Finance</h1>
          <span className="rounded-full bg-emerald-500/10 border border-emerald-500/30 px-3 py-1 text-xs font-semibold text-emerald-400">
            Live Market Data
          </span>
        </div>
        <p className="text-xs text-muted">
          Net worth, stock & ETF portfolio tracking, liquid balances, and cash flow.
        </p>
      </div>

      {/* Net Worth Hero Overview Banner */}
      <div className="relative overflow-hidden rounded-2xl border border-border bg-gradient-to-br from-neutral-900 via-neutral-900/90 to-neutral-950 p-6 shadow-xl">
        <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-muted">
              Total Net Worth
            </span>
            <h2 className="mt-1 text-4xl font-extrabold tracking-tight text-neutral-100">
              ${totalNetWorth.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>

          <div className="flex flex-wrap gap-4 border-t border-border/50 pt-3 sm:border-t-0 sm:pt-0">
            <div className="rounded-xl border border-cyan-500/20 bg-cyan-500/5 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-cyan-400">
                Liquid Cash
              </span>
              <p className="text-base font-bold text-neutral-100">
                ${liquidTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-xl border border-purple-500/20 bg-purple-500/5 px-4 py-2">
              <span className="text-[10px] font-semibold uppercase tracking-wider text-purple-400">
                Invested Assets
              </span>
              <p className="text-base font-bold text-neutral-100">
                ${portfolioTotal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 3 Smart Sub-Tabs */}
      <div className="flex border-b border-border/60">
        <button
          onClick={() => setActiveTab("portfolio")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition",
            activeTab === "portfolio"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <TrendingUp className="h-4 w-4" />
          📈 Portfolio & Stocks
        </button>
        <button
          onClick={() => setActiveTab("balances")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition",
            activeTab === "balances"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <Wallet className="h-4 w-4" />
          💵 Balances & Accounts
        </button>
        <button
          onClick={() => setActiveTab("cashflow")}
          className={clsx(
            "flex items-center gap-2 border-b-2 px-4 py-2.5 text-xs font-semibold transition",
            activeTab === "cashflow"
              ? "border-accent text-accent"
              : "border-transparent text-muted hover:text-neutral-200",
          )}
        >
          <DollarSign className="h-4 w-4" />
          💸 Cash Flow (Daily Log)
        </button>
      </div>

      {/* Active Tab Views */}
      {activeTab === "portfolio" && <PortfolioTab uid={uid} />}

      {activeTab === "balances" && <BalancesTab uid={uid} userCurrency={userCurrency} />}

      {activeTab === "cashflow" && (
        <div className="space-y-6">
          {/* Monthly Cash Flow Summaries */}
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-emerald-500/30 bg-emerald-500/10 text-emerald-400">
                <ArrowDownRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Income (This Month)</span>
                <p className="text-xl font-bold text-emerald-400">
                  {formatMoney(monthIncomeMinor, userCurrency)}
                </p>
              </div>
            </div>

            <div className="rounded-xl border border-border bg-neutral-900/40 p-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-rose-500/30 bg-rose-500/10 text-rose-400">
                <ArrowUpRight className="h-5 w-5" />
              </div>
              <div>
                <span className="text-xs text-muted">Expenses (This Month)</span>
                <p className="text-xl font-bold text-rose-400">
                  {formatMoney(monthExpenseMinor, userCurrency)}
                </p>
              </div>
            </div>
          </div>

          {/* Quick Expense/Income Entry Form */}
          <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
            <h3 className="text-sm font-semibold text-neutral-100">Log Cash Flow Entry</h3>

            {error && (
              <div className="rounded-lg border border-red-500/30 bg-red-500/10 p-3 text-xs text-red-300">
                {error}
              </div>
            )}

            <form onSubmit={handleAddExpense} className="grid grid-cols-1 gap-3 sm:grid-cols-4">
              <div>
                <label className="text-xs text-muted">Type</label>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as "expense" | "income")}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  <option value="expense">Expense</option>
                  <option value="income">Income</option>
                </select>
              </div>

              <div>
                <label className="text-xs text-muted">Amount ($)</label>
                <input
                  type="number"
                  step="any"
                  required
                  placeholder="0.00"
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs text-muted">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-xs text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                >
                  {categoryOptions.map((cat) => (
                    <option key={cat.id} value={cat.id}>
                      {cat.label}
                    </option>
                  ))}
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="submit"
                  disabled={adding}
                  className="w-full rounded-lg bg-accent py-2 text-xs font-semibold text-accent-foreground transition hover:opacity-90"
                >
                  {adding ? "Saving..." : "Log Entry"}
                </button>
              </div>
            </form>
          </div>

          {/* Transactions History */}
          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-neutral-200">Recent Transactions</h3>

            {!rows ? (
              <Skeleton className="h-24 w-full" />
            ) : rows.length === 0 ? (
              <div className="rounded-xl border border-border/50 p-6 text-center text-xs text-muted">
                No entries logged this month yet.
              </div>
            ) : (
              <div className="space-y-2">
                {rows.map((r) => {
                  const isInc = r.data.kind === "income";
                  return (
                    <div
                      key={r.id}
                      className="flex items-center justify-between rounded-xl border border-border/60 bg-neutral-900/30 p-3.5"
                    >
                      <div className="flex items-center gap-3">
                        <div
                          className={`flex h-8 w-8 items-center justify-center rounded-lg ${
                            isInc
                              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                              : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
                          }`}
                        >
                          {isInc ? (
                            <ArrowDownRight className="h-4 w-4" />
                          ) : (
                            <ArrowUpRight className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <span className="font-semibold text-sm text-neutral-100">
                            {displayCategory(r.data.category)}
                          </span>
                          <p className="text-xs text-muted">{r.data.localDate}</p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4">
                        <span
                          className={`font-semibold text-sm ${
                            isInc ? "text-emerald-400" : "text-neutral-100"
                          }`}
                        >
                          {isInc ? "+" : "-"}
                          {formatMoney(r.data.amountMinor, userCurrency)}
                        </span>
                        <button
                          onClick={() => handleDeleteExpense(r.id)}
                          className="text-muted hover:text-rose-400 transition"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <BudgetSection
            uid={uid}
            profile={profile}
            spendByCategory={spendByCategory}
            currency={userCurrency}
            recurringCommitted={recurringSummary.monthlyCommitted}
            totalSpent={monthExpenseMinor}
          />
          <RecurringFeesSection
            uid={uid}
            profile={profile}
            currency={userCurrency}
            today={today}
            onSummaryChange={setRecurringSummary}
          />
        </div>
      )}
    </section>
  );
}
