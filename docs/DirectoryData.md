# DirectoryData — Personal Tracker (Compass)

> **Analysis Date:** 2026-06-07  
> **Analyzed by:** Antigravity AI Assistant  
> **Project Root:** `/Users/xander/Documents/Projects/Personal Tracker`

---

## 1. Project Overview

**Compass** is a private, single-user Progressive Web App (PWA) designed for personal life tracking. It runs mobile-first and is installable as a home-screen app on iOS and Android.

| Field | Value |
|---|---|
| **Internal Name** | `compass` |
| **Version** | `0.1.0` (private) |
| **Framework** | Next.js 14 (App Router, React 18) |
| **Language** | TypeScript 5.5 |
| **Styling** | Tailwind CSS 3.4 |
| **Backend / Database** | Firebase (Auth + Firestore) |
| **Hosting** | Vercel (auto-deploy from `main`) |
| **Node Requirement** | Node 18+ / npm 9+ |

---

## 2. Top-Level Directory Tree

```
Personal Tracker/
├── .cache/                  # Build/tool cache (ignored by git)
├── .claude/                 # Claude AI context config
├── .env.local               # Local env vars (Firebase config, allowed emails)
├── .env.local.example       # Template for .env.local
├── .env.test                # Env vars for test (emulator mode)
├── .eslintrc.json           # ESLint config (Next.js preset)
├── .firebaserc              # Firebase project alias config
├── .flow/                   # Flow-related config/cache
├── .git/                    # Git repository
├── .gitignore               # Git ignore rules
├── .next/                   # Next.js build output (ignored by git)
├── .omc/ / .omx/            # Tool-generated dirs (likely IDE/agent)
├── .playwright-tmp/         # Playwright temp artifacts
├── README.md                # Project readme + quick-start guide
├── components.json          # shadcn/ui component config
├── docs/                    # Project documentation (THIS file lives here)
├── firebase-debug.log       # Firebase emulator debug log (~48 MB)
├── firebase.json            # Firebase hosting + Firestore config
├── firestore-debug.log      # Firestore emulator debug log
├── firestore.rules          # Firestore security rules (source of truth)
├── next-env.d.ts            # Auto-generated Next.js TS env types
├── next.config.mjs          # Next.js custom config
├── node_modules/            # npm dependencies (ignored by git)
├── package.json             # Project manifest + scripts
├── package-lock.json        # Dependency lockfile
├── playwright.config.ts     # Playwright E2E test config
├── postcss.config.mjs       # PostCSS config (Autoprefixer + Tailwind)
├── public/                  # Static assets (icons, logos, SVGs)
├── scripts/                 # Utility scripts (icon gen, data import)
├── src/                     # Application source code
├── tailwind.config.ts       # Tailwind CSS config
├── test-results/            # Playwright test output
├── tests/                   # All tests (E2E + rules unit tests)
├── tsconfig.json            # TypeScript compiler config
└── tsconfig.tsbuildinfo     # TS incremental build cache
```

---

## 3. Source Code (`src/`)

### 3.1 `src/app/` — Next.js App Router

```
src/app/
├── (app)/              # Route group: authenticated app shell
│   ├── layout.tsx      # Auth-gated shell layout (sidebar/bottom tab)
│   ├── page.tsx        # Dashboard / home page
│   ├── check-in/       # Daily check-in page
│   ├── exercise/       # Exercise library browser
│   ├── history/        # Workout history log
│   ├── money/          # Money tracker page
│   ├── nori/           # Nori AI assistant chat page
│   ├── settings/       # User settings page
│   ├── today/          # "Today" daily progress hub
│   ├── todos/          # To-do list page
│   └── workout/        # Active workout logger
│       ├── page.tsx    # Workout selection / program view
│       └── [id]/       # Dynamic route: individual session logger
├── api/
│   ├── exercises/      # API routes for exercise data
│   └── nori/           # API routes for Nori AI (LLM calls)
├── login/              # Sign-in page (Google / Email-Password)
├── not-authorized/     # Shown to non-allowlisted users
├── not-found.tsx       # Global 404 page
├── layout.tsx          # Root layout (fonts, providers)
├── globals.css         # Global Tailwind + CSS custom properties
├── manifest.ts         # PWA web app manifest
├── apple-icon.png      # iOS home screen icon
└── icon.png            # Favicon (32px)
```

### 3.2 `src/components/` — Shared React Components

```
src/components/
├── BottomTabBar.tsx         # Mobile bottom navigation bar
├── InstallPrompt.tsx        # PWA "Add to Home Screen" prompt
├── NotificationsManager.tsx # Push notification setup & permission
├── OfflineIndicator.tsx     # Offline status banner
├── QuickCaptureFab.tsx      # Floating action button for quick entry
├── SeedErrorBanner.tsx      # Error display for failed DB seeding
├── Sidebar.tsx              # Desktop sidebar navigation
├── SidebarAwareMain.tsx     # Layout wrapper offsetting sidebar
├── auth/                   # Auth-related components (sign-in, guard)
├── checkin/                # Daily check-in form components
├── dashboard/              # Dashboard cards and widgets
├── exercise/               # Exercise library components
├── money/                  # Expense and budget components
├── nori/                   # Nori AI assistant UI
│   ├── NoriChat.tsx        # Main chat interface
│   ├── NoriMarkdown.tsx    # Markdown renderer for AI responses
│   ├── NoriPanel.tsx       # Side-panel wrapper
│   └── ThreadList.tsx      # Chat thread history list
├── onboarding/             # Onboarding wizard components
├── program/                # Training program editor components
├── settings/               # Settings form components
├── todos/                  # To-do list components
├── ui/                     # Primitive shadcn/ui components
│   ├── button.tsx, input.tsx, dialog.tsx, sheet.tsx
│   ├── dropdown-menu.tsx, popover.tsx, command.tsx
│   ├── badge.tsx, label.tsx, progress.tsx
│   ├── scroll-area.tsx, separator.tsx, Skeleton.tsx
│   └── ConfirmDialog.tsx
└── workout/                # Workout logger components
```

### 3.3 `src/lib/` — Core Logic & Utilities

```
src/lib/
├── firebase.ts             # Firebase app init (Auth + Firestore instances)
├── utils.ts                # General utility helpers (cn(), etc.)
├── pr.ts                   # Personal record (PR) logic (e1RM, Epley formula)
├── auth/                   # Auth helpers (allowlist check, session)
├── dashboard/              # Dashboard aggregation logic
├── data/                   # Static/seed data (exercise catalog)
├── db/                     # Firestore data layer
│   ├── types.ts            # ALL Firestore document type definitions
│   ├── paths.ts            # Collection/document path helpers
│   ├── converters.ts       # Firestore data converters (typed snapshots)
│   └── seed.ts             # Initial data seeder (exercises, profile)
├── money/                  # Money tracker helpers (formatting, aggregation)
├── nori/                   # Nori AI assistant logic
│   ├── tools.ts            # Tool definitions (add_todo, log_workout, etc.)
│   ├── executor.ts         # Tool execution engine (reads/writes Firestore)
│   └── statusLabels.ts     # Human-readable tool status strings
├── routines/               # Routine/habit tracking helpers
├── today/                  # "Today" page data aggregation
├── ui/                     # UI utility helpers (formatting, display)
└── workout/                # Workout domain logic
    ├── scheduling.ts       # Program session scheduling (day-of-week)
    ├── finishSession.ts    # Session finalization + PR detection
    ├── recomputePRs.ts     # PR history recomputation
    ├── prefill.ts          # Pre-fill sets from previous sessions
    ├── landingStats.ts     # Dashboard workout stats
    ├── recovery.ts         # Auto-finalize abandoned sessions
    ├── exerciseSubs.ts     # Exercise substitution logic
    ├── applyProgramSwap.ts # In-session program exercise swap
    ├── recentExercises.ts  # Recent exercise lookup
    ├── placeholderSet.ts   # Placeholder set creation
    ├── customExerciseId.ts # Custom exercise ID generation
    └── units.ts            # kg ↔ lbs conversion helpers
```

