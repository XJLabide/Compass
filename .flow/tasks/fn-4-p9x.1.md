## Description
Build the `/workout` index: shows today's scheduled session per program slot mapping (or "Rest day"), recent sessions list, and "Start session" CTA that creates an in-progress session doc and routes to the live logger.

**Size:** M
**Files:** edit `src/app/(app)/workout/page.tsx`, `src/lib/workout/scheduling.ts`, `src/components/workout/SessionListItem.tsx`

## Approach
- Schedule mapping: simple round-robin by day-of-week against `program/active.sessions` ordering. v1 default mapping documented in code comment + Settings can override later.
- "Start session": writes `users/{uid}/sessions/{id}` with `status: 'in_progress'`, `programSessionId`, `localDate`, `startedAt`, empty `sets[]`; routes to `/workout/[id]`.
- Recent list: realtime `query(sessionsCol, orderBy('startedAt','desc'), limit(5))`.

## Acceptance
- [ ] Today's section shows the right scheduled session name or "Rest day"
- [ ] "Start session" creates the doc and routes correctly
- [ ] Recent sessions list updates live when a session is finished
- [ ] Tapping a recent session routes to its detail page (read-only view in v1)

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
