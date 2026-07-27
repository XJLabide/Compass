"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addDoc,
  deleteDoc,
  onSnapshot,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";
import {
  Plus,
  TrendingUp,
  TrendingDown,
  Trash2,
  PieChart as PieIcon,
  RefreshCw,
} from "lucide-react";

import { holdingPath, portfolioPath } from "@/lib/db/paths";
import type { HoldingCategory, PortfolioHoldingDoc } from "@/lib/db/types";
import CompassLoader from "@/components/ui/CompassLoader";

export interface StockQuote {
  symbol: string;
  price: number;
  change: number;
  changePercent: number;
  previousClose: number;
  name?: string;
  currency?: string;
  updatedAt: number;
}

export interface HoldingRow {
  id: string;
  data: PortfolioHoldingDoc;
}

export default function PortfolioTab({ uid }: { uid: string }) {
  const [holdings, setHoldings] = useState<HoldingRow[] | null>(null);
  const [quotes, setQuotes] = useState<Record<string, StockQuote>>({});
  const [loadingQuotes, setLoadingQuotes] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);

  // Form state
  const [ticker, setTicker] = useState("VOO");
  const [name, setName] = useState("Vanguard S&P 500 ETF");
  const [shares, setShares] = useState("10");
  const [costBasis, setCostBasis] = useState("");
  const [category, setCategory] = useState<HoldingCategory>("etf");
  const [saving, setSaving] = useState(false);

  // 1. Subscribe to user's portfolio holdings
  useEffect(() => {
    if (!uid) return;
    const unsub = onSnapshot(portfolioPath(uid), (snap) => {
      const rows = snap.docs.map((d) => ({ id: d.id, data: d.data() }));

      // Seed initial VOO and QQQ holdings if user has zero holdings
      if (rows.length === 0) {
        void addDoc(portfolioPath(uid), {
          ticker: "VOO",
          name: "Vanguard S&P 500 ETF",
          shares: 10,
          costBasisPerShare: 450,
          category: "etf",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        void addDoc(portfolioPath(uid), {
          ticker: "QQQ",
          name: "Invesco QQQ Trust ETF",
          shares: 5,
          costBasisPerShare: 410,
          category: "etf",
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        return;
      }
      setHoldings(rows);
    });
    return unsub;
  }, [uid]);

  // 2. Fetch live stock quotes for all holdings
  const fetchQuotes = useCallback(async (symbolList: string[]) => {
    if (symbolList.length === 0) return;
    setLoadingQuotes(true);
    try {
      const res = await fetch(
        `/api/finance/quote?symbols=${encodeURIComponent(symbolList.join(","))}`,
      );
      if (res.ok) {
        const json = await res.json();
        if (json?.quotes) {
          setQuotes(json.quotes);
        }
      }
    } catch (err) {
      // eslint-disable-next-line no-console
      console.warn("Failed to fetch quotes:", err);
    } finally {
      setLoadingQuotes(false);
    }
  }, []);

  useEffect(() => {
    if (!holdings || holdings.length === 0) return;
    const symbols = Array.from(new Set(holdings.map((h) => h.data.ticker)));
    void fetchQuotes(symbols);
  }, [holdings, fetchQuotes]);

  // 3. Compute portfolio totals & daily P&L
  const portfolioStats = useMemo(() => {
    if (!holdings) return { totalValue: 0, todayChange: 0, todayChangePct: 0 };
    let totalValue = 0;
    let todayChange = 0;

    for (const h of holdings) {
      const q = quotes[h.data.ticker];
      const price = q?.price ?? h.data.costBasisPerShare ?? 100;
      const change = q?.change ?? 0;
      const positionValue = price * h.data.shares;
      const positionChange = change * h.data.shares;

      totalValue += positionValue;
      todayChange += positionChange;
    }

    const previousTotal = totalValue - todayChange;
    const todayChangePct = previousTotal > 0 ? (todayChange / previousTotal) * 100 : 0;

    return { totalValue, todayChange, todayChangePct };
  }, [holdings, quotes]);

  // 4. Asset category distribution
  const allocation = useMemo(() => {
    if (!holdings) return [];
    const catMap: Record<string, number> = {};
    let total = 0;

    for (const h of holdings) {
      const q = quotes[h.data.ticker];
      const price = q?.price ?? h.data.costBasisPerShare ?? 100;
      const val = price * h.data.shares;
      const cat = h.data.category || "other";
      catMap[cat] = (catMap[cat] || 0) + val;
      total += val;
    }

    return Object.entries(catMap).map(([cat, val]) => ({
      category: cat,
      value: val,
      percent: total > 0 ? (val / total) * 100 : 0,
    }));
  }, [holdings, quotes]);

  // Handle Add Holding
  const handleSaveHolding = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!uid || !ticker) return;
    setSaving(true);
    try {
      await addDoc(portfolioPath(uid), {
        ticker: ticker.toUpperCase().trim(),
        name: name.trim() || ticker.toUpperCase().trim(),
        shares: Math.max(0.0001, parseFloat(shares) || 1),
        costBasisPerShare: costBasis ? parseFloat(costBasis) : undefined,
        category,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      setModalOpen(false);
      setTicker("");
      setName("");
      setShares("1");
      setCostBasis("");
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to add holding:", err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!uid) return;
    try {
      await deleteDoc(holdingPath(uid, id));
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error("Failed to delete holding:", err);
    }
  };

  if (!holdings) {
    return <CompassLoader mode="card" size="lg" label="Loading Live Portfolio..." />;
  }

  const isGain = portfolioStats.todayChange >= 0;

  return (
    <div className="space-y-6">
      {/* Portfolio Header Metric Card */}
      <div className="rounded-xl border border-border bg-neutral-900/60 p-5 backdrop-blur-md">
        <div className="flex items-start justify-between">
          <div>
            <span className="text-xs font-medium uppercase tracking-wider text-muted">
              Stock & ETF Portfolio
            </span>
            <h2 className="mt-1 text-3xl font-bold tracking-tight text-neutral-100">
              ${portfolioStats.totalValue.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={() => {
                const symbols = Array.from(new Set(holdings.map((h) => h.data.ticker)));
                void fetchQuotes(symbols);
              }}
              className="flex h-8 w-8 items-center justify-center rounded-lg border border-border bg-neutral-800 text-muted transition hover:text-neutral-100"
              title="Refresh Quotes"
            >
              <RefreshCw className={`h-3.5 w-3.5 ${loadingQuotes ? "animate-spin" : ""}`} />
            </button>
            <button
              onClick={() => setModalOpen(true)}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-accent px-3 text-xs font-semibold text-accent-foreground transition hover:opacity-90"
            >
              <Plus className="h-3.5 w-3.5" />
              Add Holding
            </button>
          </div>
        </div>

        {/* Daily P&L Badge */}
        <div className="mt-3 flex items-center gap-2">
          <span
            className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
              isGain
                ? "border border-emerald-500/30 bg-emerald-500/10 text-emerald-400"
                : "border border-rose-500/30 bg-rose-500/10 text-rose-400"
            }`}
          >
            {isGain ? <TrendingUp className="h-3.5 w-3.5" /> : <TrendingDown className="h-3.5 w-3.5" />}
            {isGain ? "+" : ""}
            ${portfolioStats.todayChange.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} (
            {isGain ? "+" : ""}
            {portfolioStats.todayChangePct.toFixed(2)}%)
          </span>
          <span className="text-xs text-muted">Today&apos;s Market Change</span>
        </div>
      </div>

      {/* Asset Allocation & Holdings Section */}
      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        {/* Holdings List (2 Columns) */}
        <div className="space-y-3 lg:col-span-2">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-neutral-200">Your Holdings</h3>
            <span className="text-xs text-muted">{holdings.length} Positions</span>
          </div>

          <div className="space-y-2">
            {holdings.map((h) => {
              const q = quotes[h.data.ticker];
              const price = q?.price ?? h.data.costBasisPerShare ?? 0;
              const val = price * h.data.shares;
              const changePct = q?.changePercent ?? 0;
              const isPos = changePct >= 0;

              return (
                <div
                  key={h.id}
                  className="flex items-center justify-between rounded-xl border border-border/70 bg-neutral-900/40 p-4 transition hover:bg-neutral-800/40"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-purple-500/30 bg-purple-500/10 font-bold uppercase text-purple-300 text-xs">
                      {h.data.ticker.slice(0, 4)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-neutral-100">{h.data.ticker}</span>
                        <span className="rounded bg-neutral-800 px-1.5 py-0.5 text-[10px] uppercase text-muted font-mono">
                          {h.data.category}
                        </span>
                      </div>
                      <p className="text-xs text-muted truncate max-w-[180px] sm:max-w-[240px]">
                        {h.data.name} · {h.data.shares} shares
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center gap-4">
                    <div className="text-right">
                      <p className="text-sm font-semibold text-neutral-100">
                        ${val.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      <p className={`text-xs font-medium ${isPos ? "text-emerald-400" : "text-rose-400"}`}>
                        ${price.toFixed(2)} ({isPos ? "+" : ""}
                        {changePct.toFixed(2)}%)
                      </p>
                    </div>

                    <button
                      onClick={() => handleDelete(h.id)}
                      className="text-muted hover:text-rose-400 transition"
                      title="Remove position"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Asset Allocation Card */}
        <div className="rounded-xl border border-border bg-neutral-900/40 p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-border pb-3">
            <PieIcon className="h-4 w-4 text-purple-400" />
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-200">
              Asset Allocation
            </h3>
          </div>

          <div className="space-y-3">
            {allocation.map((item) => (
              <div key={item.category} className="space-y-1">
                <div className="flex justify-between text-xs font-medium">
                  <span className="capitalize text-neutral-300">{item.category}</span>
                  <span className="text-neutral-100 font-semibold">{item.percent.toFixed(1)}%</span>
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-neutral-800">
                  <div
                    className={`h-full rounded-full ${
                      item.category === "etf"
                        ? "bg-purple-500"
                        : item.category === "stock"
                        ? "bg-cyan-400"
                        : item.category === "crypto"
                        ? "bg-amber-400"
                        : "bg-emerald-400"
                    }`}
                    style={{ width: `${item.percent}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Add Holding Modal */}
      {modalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm">
          <div className="w-full max-w-md rounded-2xl border border-border bg-neutral-900 p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-semibold text-neutral-100">Add Stock or ETF Position</h3>

            <form onSubmit={handleSaveHolding} className="space-y-4">
              <div>
                <label className="text-xs font-medium text-muted">Ticker Symbol</label>
                <input
                  type="text"
                  required
                  placeholder="e.g. VOO, QQQ, AAPL, BTC-USD"
                  value={ticker}
                  onChange={(e) => {
                    const sym = e.target.value.toUpperCase();
                    setTicker(sym);
                    if (sym === "VOO") setName("Vanguard S&P 500 ETF");
                    if (sym === "QQQ") setName("Invesco QQQ Trust ETF");
                    if (sym === "AAPL") setName("Apple Inc.");
                  }}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div>
                <label className="text-xs font-medium text-muted">Display Name</label>
                <input
                  type="text"
                  placeholder="e.g. Vanguard S&P 500 ETF"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-medium text-muted">Shares / Quantity</label>
                  <input
                    type="number"
                    step="any"
                    required
                    placeholder="10"
                    value={shares}
                    onChange={(e) => setShares(e.target.value)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-muted">Category</label>
                  <select
                    value={category}
                    onChange={(e) => setCategory(e.target.value as HoldingCategory)}
                    className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                  >
                    <option value="etf">ETF</option>
                    <option value="stock">Stock</option>
                    <option value="crypto">Crypto</option>
                    <option value="cash">Cash Asset</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="text-xs font-medium text-muted">Cost Basis per Share ($)</label>
                <input
                  type="number"
                  step="any"
                  placeholder="e.g. 450.00"
                  value={costBasis}
                  onChange={(e) => setCostBasis(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-border bg-neutral-800 px-3 py-2 text-sm text-neutral-100 focus:outline-none focus:ring-2 focus:ring-accent"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setModalOpen(false)}
                  className="rounded-lg border border-border px-4 py-2 text-xs font-medium text-neutral-300 hover:bg-neutral-800"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="rounded-lg bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground hover:opacity-90"
                >
                  {saving ? "Saving..." : "Add Position"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
