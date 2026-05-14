"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { onSnapshot, orderBy, query, where } from "firebase/firestore";
import { ArrowRight, Wallet } from "lucide-react";

import { useUserData } from "@/lib/data/UserDataProvider";
import { expensesPath } from "@/lib/db/paths";
import type { ExpenseDoc } from "@/lib/db/types";
import { computeLocalDate } from "@/lib/workout/scheduling";
import Skeleton from "@/components/ui/Skeleton";

export interface MoneySummaryProps {
  uid: string;
  timezone: string;
}

const DEFAULT_CURRENCY = "USD";

function formatMoney(minor: number, currency: string): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(minor / 100);
  } catch {
    return `${(minor / 100).toFixed(0)} ${currency}`;
  }
}

/**
 * Month-to-date money snapshot: income / expense / net + a sparkline of daily
 * net deltas across the month. Tap-through to /money.
 */
export default function MoneySummary({ uid, timezone }: MoneySummaryProps) {
  const { profile } = useUserData();
  const [rows, setRows] = useState<ExpenseDoc[] | null>(null);

  const today = useMemo(
    () => computeLocalDate(new Date(), timezone || "UTC"),
    [timezone],
  );
  const monthStart = useMemo(() => `${today.slice(0, 7)}-01`, [today]);

  useEffect(() => {
    if (!uid) return;
    const q = query(
      expensesPath(uid),
      where("localDate", ">=", monthStart),
      orderBy("localDate", "asc"),
    );
    const unsub = onSnapshot(
      q,
      (snap) => setRows(snap.docs.map((d) => d.data())),
      () => setRows([]),
    );
    return () => unsub();
  }, [uid, monthStart]);

  const { income, expense, currency, byCat } = useMemo(() => {
    let inc = 0;
    let exp = 0;
    let cur = profile?.currency ?? DEFAULT_CURRENCY;
    const cats = new Map<string, number>();
    for (const r of rows ?? []) {
      cur = r.currency || cur;
      if (r.kind === "income") {
        inc += r.amountMinor;
      } else {
        exp += r.amountMinor;
        cats.set(r.category, (cats.get(r.category) ?? 0) + r.amountMinor);
      }
    }
    return { income: inc, expense: exp, currency: cur, byCat: cats };
  }, [rows, profile?.currency]);

  const net = income - expense;

  // Budget warning: any category whose spend is >= 80% of its budget.
  const budgetWarning = useMemo<
    { category: string; pct: number; tone: "warn" | "over" } | null
  >(() => {
    const budgets = profile?.budgets ?? {};
    let worst: { category: string; pct: number } | null = null;
    for (const [cat, budget] of Object.entries(budgets)) {
      if (!budget || budget <= 0) continue;
      const spent = byCat.get(cat) ?? 0;
      const pct = (spent / budget) * 100;
      if (pct >= 80 && (!worst || pct > worst.pct)) {
        worst = { category: cat, pct };
      }
    }
    if (!worst) return null;
    return {
      ...worst,
      tone: worst.pct > 100 ? "over" : "warn",
    };
  }, [profile?.budgets, byCat]);

  const monthLabel = useMemo(() => {
    try {
      return new Intl.DateTimeFormat("en-US", {
        timeZone: timezone || "UTC",
        month: "short",
      }).format(new Date());
    } catch {
      return today.slice(5, 7);
    }
  }, [timezone, today]);

  if (rows === null) {
    return (
      <section className="rounded-xl border border-border bg-neutral-900/40 p-4">
        <div className="flex items-baseline justify-between">
          <div className="flex items-center gap-2">
            <Wallet aria-hidden className="h-4 w-4 text-accent" />
            <h2 className="text-xs font-medium uppercase tracking-wide text-muted">
              Money · {monthLabel}
            </h2>
          </div>
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2">
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
          <Skeleton className="h-12" />
        </div>
      </section>
    );
  }

  const empty = rows.length === 0;

  return (
    <section
      aria-labelledby="money-summary-heading"
      className="rounded-xl border border-border bg-neutral-900/40 p-4"
    >
      <div className="flex items-baseline justify-between">
        <div className="flex items-center gap-2">
          <Wallet aria-hidden className="h-4 w-4 text-accent" />
          <h2
            id="money-summary-heading"
            className="text-xs font-medium uppercase tracking-wide text-muted"
          >
            Money · {monthLabel}
          </h2>
        </div>
        <Link
          href="/money"
          className="inline-flex items-center gap-1 text-xs font-medium text-accent hover:underline"
        >
          Open <ArrowRight className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3 grid grid-cols-3 gap-2">
        <Cell label="In" value={formatMoney(income, currency)} tone="positive" />
        <Cell label="Out" value={formatMoney(expense, currency)} tone="negative" />
        <Cell
          label="Net"
          value={formatMoney(net, currency)}
          tone={net >= 0 ? "positive" : "negative"}
        />
      </div>

      {budgetWarning ? (
        <div
          className={
            budgetWarning.tone === "over"
              ? "mt-3 flex items-center gap-2 rounded-md border border-red-500/40 bg-red-500/10 px-2.5 py-1.5 text-[11px] text-red-300"
              : "mt-3 flex items-center gap-2 rounded-md border border-amber-400/40 bg-amber-400/10 px-2.5 py-1.5 text-[11px] text-amber-200"
          }
        >
          <span className="font-semibold uppercase tracking-wide">
            {budgetWarning.tone === "over" ? "Over budget" : "Near budget"}
          </span>
          <span className="capitalize">
            · {budgetWarning.category} ({Math.round(budgetWarning.pct)}%)
          </span>
        </div>
      ) : null}

      {empty ? (
        <p className="mt-3 text-[11px] text-muted">
          Add an expense or income to start tracking.
        </p>
      ) : null}
    </section>
  );
}

function Cell({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: "positive" | "negative";
}) {
  const color =
    tone === "positive" ? "text-emerald-300" : "text-red-300";
  return (
    <div className="rounded-md border border-border bg-neutral-900/60 px-2.5 py-1.5">
      <div className="text-[9px] font-medium uppercase tracking-wide text-muted">
        {label}
      </div>
      <div className={`mt-0.5 text-sm font-semibold tabular-nums ${color}`}>
        {value}
      </div>
    </div>
  );
}
