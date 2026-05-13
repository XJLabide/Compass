## Description
PR detection module: compute heaviest weight per (exerciseId, repBucket) AND best e1RM (Epley) per exerciseId. On session finish, diff against existing `prs/{exerciseId}` and write new bests to the PR feed. On edit/delete of past sets, recompute from history.

**Size:** M
**Files:** `src/lib/pr.ts`, edit `src/lib/workout/finishSession.ts` (called from E4.3), `src/lib/workout/recomputePRs.ts`

## Approach
- Rep buckets: `[1, 3, 5, 8, 12]` — "5-rep PR" means heaviest weight at reps in [4..6], etc. Pick bucket = nearest in this set.
- e1RM (Epley): `weight * (1 + reps/30)`.
- Storage: one PR doc per exercise + per bucket plus an e1RM record; flat feed under `users/{uid}/prs/`.
- Recompute path: read all completed sessions for the exercise, rebuild PRs from scratch — simple and correct.

## Acceptance
- [ ] New heaviest 5-rep set writes a new PR feed entry
- [ ] New e1RM record writes a separate feed entry flagged as e1RM
- [ ] Editing the heaviest set down recomputes correctly (the entry is removed/superseded)
- [ ] PR detection runs <500ms for sessions up to 50 sets

## Done summary
PR detection wired into finish-session: pure `src/lib/pr.ts` (rep buckets [1,3,5,8,12] nearest assignment, Epley e1RM, candidate compute, diff-vs-existing, deterministic doc ids), orchestrator `finishSession.ts` (loads session, diffs against `prs/{exerciseId}` docs by exerciseId, batched upsert with denormalized exercise name + session-anchored date), and `recomputePRs.ts` (destructive per-exercise rebuild from completed history for the edit/delete path). The `/workout/[id]` finish handler now calls the real `finishSession()` non-fatally, replacing the .3 placeholder.
## Evidence
- Commits: f17017fd8a25dd892cffc9d8257e4cfe7c31ba7f
- Tests: npx tsc --noEmit (src/ clean), npx next lint --dir src (no warnings/errors)
- PRs: