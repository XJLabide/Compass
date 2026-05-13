## Description
Build the mobile-first app shell: a route group `(app)` whose layout renders children inside a flex column with a fixed bottom tab bar (Home / Workout / Check-in / History / Settings). Placeholder pages for each tab so navigation works end-to-end.

**Size:** M
**Files:** `src/app/(app)/layout.tsx`, `src/app/(app)/page.tsx` (Home), `src/app/(app)/workout/page.tsx`, `src/app/(app)/check-in/page.tsx`, `src/app/(app)/history/page.tsx`, `src/app/(app)/settings/page.tsx`, `src/components/BottomTabBar.tsx`

## Approach
- Bottom tab bar: `fixed bottom-0 inset-x-0 pb-[env(safe-area-inset-bottom)] border-t border-border bg-panel/95 backdrop-blur` (per practice-scout).
- Active route highlighting via `usePathname` (`"use client"` component).
- Icons from `lucide-react`.
- Main content wrapper: `pb-20` to reserve space; `max-w-md mx-auto` so it scales nicely on desktop.
- Touch targets in tab bar: `h-14 min-w-11`.

## Acceptance
- [ ] All five tabs navigate and the active tab is visually distinguished
- [ ] No horizontal scroll on a 375px-wide viewport
- [ ] Tab bar respects iOS safe-area in DevTools "iPhone 14" preset
- [ ] Each placeholder page renders its name as a heading
- [ ] Typecheck + lint + build remain green

## Done summary
Added the mobile-first app shell: route group `(app)` with a shared layout that renders a max-w-md content area and a fixed `BottomTabBar` client component (lucide icons, safe-area padding, active-route highlight via `usePathname`). Five placeholder pages (Home, Workout, Check-in, History, Settings) all build clean.
## Evidence
- Commits: f90870eb7ebb4b554bd01d14d8637913fde52266
- Tests: npm run typecheck, npm run build
- PRs: