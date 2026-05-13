## Description
Per-exercise history page: list of sessions touching this exercise (date + best set), and a line chart of e1RM over time.

**Size:** M
**Files:** `src/app/(app)/exercise/[id]/page.tsx`, `src/components/exercise/E1RMChart.tsx`

## Approach
- Query: completed sessions where `sets[*].exerciseId == id`. v1 reads ~last 26 weeks of sessions client-side and filters in-memory; revisit if read volume grows.
- Chart: Recharts `LineChart` with date X axis, e1RM Y axis. Show PR markers as dots.

## Acceptance
- [ ] Page lists all sessions touching the exercise, newest first
- [ ] Chart renders monotonically when strength is increasing
- [ ] Tapping a session entry routes to the read-only session detail

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
