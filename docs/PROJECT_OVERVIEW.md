# Compass Project Overview

Use this file as the first read for future conversations. It summarizes the project shape, important files, current product direction, and recent UI decisions so an assistant does not need to scan the entire repository before helping.

## Product

Compass is a personal tracker PWA focused on daily execution, fitness, nutrition, todos, routines, money, goals, and calendar planning. The user wants the app to feel like a uniform iOS-focused PWA: restrained dark UI, consistent margins, safe-area aware mobile layout, real in-app modals instead of browser dialogs, and dense but readable operational screens.

## Stack

- Next.js App Router with React and TypeScript.
- Tailwind CSS for styling.
- Firebase Auth and Firestore for user-scoped data.
- Playwright for E2E tests.
- Firestore rules in `firestore.rules`.
- Typed Firestore paths/converters/types live under `src/lib/db/`.

## App Shell

- Main authenticated app routes live under `src/app/(app)/`.
- The shared app wrapper is `src/app/(app)/layout.tsx`.
- `src/components/SidebarAwareMain.tsx` owns the global app page padding, width, desktop sidebar offset, mobile top safe-area padding, and bottom-tab clearance.
- Individual pages should usually not add their own outer page `px`, `pt`, `pb`, or max-width wrapper unless there is a deliberate reason. Let `SidebarAwareMain` control the global margins.
- Desktop navigation is `src/components/Sidebar.tsx`.
- Mobile bottom tabs and More sheet are `src/components/BottomTabBar.tsx`.
- The mobile bottom nav keeps primary tabs limited; secondary pages such as Goals and Calendar live under More unless explicitly promoted.

## Design Rules From Recent Work

- Use real app UI for confirmations. Do not use `window.confirm`.
- Existing reusable confirmation modal: `src/components/ui/ConfirmDialog.tsx`.
- Mobile modals should be fullscreen or near-fullscreen and safe-area aware.
- Desktop modals should be centered, bounded, and not oversized.
- Keep cards to real content containers, not nested decorative card stacks.
- Avoid dot-only indicators when the user needs recognizable context. Calendar cells now use compact chips with icons and titles.
- Responsive month cells must have stable height, truncated text, and overflow indicators like `+N`.

## Core Routes

- `/today`: daily command center for active day, routines, todos, daily log, workout/nutrition shortcuts.
- `/`: home/dashboard overview.
- `/goals`: long/short-term goals grouped by life area and priority.
- `/calendar`: month-based planning page for classes, events, and due-date todos.
- `/nutrition`: nutrition logging and daily nutrition state.
- `/fitness`: fitness overview with workout/running/sports entry points.
- `/fitness/running`: running activity logging.
- `/fitness/sports`: sports activity logging.
- `/workout`: workout landing/start session.
- `/workout/[id]`: active workout logger.
- `/workout/program`: active program editor.
- `/todos`: todos and routines hub.
- `/money`: finances, budgets, balances, recurring fees, portfolio.
- `/nori`: Nori chat assistant page.
- `/settings`: profile/settings, notifications, day window, custom categories, danger zone.

## Firestore Model

All user data is scoped under:

```text
users/{uid}/...
```

Important typed schema files:

- `src/lib/db/types.ts`: TypeScript document shapes.
- `src/lib/db/converters.ts`: Firestore converters.
- `src/lib/db/paths.ts`: typed path builders.
- `firestore.rules`: security validators.

Common collections/docs:

- `profile/profile`: user profile and preferences.
- `program/active`: active workout program.
- `daily/{YYYY-MM-DD}`: daily nutrition, bodyweight, sleep, mood, steps, notes.
- `sessions/{sessionId}`: workout/running/sports sessions.
- `prs/{prId}`: denormalized PR feed.
- `todos/{todoId}`: one-shot todos with optional `dueDate`, `priority`, and recurrence.
- `routines/{routineId}`: recurring habits/routines.
- `goals/{goalId}`: life-area goals and metrics.
- `calendarItems/{itemId}`: calendar classes and events.
- `expenses`, `budgets`, `recurringFees`, `portfolio`, `accounts`: money tracker data.

## Goals Page

Primary file:

- `src/app/(app)/goals/page.tsx`

Behavior:

- Separate full page named Goals.
- Desktop sidebar item.
- Mobile More menu item.
- Goals are categorized by life area: fitness, nutrition, habits, money, personal.
- Each life area has its own priority ranking.
- Goals can combine manual and automatic metrics.
- Goal metrics can pull from existing app data like bodyweight, workouts per week, calories average, protein average, steps average, sleep average, routine completion, and budget spend.
- Goal add flow uses a guided modal rather than a plain form.

Firestore:

- `users/{uid}/goals/{goalId}`
- Types include `GoalDoc`, `GoalMetric`, `GoalMilestone`, `GoalLifeArea`, and status/state/source/direction unions in `src/lib/db/types.ts`.

Tests:

- `tests/e2e/goals.spec.ts`

## Calendar Page

Primary file:

- `src/app/(app)/calendar/page.tsx`

Navigation:

- Desktop sidebar includes `Calendar`.
- Mobile More sheet includes `Calendar`.
- It is not currently a primary bottom tab.

Behavior:

- Separate full page named My Calendar.
- Month grid defaults to current month with today selected.
- Header controls: previous month, next month, Today, Add.
- Day cells show compact chip previews, not just dots.
- Chips include category icon and title where screen width allows.
- Chips are capped per cell and use `+N` overflow to preserve grid height.
- Selecting a day shows an agenda below the month grid.
- Agenda combines classes, events, and todos.
- Classes/events are sorted by time.
- Untimed events are effectively shown after timed items.
- Due-date todos appear in the selected day agenda.
- Calendar can complete todos.
- Calendar can edit/delete the specific class, event, or todo shown in the agenda.
- Deeper todo editing stays on `/todos`.

Calendar modal:

- Single Add/Edit modal.
- User chooses Class, Event, or Todo when adding.
- Edit mode locks to the existing item type.
- Mobile modal is fullscreen/near-fullscreen.
- Desktop modal is centered.
- Save/delete paths include a close guard so a modal does not get stuck on `Saving...` if Firestore has already reflected the write locally but the backend acknowledgement is slow.
- Deletes use `ConfirmDialog`, not a browser alert.

Calendar Firestore:

```text
users/{uid}/calendarItems/{itemId}
```

Supported calendar item types:

- `class`
- `event`

Class fields:

- `type: "class"`
- `title`
- `weekdays: number[]` where `0 = Sunday` through `6 = Saturday`
- `startTime: "HH:MM"`
- `endTime: "HH:MM"`
- `location?: string`
- `startDate?: LocalDate`
- `endDate?: LocalDate`
- `active: boolean`
- `createdAt`
- `updatedAt`

Event fields:

- `type: "event"`
- `title`
- `date?: LocalDate`
- `weekdays?: number[]`
- `recurrence: "none" | "weekly"`
- `startTime?: "HH:MM"`
- `endTime?: "HH:MM"`
- `location?: string`
- `active: boolean`
- `createdAt`
- `updatedAt`

Todos:

- Calendar reads existing `TodoDoc` rows from `users/{uid}/todos`.
- Only todos with `dueDate` appear on the calendar.
- Calendar-created todos use the existing todo model.

Tests:

- `tests/e2e/calendar.spec.ts`
- Covers sidebar navigation, mobile More navigation, creating class/event/todo, editing event/todo, deleting class/event/todo, completing todo, weekly class occurrence, modal close behavior, and month-cell chip previews.

## Todos And Routines

Primary files:

- `src/app/(app)/todos/page.tsx`
- `src/components/todos/TodosTab.tsx`
- `src/components/todos/RoutinesTab.tsx`
- `src/components/todos/TimeBlockManager.tsx`

Notes:

- `/todos` is a two-tab hub for Todos and Routines.
- Todo model already supports `dueDate`, `priority`, `done`, `completedAt`, and optional recurrence.
- Calendar should not duplicate the deeper todo editor.

## Today Page

Primary file:

- `src/app/(app)/today/page.tsx`

Notes:

- Daily execution surface.
- Uses active day state so late-night logs can still attach to the user-controlled active date.
- Safe-area layout matters here because previous iPhone screenshots showed overlap risk with system time/battery areas.

Related:

- `src/lib/day/ActiveDayProvider.tsx`
- `src/lib/today/timeOfDay.ts`

## Fitness And Workout

Primary files:

- `src/app/(app)/fitness/page.tsx`
- `src/app/(app)/fitness/running/page.tsx`
- `src/app/(app)/fitness/sports/page.tsx`
- `src/app/(app)/workout/page.tsx`
- `src/app/(app)/workout/[id]/page.tsx`
- `src/app/(app)/workout/program/page.tsx`
- `src/lib/workout/scheduling.ts`
- `src/lib/workout/finishSession.ts`

Notes:

- Fitness dashboard has workout/running/sports entry points.
- Workout scheduling comes from active program and profile timezone.
- Sessions can be weight lifting, running, or sports.

## Money

Primary files:

- `src/app/(app)/money/page.tsx`
- `src/components/money/BalancesTab.tsx`
- `src/components/money/BudgetSection.tsx`
- `src/components/money/PortfolioTab.tsx`
- `src/components/money/RecurringFeesSection.tsx`

Notes:

- Money tracker uses typed Firestore docs for accounts, portfolio holdings, expenses, budgets, and recurring fees.
- Currency helpers live in `src/lib/money/`.

## Nori

Primary files:

- `src/app/(app)/nori/page.tsx`
- `src/components/nori/NoriChat.tsx`
- `src/components/nori/ThreadList.tsx`
- `src/lib/nori/executor.ts`
- `src/lib/nori/tools.ts`

Notes:

- Nori is the app assistant.
- User previously removed or deprioritized the floating Ask Nori control because it was not heavily used.

## Testing And QA Commands

Use these commands after meaningful app changes:

```bash
npm run typecheck
npm run lint
npm run test:e2e -- --project=desktop-chromium tests/e2e/calendar.spec.ts
npm run test:e2e -- --project=desktop-chromium tests/e2e/goals.spec.ts
npm run build
```

For local development:

```bash
npm run dev
```

The dev server usually runs at:

```text
http://localhost:3000
```

Before `npm run build`, stop any active dev server on port 3000 if needed. The dev script clears `.next`, so running dev and build concurrently can cause confusing results.

## Known Local Git State Notes

- At the time this overview was created, `projectinfo.md` existed as an untracked file and should not be modified or committed unless the user explicitly asks.
- Recent pushed commit for Calendar page: `becfce8 Add calendar planning as a first-class page`.

## How Future Assistants Should Start

1. Read this file first.
2. Check `git status --short`.
3. For UI work, inspect only the relevant route/component plus `SidebarAwareMain`, `Sidebar`, and `BottomTabBar`.
4. For Firestore work, inspect `types.ts`, `paths.ts`, `converters.ts`, and `firestore.rules`.
5. Prefer existing modal, button, and page shell patterns over adding new UI primitives.
6. Run focused E2E tests for the touched module, then typecheck/lint/build for larger changes.
