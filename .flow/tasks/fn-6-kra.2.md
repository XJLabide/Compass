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
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