---

## 4. Firestore Data Model

All data lives under `users/{uid}/...`. Every collection is scoped per-user and protected by Firestore security rules.

| Collection | Document ID | Description |
|---|---|---|
| `users/{uid}/profile` | `"profile"` | User settings (name, unit system, protein target, timezone, etc.) |
| `users/{uid}/program` | `"active"` | Active training program (sessions + planned exercises) |
| `users/{uid}/exercises` | Auto ID | Exercise library (seeded + user-defined) |
| `users/{uid}/sessions` | Auto ID | Workout sessions (sets, status, start/finish timestamps) |
| `users/{uid}/daily` | `YYYY-MM-DD` | Daily check-in (bodyweight, sleep, nutrition, mood, notes) |
| `users/{uid}/prs` | Auto ID | Denormalized personal record feed (e1RM, weight, reps) |
| `users/{uid}/todos` | Auto ID | To-do items (title, priority, recurrence, due date) |
| `users/{uid}/expenses` | Auto ID | Individual expenses/income entries |
| `users/{uid}/recurringFees` | Auto ID | Recurring subscription/bill definitions |
| `users/{uid}/routines` | Auto ID | Habit routines with weekly schedule + completion map |
| `users/{uid}/noriThreads` | Auto ID | Nori AI chat threads |
| `users/{uid}/noriThreads/{id}/messages` | Auto ID | Individual chat messages (user / assistant / tool roles) |

### Key Data Conventions
- **Canonical units**: weight in **kg**, water in **ml**, protein in **g** — display layer converts for imperial users.
- **Local date**: `localDate` (`YYYY-MM-DD`) is computed client-side in the user's IANA timezone; it anchors the "today" rollover.
- **Currency**: amounts stored in minor units (e.g., cents).

---

## 5. App Features

| Feature | Route | Description |
|---|---|---|
| **Dashboard** | `/` | Overview cards: recent workout, today's check-in, todos, money summary |
| **Today Hub** | `/today` | Day-at-a-glance: routines, awake progress, quick stats |
| **Workout Logger** | `/workout` | Program selection + live session logger with set tracking |
| **Exercise Library** | `/exercise` | Searchable exercise catalog with GIFs and instructions |
| **Daily Check-In** | `/check-in` | Log bodyweight, sleep, nutrition, mood, journal |
| **History** | `/history` | Past workout sessions with set/volume details |
| **To-Dos** | `/todos` | Task manager with priority, due date, recurrence |
| **Money Tracker** | `/money` | Expense/income log, budget caps, recurring fees |
| **Nori (AI Chat)** | `/nori` | LLM-powered assistant that can read/write app data via tools |
| **Settings** | `/settings` | Profile, unit system, timezone, notifications, categories |
| **Onboarding** | (modal) | First-run wizard to configure profile and goals |

---

## 6. Security Model

- **Firebase Auth**: Google + Email/Password providers.
- **Allowlist**: Only hard-coded email addresses in `firestore.rules` (`allowed()` function) can access data. Non-listed users are signed out and redirected to `/not-authorized`.
- **Firestore Rules** (`firestore.rules`): All reads/writes require `request.auth.uid == uid` AND email on allowlist. Per-collection write validators enforce field shapes, numeric ranges, and required fields.
- **Client-side enforcement**: `NEXT_PUBLIC_ALLOWED_EMAILS` env var mirrors the rules allowlist for immediate client-side redirects.

---

## 7. Testing

