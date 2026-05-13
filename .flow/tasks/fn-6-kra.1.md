## Description
Dashboard skeleton: page layout, "Today" section with the two CTAs, goal banner with bodyweight trend vs target weekly gain. Empty states until enough data exists.

**Size:** M
**Files:** edit `src/app/(app)/page.tsx` (Home), `src/components/dashboard/TodayCard.tsx`, `src/components/dashboard/GoalBanner.tsx`, `src/components/dashboard/EmptyState.tsx`

## Approach
- TodayCard reads today's `daily/{localDate}` doc (realtime listener) to flip the check-in badge; reads schedule from `program/active` to render the workout CTA.
- GoalBanner: linear regression over last 4 weeks of `daily.bodyweightKg`; compares slope to `profile.weeklyGainKg`; color band per gap analyst.
- Empty state for <3 bodyweight points: replace banner with "Log 3 weigh-ins to see your trend".

## Acceptance
- [ ] Today CTAs are above the fold on 6.1" phone
- [ ] Goal banner shows correct color band (green/yellow/red) for synthetic data inputs
- [ ] Empty-state CTAs render when no data exists
- [ ] Check-in badge flips green within 1s after submitting today's check-in

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
