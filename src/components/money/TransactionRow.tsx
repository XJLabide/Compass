import { ArrowDownRight, ArrowUpRight, Pencil, Trash2 } from "lucide-react";

import type { ExpenseDoc } from "@/lib/db/types";
import { displayCategory } from "@/lib/money/categories";
import { formatCurrencyAmount } from "@/lib/money/currency";

export type TransactionRowData = { id: string; data: ExpenseDoc };

interface TransactionRowProps {
  row: TransactionRowData;
  fallbackCurrency: string;
  hideAmounts: boolean;
  onEdit?: (row: TransactionRowData) => void;
  onDelete?: (row: TransactionRowData) => void;
}

export default function TransactionRow({
  row,
  fallbackCurrency,
  hideAmounts,
  onEdit,
  onDelete,
}: TransactionRowProps) {
  const isIncome = row.data.kind === "income";

  return (
    <div className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-neutral-900/30 p-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <div
          aria-hidden="true"
          className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
            isIncome
              ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
              : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
          }`}
        >
          {isIncome ? <ArrowDownRight className="h-4 w-4" /> : <ArrowUpRight className="h-4 w-4" />}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-neutral-100">
            {displayCategory(row.data.category)}
          </p>
          <p className="text-xs text-muted">{row.data.localDate}</p>
          {row.data.note ? (
            <p className="break-words text-xs text-neutral-300">{row.data.note}</p>
          ) : null}
        </div>
      </div>

      <div className="flex shrink-0 items-center gap-2 sm:gap-4">
        <span
          className={`text-right text-sm font-semibold ${
            isIncome ? "text-emerald-400" : "text-neutral-100"
          }`}
        >
          {isIncome ? "+" : "-"}
          {formatCurrencyAmount(
            row.data.amountMinor / 100,
            row.data.currency || fallbackCurrency,
            2,
            hideAmounts,
          )}
        </span>
        {onEdit ? (
          <button
            type="button"
            onClick={() => onEdit(row)}
            className="text-muted transition hover:text-accent"
            title="Edit transaction"
            aria-label={`Edit ${displayCategory(row.data.category)} transaction`}
          >
            <Pencil aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
        {onDelete ? (
          <button
            type="button"
            onClick={() => onDelete(row)}
            className="text-muted transition hover:text-rose-400"
            title="Delete transaction"
            aria-label={`Delete ${displayCategory(row.data.category)} transaction`}
          >
            <Trash2 aria-hidden="true" className="h-4 w-4" />
          </button>
        ) : null}
      </div>
    </div>
  );
}
