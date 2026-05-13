## Description
Build the session logger UI: list of planned exercises (one card each, sticky header per exercise while scrolling sets), per-set rows with weight (kg/lb), reps, RPE (1..10), and +/- steppers in addition to direct entry. Auto-advance focus on set completion.

**Size:** M
**Files:** `src/app/(app)/workout/[sessionId]/page.tsx`, `src/components/workout/ExerciseCard.tsx`, `src/components/workout/SetRow.tsx`, `src/components/workout/Stepper.tsx`

## Approach
- Per-set writes via `updateDoc` with `arrayUnion` / immutable replacement of the `sets` array (per E4 plan, multi-tab safety).
- Inputs: `type="number" inputmode="decimal"`; +/- buttons increment by smart deltas (1 for reps, 2.5 for weight in kg / 5 in lb).
- Sticky exercise header: `sticky top-0 bg-bg z-10` inside the card.
- Touch targets >= 44px.
- Use `unitSystem` from profile for display only; store `weightKg`.

## Acceptance
- [ ] One-handed thumb-reach test passes on 375x812
- [ ] Steppers + direct entry both work for weight and reps
- [ ] Auto-advance focus moves to next set after Enter / +- bottom action
- [ ] Multi-tab edits do not clobber each other (verify in 2 tabs)

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
