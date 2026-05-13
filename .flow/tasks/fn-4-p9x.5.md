## Description
In-progress session recovery banner, 48-hour edit window for finished sessions, and 24-hour idle auto-finalize for forgotten in-progress sessions.

**Size:** M
**Files:** `src/lib/workout/recovery.ts`, `src/components/workout/ResumeBanner.tsx`, edit `/workout` index page

## Approach
- Resume banner: on `/workout`, if a session exists with `status='in_progress'`, render a banner with "Resume" CTA (link to logger) and "Discard" (sets status=discarded).
- Auto-finalize: a client-side check on app load — if in-progress session is older than 24h, set status=completed with `autoFinalizedAt`, run PR detection on whatever sets exist.
- Edit window: deny edits to a `sessions` doc older than 48h (UI-level + rules-level guard). Soft-delete sets via `deleted: true` flag; recompute PRs (per E4.4).

## Acceptance
- [ ] Killing the app mid-session and reopening shows the Resume banner
- [ ] An in-progress session older than 24h is auto-finalized on next app open
- [ ] Past-session edit UI is disabled after 48h
- [ ] Soft-deleted sets disappear from PR calculations

## Done summary
Added in-progress session recovery (ResumeBanner + checkAndAutoFinalize), 24h auto-finalize on /workout mount, and 48h read-only edit window on /workout/[id]. Extended SessionDoc with autoFinalizedAt and added discarded status.
## Evidence
- Commits: 383e6ee4bfacb94319a3e64acd0eebe799d65a52
- Tests: npx tsc --noEmit, npx next lint
- PRs: