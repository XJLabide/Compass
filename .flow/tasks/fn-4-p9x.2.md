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
Built the live workout session logger at /workout/[id]: ExerciseCard with sticky per-exercise header, SetRow with +/- steppers (smart deltas reps=1, weight=2.5kg/5lb), direct decimal entry, RPE 1..10, auto-advance focus, and 44px touch targets. Sets persist via updateDoc with immutable replacement of sets[] (no whole-doc overwrites, no arrayUnion) for multi-tab safety. Weight stored canonical kg; display follows profile.unitSystem.
## Evidence
- Commits: fedfa12cbcfad836b489b430e60f88536a768cff
- Tests: npx tsc --noEmit (src/ clean), npx next lint --dir src (no warnings or errors)
- PRs: