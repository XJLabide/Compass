## Description
Build the daily check-in form: all PRD section 5.3 fields on one screen, sticky submit, upsert by `localDate` with `setDoc({merge:true})`. Pre-fill targets from profile.

**Size:** M
**Files:** `src/app/(app)/check-in/page.tsx`, `src/components/checkin/CheckInForm.tsx`, `src/components/checkin/RatingChip.tsx`

## Approach
- Compute `localDate` using profile timezone (date-fns-tz or `Intl.DateTimeFormat`).
- Save on submit, not on each field change. Show "Saved {time ago}" if doc already exists.
- Sticky footer: `sticky bottom-[calc(env(safe-area-inset-bottom)+64px)]` above the tab bar.
- Inputs use `inputmode="decimal"`; 1..5 ratings use chip buttons (44px tall).
- Unit display from profile; store `bodyweightKg`, `waterMl`, etc.

## Acceptance
- [ ] Form fits one viewport on 6.1" phone, submit visible
- [ ] Submitting only bodyweight saves only that field
- [ ] Re-submitting same day merges fields without losing prior values
- [ ] Targets show as placeholders for protein and calories
- [ ] Sticky submit clears the iOS home indicator

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
