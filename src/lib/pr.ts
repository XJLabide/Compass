import type { LoggedSet, PRDoc } from "@/lib/db/types";

/**
 * Pure PR (personal record) detection helpers.
 *
 * Two flavors of PR are tracked per exercise:
 *
 *   1. **Rep-bucket PR**: the heaviest weight ever lifted in a "neighborhood"
 *      of reps. Buckets are `[1, 3, 5, 8, 12]`; a set is assigned to the
 *      bucket *nearest* its rep count (ties → lower bucket). A 6-rep set
 *      belongs to the 5-bucket; a 7-rep set also to 5 (tie 7→5 vs 7→8 is
 *      `|7-5|=2`, `|7-8|=1`, so 7 goes to 8 — see `nearestRepBucket`).
 *
 *   2. **e1RM PR**: highest Epley-estimated 1-rep max across any set of the
 *      exercise. e1RM = `weight * (1 + reps/30)`.
 *
 * Storage model (denormalized feed):
 *   - PR docs are written to `users/{uid}/prs/{prId}`.
 *   - One PR doc per (exerciseId, kind) where kind is either a rep-bucket
 *     (`bucket-1`, `bucket-3`, ...) or `e1rm`. Doc id is deterministic so
 *     repeated finishes upsert rather than spawn duplicates.
 *
 * Everything here is pure and synchronous so it can be unit tested without
 * Firebase. Firestore I/O lives in `src/lib/workout/finishSession.ts` and
 * `src/lib/workout/recomputePRs.ts`.
 */

/**
 * Rep buckets in ascending order. A "5-rep PR" means heaviest weight at reps
 * nearest 5 (the [4..6] neighborhood, with 7 going to 8). The spec calls this
 * the rep-bucket model; do not change the list without updating the spec.
 */
export const REP_BUCKETS = [1, 3, 5, 8, 12] as const;
export type RepBucket = (typeof REP_BUCKETS)[number];

/** Distinguishes the two PR varieties on a stored `PRDoc`. */
export type PRKind = "bucket" | "e1rm";

/**
 * Optional extension fields beyond `PRDoc`. We store `kind` and (for bucket
 * PRs) `bucket` on each PR doc so the dashboard can label them ("New 5-rep
 * PR!" vs "New e1RM!"). The fields are additive and unused legacy docs
 * remain readable.
 */
export interface PRDocExt extends PRDoc {
  kind: PRKind;
  /** Present iff `kind === "bucket"`. */
  bucket?: RepBucket;
}

/**
 * Assign a rep count to the nearest bucket in `REP_BUCKETS`. Ties are
 * resolved by picking the *lower* bucket (i.e. the more conservative claim:
 * a 4-rep set is a 3-rep PR, not a 5-rep PR). Reps <= 0 are not PR-eligible
 * and return `null`.
 *
 *   1   → 1
 *   2   → 1   (|2-1|=1, |2-3|=1, tie → lower)
 *   3   → 3
 *   4   → 3   (|4-3|=1, |4-5|=1, tie → lower)
 *   5   → 5
 *   6   → 5
 *   7   → 8   (|7-5|=2, |7-8|=1)
 *   8   → 8
 *   10  → 8   (|10-8|=2, |10-12|=2, tie → lower)
 *   11  → 12
 *   12  → 12
 *   20  → 12  (capped at top bucket)
 */
export function nearestRepBucket(reps: number): RepBucket | null {
  if (!Number.isFinite(reps) || reps <= 0) return null;
  let best: RepBucket = REP_BUCKETS[0];
  let bestDist = Math.abs(reps - best);
  for (let i = 1; i < REP_BUCKETS.length; i++) {
    const b = REP_BUCKETS[i];
    const d = Math.abs(reps - b);
    // Strict `<` keeps the *lower* bucket on ties (we iterate ascending).
    if (d < bestDist) {
      best = b;
      bestDist = d;
    }
  }
  return best;
}

/**
 * Epley 1RM estimator. Returns 0 for non-positive inputs so callers can do
 * `max(e1RM, ...)` without guarding.
 */
export function epleyE1RM(weightKg: number, reps: number): number {
  if (!Number.isFinite(weightKg) || !Number.isFinite(reps)) return 0;
  if (weightKg <= 0 || reps <= 0) return 0;
  return weightKg * (1 + reps / 30);
}

/**
 * Deterministic PR doc id. Keeping the id derivable from
 * `(exerciseId, kind, bucket?)` means a re-run of PR detection upserts the
 * same doc instead of duplicating, and `recomputePRs` can wipe just this
 * exercise's PRs without a full scan.
 *
 *   bucket: `pr_{exerciseId}_b{bucket}`
 *   e1rm:   `pr_{exerciseId}_e1rm`
 */
export function prDocId(
  exerciseId: string,
  kind: PRKind,
  bucket?: RepBucket,
): string {
  if (kind === "bucket") {
    if (bucket === undefined) {
      throw new Error("prDocId: bucket required for kind=bucket");
    }
    return `pr_${exerciseId}_b${bucket}`;
  }
  return `pr_${exerciseId}_e1rm`;
}

/**
 * A "candidate" PR computed from a session's sets — not yet diffed against
 * stored PRs. The `set` reference points back at the LoggedSet that earned
 * the PR so we can denormalize weight/reps onto the written doc.
 */
export interface CandidatePR {
  exerciseId: string;
  kind: PRKind;
  /** Only present when `kind === "bucket"`. */
  bucket?: RepBucket;
  weightKg: number;
  reps: number;
  /** For e1rm PRs, the estimated 1RM. For bucket PRs, same as `weightKg`. */
  metric: number;
  /** Originating set (so callers can pull `rpe`, etc. if they want to). */
  set: LoggedSet;
}

/**
 * Compute the best candidate PRs from a single session's sets.
 *
 * For each exerciseId × bucket combination, picks the heaviest set in that
 * bucket. Also picks the highest-e1RM set per exerciseId. Sets with
 * non-positive weight/reps are skipped (placeholder anchors written by
 * quick-add fall into this trap and are correctly ignored).
 *
 * Returns one entry per (exercise, kind, bucket?). A session that hits new
 * bests at 5-rep AND e1RM produces two candidates for that exercise.
 *
 * Tie-breaking: when two sets in the same bucket have identical weights,
 * the one with **higher reps** wins (a 100x6 trumps a 100x4 in the 5-bucket
 * because it's "more work at the same weight"). Same idea for e1RM ties:
 * higher reps wins.
 */
export function computeCandidatePRs(sets: LoggedSet[]): CandidatePR[] {
  // Map keyed by `${exerciseId}|${bucket}` (or `${exerciseId}|e1rm`).
  const bucketBest = new Map<string, CandidatePR>();
  const e1rmBest = new Map<string, CandidatePR>();

  for (const s of sets) {
    if (!s || s.weightKg <= 0 || s.reps <= 0) continue;

    // ---- rep-bucket candidate ----
    const bucket = nearestRepBucket(s.reps);
    if (bucket !== null) {
      const key = `${s.exerciseId}|${bucket}`;
      const incumbent = bucketBest.get(key);
      if (
        !incumbent ||
        s.weightKg > incumbent.weightKg ||
        (s.weightKg === incumbent.weightKg && s.reps > incumbent.reps)
      ) {
        bucketBest.set(key, {
          exerciseId: s.exerciseId,
          kind: "bucket",
          bucket,
          weightKg: s.weightKg,
          reps: s.reps,
          metric: s.weightKg,
          set: s,
        });
      }
    }

    // ---- e1RM candidate ----
    const e = epleyE1RM(s.weightKg, s.reps);
    if (e > 0) {
      const incumbent = e1rmBest.get(s.exerciseId);
      if (!incumbent || e > incumbent.metric ||
          (e === incumbent.metric && s.reps > incumbent.reps)) {
        e1rmBest.set(s.exerciseId, {
          exerciseId: s.exerciseId,
          kind: "e1rm",
          weightKg: s.weightKg,
          reps: s.reps,
          metric: e,
          set: s,
        });
      }
    }
  }

  return [...bucketBest.values(), ...e1rmBest.values()];
}

/**
 * Decide which candidates beat the currently-stored PRs.
 *
 * `existing` is keyed by `prDocId(...)`. A candidate counts as a new PR if:
 *   - no existing doc with that id exists, OR
 *   - bucket PR: candidate.weightKg > existing.weightKg (strict), OR
 *     bucket PR ties weight but exceeds existing.reps.
 *   - e1rm PR: candidate.metric > existing.e1RMKg (strict). Ties don't count
 *     — we don't spam the feed with identical-e1RM duplicates.
 *
 * Returns the subset of `candidates` that should be written.
 */
export function diffAgainstExisting(
  candidates: CandidatePR[],
  existing: Map<string, PRDocExt>,
): CandidatePR[] {
  const out: CandidatePR[] = [];
  for (const c of candidates) {
    const id = prDocId(c.exerciseId, c.kind, c.bucket);
    const prev = existing.get(id);
    if (!prev) {
      out.push(c);
      continue;
    }
    if (c.kind === "bucket") {
      if (
        c.weightKg > prev.weightKg ||
        (c.weightKg === prev.weightKg && c.reps > prev.reps)
      ) {
        out.push(c);
      }
    } else {
      // e1rm
      if (c.metric > prev.e1RMKg) {
        out.push(c);
      }
    }
  }
  return out;
}
