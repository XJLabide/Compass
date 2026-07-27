# DirectoryData — Personal Tracker (Compass)

> **Analysis Date:** 2026-07-28  
> **Analyzed by:** Antigravity AI Assistant  
> **Project Root:** `/Users/xander/Documents/Projects/Personal Tracker`

---

## 1. Project Overview

**Compass** is a private, single-user Progressive Web App (PWA) designed for personal tracking and executive self-mastery. It runs mobile-first and is installable as a home-screen app on iOS and Android.

| Field | Value |
|---|---|
| **Internal Name** | `compass` |
| **Version** | `0.1.0` (private) |
| **Framework** | Next.js 14 (App Router, React 18) |
| **Language** | TypeScript 5.5 |
| **Styling** | Tailwind CSS 3.4 + Custom CSS keyframe animations |
| **Backend / Database** | Firebase (Auth + Firestore) |
| **Hosting** | Vercel (auto-deploy from `main`) |
| **Node Requirement** | Node 18+ / npm 9+ |

---

## 2. Navigation & Application Architecture (6 Core Hubs)

Compass features a streamlined 6-hub navigation structure accessible via the mobile bottom tab bar and desktop sidebar:

1. 🏠 **Home (`/`)**: Executive dashboard with weekly volume, consistency rings, streak stats, and quick actions.
2. ⚡ **Today (`/today`)**: Daily focus hub split into 3 Smart Tabs (`⚡ Execution`, `🥗 Nutrition`, `📋 Daily Check-in`) with DatePicker scrubbing.
3. 🥗 **Nutrition (`/nutrition`)**: Dedicated macro console with portion scaling, custom food favorites, and ratio charts.
4. 🏋️ **Workout (`/workout`)**: Active strength training logger with Upper/Lower rotation tracking and pre-filled PRs.
5. 💳 **Finance (`/money`)**: Executive net worth console with live stock & ETF portfolio tracking (`/api/finance/quote`), liquid account balances, and daily cash flow.
6. 🤖 **Nori AI (`/nori`)**: LLM-powered personal assistant capable of reading and writing user tracking data via tool calls.

*Note: `/check-in` and `/history` automatically redirect to `/today` for a consolidated UX.*

---

## 3. Top-Level Directory Tree

```
Personal Tracker/
├── .env.local               # Local env vars (Firebase config, allowed emails)
├── .env.local.example       # Template for .env.local
├── docs/                    # Project documentation
│   ├── DEPLOYMENT.md        # Vercel & Firebase deployment guide
│   ├── DirectoryData.md     # Project information & architecture (THIS file)
│   ├── FIRESTORE_RULES.md   # Firestore security rules reference
│   └── PRD.md               # Master Product Requirements Document
├── firebase.json            # Firebase hosting + Firestore config
├── firestore.rules          # Firestore security rules (source of truth)
├── package.json             # Project manifest + scripts
├── public/                  # Static assets (icons, logos, SVGs)
├── src/                     # Application source code
└── tests/                   # All tests (E2E + rules unit tests)
```

---

## 4. Source Code (`src/`)

### 4.1 `src/app/` — Next.js App Router

```
src/app/
├── (app)/              # Authenticated app shell group
│   ├── layout.tsx      # Auth-gated shell layout (sidebar/bottom tab)
│   ├── page.tsx        # Executive Home Dashboard
│   ├── check-in/       # Redirects to /today?tab=checkin
│   ├── exercise/       # Exercise library browser
│   ├── history/        # Redirects to /today
│   ├── money/          # Finance Hub (Net worth, stocks, cash flow)
│   ├── nori/           # Nori AI chat console
│   ├── nutrition/      # Nutrition & diet logger page
│   ├── settings/       # User profile & unit settings
│   ├── today/          # Today Hub (Execution, Nutrition, Check-in tabs)
│   ├── todos/          # To-do list manager
│   └── workout/        # Workout logger & program view
├── api/
│   ├── exercises/      # Exercise search endpoints
│   ├── finance/        # Free stock market quote proxy (/api/finance/quote)
│   └── nori/           # Nori AI streaming endpoint
├── login/              # Sign-in page
├── not-authorized/     # Allowed-email block screen
├── layout.tsx          # Root layout with AuthProvider
└── globals.css         # Custom animations & Tailwind base styles
```

### 4.2 `src/components/` — Shared React Components

```
src/components/
├── BottomTabBar.tsx         # Mobile 6-hub navigation bar
├── Sidebar.tsx              # Desktop 6-hub navigation sidebar
├── auth/
│   └── AuthGate.tsx        # Auth guard rendering CompassLoader while checking
├── checkin/                # Daily check-in components & DatePicker
├── dashboard/              # Home dashboard widgets & metrics cards
├── money/                  # Finance components (Portfolio, Balances, Cash Flow)
├── nori/                   # Nori AI assistant chat interface
├── todos/                  # To-dos & Habits components
├── ui/                     # UI components
│   ├── CompassLoader.tsx   # Branded spinning compass loader
│   ├── Skeleton.tsx        # Layout-safe shimmer placeholder
│   └── ConfirmDialog.tsx   # Action confirmation modal
└── workout/                # Workout logger components & session items
```

---

## 5. Firestore Data Model

All data is user-scoped under `users/{uid}/...` and protected by Firestore security rules.

| Collection | Document ID | Description |
|---|---|---|
| `users/{uid}/profile` | `"profile"` | User settings (name, unit system, protein target, timezone) |
| `users/{uid}/program` | `"active"` | Active training program (sessions + exercises) |
| `users/{uid}/exercises` | Auto ID | Exercise catalog |
| `users/{uid}/sessions` | Auto ID | Workout sessions |
| `users/{uid}/daily` | `YYYY-MM-DD` | Daily check-in & nutrition log |
| `users/{uid}/todos` | Auto ID | To-do items |
| `users/{uid}/routines` | Auto ID | Habits definitions & completion logs |
| `users/{uid}/portfolio` | Auto ID | Investment portfolio holdings (*ticker, shares, category*) |
| `users/{uid}/accounts` | Auto ID | Liquid accounts (*checking, savings, emergency fund*) |
| `users/{uid}/expenses` | Auto ID | Income & expense transactions |

---

## 6. Verification & Build Commands

* **`npm run typecheck`**: Runs `tsc --noEmit` to verify type safety.
* **`npm run lint`**: Runs `next lint` to enforce clean code style.
* **`npm run build`**: Compiles production Next.js application bundle.
