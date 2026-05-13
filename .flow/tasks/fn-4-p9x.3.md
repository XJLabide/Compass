## Description
Last-session prefill (heaviest set of most-recent **completed** session of the same template slot), quick-add unplanned exercise (search master list), and "Finish session" action that marks status=completed and triggers PR detection.

**Size:** M
**Files:** `src/lib/workout/prefill.ts`, `src/components/workout/QuickAddExercise.tsx`, edit `src/app/(app)/workout/[sessionId]/page.tsx`

## Approach
- Prefill source: `query(sessionsCol, where('programSessionId','==',slotId), where('status','==','completed'), orderBy('startedAt','desc'), limit(1))` — per gap analyst, not calendar-prior.
- Show as placeholder/ghost values; do NOT auto-fill — user must touch to accept.
- Quick-add: searchable list over `exercises/*`; selecting appends to session.sets array as a "freeform" exercise (no planned target).
- Finish: write `status='completed'`, `finishedAt`, `durationMin`; then run PR detection (E4.4).

## Acceptance
- [ ] Prefill shows previous heaviest set for each planned exercise
- [ ] Quick-add adds an exercise that persists into the session
- [ ] Finish flips status and triggers PR calculation
- [ ] Dashboard "this week" counters tick up after finish

## Done summary
Added cross-session ghost prefill (heaviest set of last completed session for the same program slot, rendered as a tappable "Last: w × r ↩" hint and never auto-filled), searchable QuickAddExercise picker over the master exercise list, and a Finish-session action that writes status=completed/finishedAt/durationMin, prunes placeholder anchors, calls a PR-detection placeholder hook (real logic in fn-4-p9x.4), and routes back to /workout.
## Evidence
- Commits: 163f1f419c86f002fbb4143f739dd918b7e90f15
- Tests: npx tsc --noEmit (clean for src/), npx next build (success, /workout/[id] route compiled)
- PRs: