# Workout Logger — program, session logging, PRs, history

## Overview
The heart of v1. From the dashboard, the user starts a session pre-populated from the active Upper/Lower program, logs sets (weight/reps/RPE) on a mobile-friendly form with steppers and last-session prefill, finishes the session, and gets PR detection plus a per-exercise history view.

## Scope
**In:**
- `/workout` index: shows today scheduled session (if program slot maps to today) + recent sessions + start-session CTA
- `/workout/new` (or `/workout/[sessionId]`): the live logger
  - Pre-fills planned exercises from `program/active`
  - Per-exercise card: sticky exercise header, list of sets, +/- steppers for weight and reps, RPE 1..10 selector, optional set notes
  - Auto-advance focus to next set after logging
  - Last-session prefill: most recent **completed** session of the same template slot (per gap analyst)
  - Quick-add unplanned exercise (search from master list)
  - Finish session: persist all sets, mark session `completed`, compute PRs
- In-progress recovery: write `status: 'in_progress'` doc on session start; if app reopens, show resume banner. Auto-finalize after 24h idle.
- Edit/delete past sets within 48h; soft-delete + recompute PRs for that exercise
- PR detection logic (`src/lib/pr.ts`): per-(exercise, rep-bucket) heaviest weight AND e1RM (Epley) — flag both kinds
- Exercise history page `/exercise/[id]`: list of sessions touching this lift + e1RM chart over time

**Out:**
- Rest timer (PRD §12 default: skip in v1)
- Cardio / sports sessions (v2)
- Set-level supersets / drop sets (v2)
- Program editor UI (v2)

## Approach
- Per-set writes use a subcollection or array-on-session — pick **array on session doc** with `arrayUnion` for atomic adds; whole-doc rewrites are avoided. (per gap analyst on multi-tab)
- Number inputs: `<input type="number" inputmode="decimal">` + visible +/- buttons.
- Touch targets >= 44px.
- PR write strategy: on `finish session`, compute deltas vs prior `prs/{exerciseId}` doc; if new best, write to `prs/` feed for the dashboard.
- Use date-fns + IANA tz from profile to compute `localDate`.

## Quick commands
```bash
# Manual: log a fake session for "Upper A", finish, see PR flagged
# Manual: kill mid-session, reopen app, see resume banner
```

## Acceptance
- [ ] Start session pre-populates exercises from `program/active`
- [ ] Set logging works one-handed on a 6.1" phone viewport
- [ ] Last-session weights and reps appear as ghost-text prefill
- [ ] Quick-add adds an unplanned exercise into the session
- [ ] Finishing the session marks status=completed and persists sets
- [ ] Closing app mid-session and reopening shows "Resume session" banner
- [ ] After 24h idle, in-progress session is auto-finalized
- [ ] Edit within 48h works; PR feed recomputes correctly when an edit removes the best set
- [ ] PR detected on a new heaviest 5-rep set; also a new e1RM record flagged
- [ ] `/exercise/[id]` renders e1RM line chart with all sessions

## References
- arrayUnion: https://firebase.google.com/docs/firestore/manipulate-data/add-data#update_elements_in_an_array
- Recharts line chart: https://recharts.org/en-US/examples/SimpleLineChart
- Tailwind sticky / safe area: practice-scout report
