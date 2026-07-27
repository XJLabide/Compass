# PRD: Finance Module — Net Worth, Live Stock Portfolio & Cash Flow

**Document Status:** Approved & Active  
**Target Version:** Compass v2.2  
**Owner:** Xander & AI Pair Programmer  
**Last Updated:** 2026-07-28  

---

## 1. Executive Summary

Compass currently features a basic **Money** section that logs daily micro-expenses and income. While functional, it lacks a high-level picture of overall financial health, net worth, and wealth building.

This PRD defines the transformation of the Money section into **Finance** (`/money`), an executive-level financial management hub that tracks:
1. **Total Net Worth** (Liquid Cash + Investment Assets - Liabilities)
2. **Live Stock & ETF Portfolio** with free real-time market price updates (`/api/finance/quote`)
3. **Liquid Account Balances** (Checking, Savings, Emergency Funds)
4. **Daily Cash Flow** (Categorized Income & Expenses)

---

## 2. Goals & Key Performance Metrics

| # | Goal | Target UX / Metric |
|---|------|-------------------|
| **G1** | **Holistic Net Worth Tracking** | Single hero banner displaying Net Worth, monthly trend delta, and liquid runway. |
| **G2** | **Free Live Stock & ETF Quotes** | Zero-cost live market prices for stocks (`AAPL`, `MSFT`), ETFs (`VOO`, `QQQ`), and Crypto (`BTC-USD`) via free APIs. |
| **G3** | **Interactive Asset Allocation** | Animated Donut chart visualizing wealth distribution across Equities, Cash, ETFs, and Crypto. |
| **G4** | **Seamless Cash Flow Logging** | Retain 100% of existing income/expense capturing without breaking historical records. |

---

## 3. UI & UX Specifications

### 3.1 Design System & Aesthetics
* **Theme**: Deep dark mode (`#0a0a0b` background) with high-contrast glassmorphism containers (`bg-neutral-900/40 border-border`).
* **Color System**:
  * 🟢 **Emerald (`#34d399`)**: Gains, Positive P&L, Income.
  * 🔴 **Rose (`#f43f5e`)**: Losses, Negative P&L, Expenses.
  * 🔵 **Cyan (`#22d3ee`)**: Liquid Cash & Checking Accounts.
  * 🟣 **Purple (`#c084fc`)**: Equities, Stocks & ETFs.

### 3.2 Page Layout Structure (`/money`)

```
Finance Hub (/money)
 ├── 1. Net Worth Hero Card
 │    ├── Total Net Worth ($42,850.00)
 │    ├── Today's Portfolio Change (+$184.20 / +0.4%)
 │    └── Liquid Cash vs Invested Assets Breakdown
 │
 ├── 2. Sub-Tab Switcher
 │    ├── 📈 [Portfolio & Investments]
 │    ├── 💵 [Accounts & Balances]
 │    └── 💸 [Cash Flow & Transactions]
 │
 └── 3. Active Tab View
      ├── Tab A: Portfolio & Holdings List + Asset Donut Chart
      ├── Tab B: Checking/Savings Account Cards + Quick Balance Update
      └── Tab C: Income/Expense Logger + Categorized Transaction History
```

---

## 4. Sub-Tab Detailed UX Breakdown

### 4.1 Tab A: Portfolio & Investments (Live Stock Tracking)
* **Holdings Table / Cards**:
  * Displays Ticker Symbol (*e.g. VOO, AAPL, TSLA, BTC-USD*), Share Count, Live Market Price per Share, Total Position Value, and Today's P&L (`+$142.50 (+1.8%)`).
* **Add / Edit Holding Modal**:
  * Input Ticker Symbol (auto-searches live market tickers).
  * Input Shares / Units held.
  * Optional Average Cost Basis.
* **Asset Allocation Donut**:
  * Interactive SVG Donut chart categorizing holdings into *US Equities*, *Global ETFs*, *Cash*, and *Crypto*.

### 4.2 Tab B: Accounts & Balances (Liquid Cash)
* **Account Cards**:
  * Checking Account (*Operating funds*)
  * High-Yield Savings / Emergency Fund
  * Credit Card / Debt Balances
* **1-Tap Quick Update**:
  * Tap any account to update its balance in 5 seconds.

### 4.3 Tab C: Cash Flow & Transactions (Existing Money Logger)
* **Summary Cards**: Today's Income, Today's Expense, Monthly Net Balance.
* **Transaction Logger**: Fast input for Amount, Category (*Food, Transport, Bills, Salary, Shopping*), and Note.
* **History List**: Grouped by date with 1-tap delete/edit.

---

## 5. Technical Architecture & Free Market Data API

### 5.1 Free Live Market Quote API (`/api/finance/quote`)
* **Endpoint**: `GET /api/finance/quote?symbols=VOO,AAPL,BTC-USD`
* **Data Sources**:
  * Yahoo Finance API proxy (free, no API key required).
  * Finnhub.io free tier (60 requests/minute) as secondary fallback.
* **Performance Caching**:
  * Serverless route caches market quotes in-memory for 5 minutes (`stale-while-revalidate`) to ensure sub-100ms response times and zero API rate limit errors.

### 5.2 Firestore Data Schema

#### `users/{uid}/portfolio/{holdingId}`
```typescript
export interface PortfolioHoldingDoc {
  ticker: string;              // e.g. "VOO", "AAPL", "BTC-USD"
  name: string;                // e.g. "Vanguard S&P 500 ETF"
  shares: number;              // e.g. 15.5
  costBasisPerShare?: number;  // e.g. 420.50
  category: "stock" | "etf" | "crypto" | "other";
  updatedAt: Timestamp;
}
```

#### `users/{uid}/accounts/{accountId}`
```typescript
export interface AccountBalanceDoc {
  name: string;                // e.g. "Primary Checking"
  type: "checking" | "savings" | "credit" | "cash";
  balanceMinor: number;        // Stored in minor units (cents)
  currency: string;            // e.g. "USD"
  updatedAt: Timestamp;
}
```

#### `users/{uid}/expenses/{expenseId}`
* Existing `ExpenseDoc` schema remains 100% unchanged for backward compatibility.

---

## 6. Verification & Test Plan

1. **API Reliability Test**: Verify `/api/finance/quote?symbols=AAPL,VOO` returns valid prices, change metrics, and fallback data.
2. **Type Safety**: Run `npm run typecheck` to verify zero TypeScript errors across new finance types.
3. **Lint & Build**: Run `npm run lint` and `npm run build` to confirm clean production compilation.
