## Description
"This week" stats card and "Recent PRs" strip — both via realtime listeners.

**Size:** M
**Files:** `src/components/dashboard/ThisWeekCard.tsx`, `src/components/dashboard/RecentPRsStrip.tsx`, `src/lib/dashboard/weekly.ts`

## Approach
- Week bucket: use profile timezone; week starts Monday (date-fns `startOfWeek({weekStartsOn:1})`).
- Counters: workouts done/planned, avg protein, avg sleep, weight delta this week vs last.
- PRs strip: realtime `query(prsCol, orderBy('date','desc'), limit(3))`.
- Zero-data cells render "-" not "0" (per gap analyst).

## Acceptance
- [ ] Counters update within 1s after a session finish or check-in submit
- [ ] PRs strip shows the 3 most recent PRs
- [ ] Zero-data state displays "-" cells
- [ ] No flicker between empty -> populated render

## Done summary
Added Monday-anchored weekly bucketing helpers (src/lib/dashboard/weekly.ts), a realtime ThisWeekCard with workouts/protein/sleep/weight-delta counters (em-dash for zero-data), and a RecentPRsStrip listening to the last 3 PRs. Both cards are mounted on the dashboard below TodayCard + GoalBanner.
## Evidence
- Commits: 5140708b5e8aa05184df8ebed60e8373b8b7751b
- Tests: npx tsc --noEmit (src/ clean), npx next lint --dir src (clean)
- PRs: