import type { Timestamp } from "firebase/firestore";

/**
 * Canonical Firestore schema for Personal Tracker.
 *
 * Conventions (do not break):
 *   - Stored units are canonical: weight in **kg**, water in **ml**, protein in **g**.
 *     Display layers convert to imperial when `Profile.unitSystem === "imperial"`.
 *   - `localDate` is a `YYYY-MM-DD` string computed client-side in the user's IANA
 *     timezone, stored alongside server `Timestamp`s on `daily` and `sessions`
 *     docs. This is the anchor for the "today" rollover and ordering.
 *   - All collections are scoped under `users/{uid}/...`.
 *   - Document IDs are documented per collection (see `paths.ts`).
 */

// ---------------------------------------------------------------------------
// Shared primitives
// ---------------------------------------------------------------------------

/** ISO `YYYY-MM-DD` in the user's IANA timezone (client-computed). */
export type LocalDate = string;

/** IANA timezone identifier, e.g. `"America/New_York"`. */
export type Timezone = string;

export type UnitSystem = "imperial" | "metric";

export type ExerciseCategory =
  | "compound"
  | "isolation"
  | "accessory"
  | "cardio"
  | "other";

export type MuscleGroup =
  | "chest"
  | "back"
  | "shoulders"
  | "biceps"
  | "triceps"
  | "quads"
  | "hamstrings"
  | "glutes"
  | "calves"
  | "core"
  | "forearms"
  | "other";

// ---------------------------------------------------------------------------
// users/{uid}/profile  (single doc, id = "profile")
// ---------------------------------------------------------------------------

export interface Profile {
  displayName: string;
  /** Display preference only. Stored numbers are always canonical (kg/ml/g). */
  unitSystem: UnitSystem;
  /** Daily protein target in grams. */
  proteinTargetG: number;
  /** Weekly bodyweight gain target in **pounds**. Stored as-entered for v1. */
  weeklyGainLb: number;
  /** IANA timezone, e.g. `"America/New_York"`. Anchors localDate computation. */
  timezone: Timezone;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/program/active  (single doc, id = "active")
// ---------------------------------------------------------------------------

export interface PlannedExercise {
  exerciseId: string;
  /** Denormalized exercise name at the time of planning. */
  name: string;
  targetSets: number;
  repRangeLow: number;
  repRangeHigh: number;
  /** 0-based display order within the session. */
  order: number;
}

export interface ProgramSession {
  /** Stable id within the program (e.g. `"upper-a"`). */
  id: string;
  /** Display name, e.g. `"Upper A"`. */
  name: string;
  exercises: PlannedExercise[];
}

export interface ProgramDoc {
  /** Program template name, e.g. `"Upper/Lower"`. */
  name: string;
  sessions: ProgramSession[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/exercises/{exerciseId}
// ---------------------------------------------------------------------------

export interface Exercise {
  name: string;
  primaryMuscle: MuscleGroup;
  category: ExerciseCategory;
  /** True for app-seeded exercises; false for user-added. */
  seeded?: boolean;
  createdAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/sessions/{sessionId}
// ---------------------------------------------------------------------------

export interface LoggedSet {
  exerciseId: string;
  /** Canonical weight in **kg**. */
  weightKg: number;
  reps: number;
  /** RPE 1..10, optional. */
  rpe?: number;
  /** Flagged at write time when this set sets a new PR for the exercise. */
  isPR?: boolean;
  /** 0-based order across the whole session (or per-exercise; consumer decides). */
  order: number;
}

/** Session lifecycle. `in_progress` is the live-logger state; `completed` is finalized. */
export type SessionStatus = "in_progress" | "completed";

export interface SessionDoc {
  /** Client-computed `YYYY-MM-DD` in user tz. */
  localDate: LocalDate;
  /** Server timestamp the session was recorded. */
  date: Timestamp;
  /** Id from `ProgramDoc.sessions[].id` if logged from a template. */
  programSessionId?: string;
  /** Display name, e.g. `"Upper A"` or a free-form label. */
  name: string;
  /** Lifecycle state. Optional for backward compat with seeded/legacy docs. */
  status?: SessionStatus;
  /** Server timestamp when the user tapped "Start session". */
  startedAt?: Timestamp;
  /** Server timestamp when the user finished the session. */
  finishedAt?: Timestamp;
  durationMin?: number;
  notes?: string;
  sets: LoggedSet[];
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/daily/{YYYY-MM-DD}
// ---------------------------------------------------------------------------

export interface DailyDoc {
  /** Mirrors the doc id (`YYYY-MM-DD`) for query convenience. */
  localDate: LocalDate;
  /** Canonical bodyweight in **kg**. */
  bodyweightKg?: number;
  sleepHours?: number;
  /** 1..5 subjective rating. */
  sleepQuality?: number;
  calories?: number;
  /** Canonical protein intake in **grams**. */
  proteinG?: number;
  /** Canonical water intake in **milliliters**. */
  waterMl?: number;
  steps?: number;
  /** 1..5 subjective rating. */
  mood?: number;
  note?: string;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/prs/{prId}  (denormalized PR feed)
// ---------------------------------------------------------------------------

export interface PRDoc {
  exerciseId: string;
  /** Denormalized exercise name for cheap reads. */
  exerciseName: string;
  /** Canonical weight in **kg**. */
  weightKg: number;
  reps: number;
  /** Estimated 1RM in **kg** (Epley or similar; consumer of write decides). */
  e1RMKg: number;
  sessionId: string;
  /** Client-computed `YYYY-MM-DD` in user tz. */
  localDate: LocalDate;
  date: Timestamp;
  createdAt: Timestamp;
}
