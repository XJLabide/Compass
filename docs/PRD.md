# Personal Tracker (Compass) — Product Requirements Document

**Status:** Active Master PRD (v2.2)  
**Owner:** Xander & AI Pair Programmer  
**Last updated:** 2026-07-28  

---

## 1. Vision & Core Philosophy

**Compass** is a private, single-user Progressive Web App (PWA) designed for personal life tracking and executive self-mastery. Every screen is optimized for mobile-first speed, friction-free daily inputs, and high visual polish.

The app is opinionated, fast, and unified across 6 primary hubs:
* **Home (`/`)**: Executive dashboard with weekly volume, consistency rings, streak stats, and quick actions.
* **Today (`/today`)**: Daily focus hub split into 3 Smart Tabs (`⚡ Execution`, `🥗 Nutrition`, `📋 Daily Check-in`) with a 7-day DatePicker scrubber.
* **Nutrition (`/nutrition`)**: Dedicated macro console with portion scaling, custom food favorites, and ratio charts.
* **Workout (`/workout`)**: Active strength training logger with Upper/Lower rotation tracking and pre-filled PRs.
* **Finance (`/money`)**: Executive net worth console with live stock & ETF portfolio tracking, liquid account balances, and daily cash flow.
* **Nori AI (`/nori`)**: LLM-powered personal assistant capable of reading and writing user tracking data via tool calls.

---

## 2. Platform & Mobile-First Principles

* **Layout:** Single-column layout max-width ~420px on mobile, responsive scale-up on desktop.
* **Navigation:** Mobile bottom tab bar + Desktop expandable sidebar (6 core hubs).
* **Touch Targets:** ≥ 44×44 px with `inputmode="decimal"` on number inputs.
* **Loading & Aesthetics:** Custom branded **Spinning Compass Loader** (`CompassLoader.tsx`) featuring magnetic needle sway, glowing cyan rotation, and zero layout shift.
* **Data Conventions:**
  * Weight in **kg**, water in **ml**, protein/carbs/fat in **g**. Display layer handles unit preferences.
  * Dates anchored to `localDate` (`YYYY-MM-DD`) in the user's timezone.
  * Currency stored in minor units (cents).

---

## 3. Module Specifications

### 3.1 Today Hub (`/today`)
Consolidates daily activities into 3 Smart Focus Tabs:
1. **⚡ Execution**: Morning Habits checklist + To-dos with inline "Manage Habits" drawer modal.
2. **🥗 Nutrition**: Daily macro targets, calories, protein, carbs, fat, and fast meal logger.
3. **📋 Daily Check-in**: Bodyweight, sleep hours/quality, mood, energy, water, and notes.
* Includes a 7-day DatePicker header enabling historical inspection and backfilling.

### 3.2 Workout Module (`/workout`)
* Program rotation scheduler (Upper A, Lower A, Upper B, Lower B).
* Set-by-set logging with RPE, weight steppers, and pre-filled values from past completed sessions.
* Automatic PR detection (e1RM calculation + 🔥 badges).

### 3.3 Finance Module (`/money`)
*(Full feature specification available at [docs/PRD_FINANCE.md](file:///Users/xander/Documents/Projects/Personal%20Tracker/docs/PRD_FINANCE.md))*

Upgraded from a basic expense logger into a full Net Worth & Portfolio console:
1. **Net Worth Hero Banner**: Calculates `Liquid Cash + Live Investment Portfolio - Liabilities`.
2. **Live Stock & ETF Portfolio**:
   * Uses free `/api/finance/quote` endpoint (Yahoo Finance proxy with 5-minute memory caching).
   * Calculates holdings value (`shares × live price`) and today's P&L (`+$142.50 (+1.8%)`).
   * Interactive SVG Donut chart categorizing assets (*Equities, ETFs, Cash, Crypto*).
3. **Liquid Accounts & Balances**: Checking, Savings, and Emergency Fund cards with 1-tap balance editing.
4. **Cash Flow Logger**: Categorized daily income & expense tracking (*Food, Transport, Bills, Salary*).

### 3.4 Nori AI Assistant (`/nori`)
* Persistent chat threads with background execution.
* Tool-calling engine allowing Nori to search exercises, log meals, create habits, and inspect workout history.

---

## 4. Technical Architecture

* **Framework:** Next.js 14 (App Router, React 18, TypeScript 5.5).
* **Styling:** Tailwind CSS 3.4, Vanilla CSS keyframe animations, glassmorphism UI components.
* **Backend:** Firebase Authentication (Google + Email/Password) + Cloud Firestore.
* **Security & Auth Gate:** Allowlist enforcement in `AuthGate.tsx` and `firestore.rules`.
* **Hosting:** Vercel auto-deploy from `main` + Firebase CLI for security rules.

---

## 5. Verification & Quality Standards

* **Type Safety:** `npm run typecheck` MUST pass with 0 errors.
* **Linting:** `npm run lint` MUST pass with 0 warnings or errors.
* **Production Build:** `npm run build` MUST compile all static routes without errors.