```
tests/
├── firestore-rules.test.ts     # Unit tests for Firestore security rules
│                               # (uses @firebase/rules-unit-testing + emulator)
└── e2e/
    ├── README.md               # E2E test documentation
    ├── global-setup.ts         # Playwright global setup (seed test user)
    ├── global-teardown.ts      # Cleanup after test run
    ├── fixtures/               # Shared test fixtures
    ├── smoke.spec.ts           # Smoke test (app loads, auth works)
    ├── auth.spec.ts            # Authentication flow tests
    ├── mobile-nav.spec.ts      # Mobile navigation tests
    ├── today.spec.ts           # Today page tests
    ├── todos.spec.ts           # To-do list tests
    └── money.spec.ts           # Money tracker tests
```

**Test Commands:**

| Command | Description |
|---|---|
| `npm run test:e2e` | Run all Playwright E2E tests |
| `npm run test:e2e:ui` | Open Playwright interactive UI |
| `npm run test:e2e:install` | Install Chromium browser for Playwright |

---

## 8. Scripts

| File | Description |
|---|---|
| `scripts/generate-icons.mjs` | Generates PWA icon set at multiple sizes |
| `scripts/import-exercisedb.mjs` | Imports exercise data from ExerciseDB API into Firestore |

---

## 9. Documentation (`docs/`)

| File | Description |
|---|---|
| `docs/PRD.md` | Product Requirements Document — feature specs and goals |
| `docs/DEPLOYMENT.md` | Step-by-step guide: Firebase project setup, Vercel linking, env vars |
| `docs/FIRESTORE_RULES.md` | How to edit the allowlist and redeploy Firestore security rules |
| `docs/DirectoryData.md` | **This file** — full directory analysis and project map |

---

## 10. Key Dependencies

### Production

| Package | Version | Purpose |
|---|---|---|
| `next` | 14.2.5 | React framework (App Router, SSR/SSG) |
| `react` / `react-dom` | 18.3.1 | UI rendering |
| `firebase` | 10.13.0 | Auth + Firestore client SDK |
| `tailwind-merge` | 3.6.0 | Conditional Tailwind class merging |
| `@radix-ui/*` | Various | Headless accessible UI primitives |
| `class-variance-authority` | 0.7.1 | Component variant management (shadcn) |
| `clsx` | 2.1.1 | Class name composition |
| `date-fns` | 3.6.0 | Date arithmetic and formatting |
| `recharts` | 2.12.7 | Charts (e1RM trends, etc.) |
| `lucide-react` | 0.408.0 | Icon library |
| `@dnd-kit/*` | Various | Drag-and-drop (exercise reordering) |
| `cmdk` | 1.1.1 | Command palette component |
| `react-markdown` + `remark-gfm` | Latest | Markdown rendering in Nori chat |
| `@paper-design/shaders-react` | 0.0.76 | GLSL shader backgrounds |

### Development

| Package | Purpose |
|---|---|
| `@playwright/test` | E2E browser testing |
| `@firebase/rules-unit-testing` | Firestore rules unit tests |
| `typescript` | Static type checking |
| `eslint` + `eslint-config-next` | Linting |
| `autoprefixer` + `postcss` | CSS post-processing |

---

## 11. npm Scripts

| Script | Command | Description |
|---|---|---|
| `dev` | `next dev` | Start local dev server (port 3000) |
| `build` | `next build` | Production build |
| `start` | `next start` | Serve production build locally |
| `lint` | `next lint` | ESLint check |
| `typecheck` | `tsc --noEmit` | Strict TypeScript check (no emit) |
| `test:e2e` | `playwright test` | Run all E2E tests |
| `test:e2e:ui` | `playwright test --ui` | Playwright visual UI runner |
| `test:e2e:install` | `playwright install` | Install Chromium for Playwright |

---

## 12. Public Assets (`public/`)

| File | Description |
|---|---|
| `favicon-32.png` | Browser favicon (32×32) |
| `apple-touch-icon.png` | iOS home screen icon |
| `icon-192.png` | PWA icon (192×192) |
| `icon-512.png` | PWA icon (512×512) |
| `logo.png` | App logo (raster) |
| `logo.svg` | App logo (vector) |
| `logo-mark.svg` | App logomark / symbol only |

---

*Generated by Antigravity AI — 2026-06-07*
