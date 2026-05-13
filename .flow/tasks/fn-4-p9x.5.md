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
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
