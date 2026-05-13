## Description
Backfill mode: a date picker on the check-in page lets the user pick any of the last 7 days. Dates older than 7 days route to a read-only history list.

**Size:** S
**Files:** edit `src/app/(app)/check-in/page.tsx`, `src/components/checkin/DatePicker.tsx`, `src/app/(app)/history/page.tsx` (basic list)

## Approach
- Backfill picker: native `<input type="date">` for v1 to avoid extra deps.
- History page (basic v1): list of `daily/*` docs newest first; each row routes to a read-only view of that day's check-in.

## Acceptance
- [ ] Picker enforces a 7-day window; older dates show "Read-only" toast
- [ ] Backfilling a past day creates the doc with that `localDate`
- [ ] History list shows all check-in docs newest first

## Done summary
Added 7-day backfill picker to /check-in (URL-driven via ?date=), implemented /history newest-first list of daily docs, and built /history/[date] read-only day view. Out-of-window dates surface a banner linking to History instead of silently routing.
## Evidence
- Commits: e5a785b1327555d9545fb724310a16cf108d747a
- Tests: npx tsc --noEmit (src clean), npx next lint (clean), npx next build (passes; /check-in, /history, /history/[date] all compiled)
- PRs: