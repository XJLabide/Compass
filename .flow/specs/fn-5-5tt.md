# Daily Check-in — single-screen form + backfill

## Overview
A one-screen, fits-on-a-phone, sticky-submit form that captures the day's bodyweight, sleep, food, hydration, steps, mood and a note — upserted into one doc per `localDate`. Yesterday's values pre-fill where it makes sense.

## Scope
**In:**
- `/check-in` route inside `(app)`
- One form, no tabs/wizards; sticky submit footer above the tab bar with safe-area padding
- Fields per PRD section 5.3: bodyweight, sleep hours, sleep quality (1..5), calories, protein g, water, steps, mood (1..5), note
- Number inputs use `inputmode="decimal"`; sliders or chip selectors for 1..5 ratings
- Upsert by `localDate` (`setDoc({merge:true})`); show "last updated" timestamp if doc already exists
- Pre-fill: protein/calorie targets come from `profile`; bodyweight pre-fills with last entry as a hint (not a value); sleep/mood blank
- Partial entry allowed — any subset saves
- Backfill mode: date picker allows backfilling up to 7 days ago; older = "Edit history" route (read-only listing in v1 backfill mode)
- Dashboard CTA "Daily check-in" deep-links here and shows green badge once today is saved

**Out:**
- Food database / barcode (v2)
- Photos (v2)
- Recurring reminders / push notifications (v2)

## Approach
- `localDate` computed using IANA tz from profile (per gap analyst).
- Store canonical units; display per `unitSystem` pref.
- After save, navigate back to dashboard and show toast "Saved" — dashboard reflects update via realtime listener.

## Quick commands
```bash
# Manual: submit with bodyweight only, reload, only that field persisted
# Manual: submit again for same day, second submit updates "last updated"
```

## Acceptance
- [ ] Form fits one viewport on 6.1" phone with no scroll required to reach submit
- [ ] Sticky submit respects `env(safe-area-inset-bottom)`
- [ ] Submitting with only bodyweight persists only that field
- [ ] Re-submitting same day merges, not overwrites, fields
- [ ] Targets from profile show as placeholder/helper text for protein and calories
- [ ] Date picker permits any of the last 7 days; older dates land in read-only history mode
- [ ] Dashboard "today checked-in" badge flips to green after save

## References
- setDoc merge: https://firebase.google.com/docs/firestore/manipulate-data/add-data#set_a_document
- safe-area-inset: practice-scout report
