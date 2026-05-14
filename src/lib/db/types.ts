import type { Timestamp } from "firebase/firestore";

/**
 * Canonical Firestore schema for Compass.
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
  /** ISO 4217 currency code for the money tracker. Defaults to "USD". */
  currency?: string;
  /** Monthly budget caps per category (key is the category string), in minor units of `currency`. */
  budgets?: Record<string, number>;
  /** User-defined expense categories that extend the seeded list. Lowercase, ≤ 32 chars each. */
  customCategories?: string[];
  /** True once the user has completed the onboarding wizard. */
  onboarded?: boolean;
  /** True when the user has opted in to daily reminder notifications. */
  notificationsEnabled?: boolean;
  /** "HH:MM" 24-hour local time for the daily check-in nudge. Defaults to "21:00". */
  reminderTime?: string;
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
  /**
   * Optional custom day-of-week schedule. Keys are stringified DOW indices
   * ("0"=Sun..."6"=Sat). Values are a session.id from `sessions[]` OR `null`
   * for an explicit rest day. When absent, the default mapping is used
   * (see scheduling.ts).
   */
  schedule?: Record<string, string | null>;
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

/** Session lifecycle. `in_progress` is the live-logger state; `completed` is finalized;
 *  `discarded` is a user-abandoned in-progress session (kept for audit, hidden from feeds). */
export type SessionStatus = "in_progress" | "completed" | "discarded";

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
  /** Server timestamp when the session was auto-finalized after 24h of inactivity (recovery path). */
  autoFinalizedAt?: Timestamp;
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
  /** Free-form reflection — what's hard right now. */
  struggles?: string;
  /** Free-form reflection — what went well. */
  wins?: string;
  /** Free-form plan for tomorrow. */
  planTomorrow?: string;
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

// ---------------------------------------------------------------------------
// users/{uid}/todos/{todoId}
// ---------------------------------------------------------------------------

export type TodoPriority = "low" | "medium" | "high";

export type TodoRecurrence = "none" | "daily" | "weekly";

export interface TodoDoc {
  title: string;
  /** Free-text note. Optional. */
  note?: string;
  done: boolean;
  priority?: TodoPriority;
  /** ISO `YYYY-MM-DD` in the user's tz; optional due date. */
  dueDate?: LocalDate;
  /** Server timestamp marking when `done` flipped true. */
  completedAt?: Timestamp;
  /** If set, completion auto-creates the next instance with bumped dueDate. */
  recurrence?: TodoRecurrence;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/routines/{routineId}
// ---------------------------------------------------------------------------

/**
 * A tracked habit with a custom weekly schedule. Unlike a recurring todo,
 * a routine isn't a one-shot task you delete after completion — it's a
 * persistent expectation that tracks streaks over time.
 *
 * `weekdays` is a list of integers 0..6 where 0=Sun, 1=Mon, ..., 6=Sat (matches
 * JS Date.getDay()). Empty list is invalid; "every day" stores [0..6].
 *
 * `done` is a map of localDate (YYYY-MM-DD in user's tz) → true for days
 * the user has checked off. Days not in the map are implicitly not-done.
 * Stored inline on the doc — bounded growth (one entry per scheduled day,
 * well under Firestore's 1MB doc cap for any reasonable lifetime).
 */
export interface RoutineDoc {
  name: string;
  /** 0=Sun..6=Sat */
  weekdays: number[];
  /** Paused routines are listed but not counted in today's progress. */
  active: boolean;
  /** Map of `YYYY-MM-DD` → true for days the user checked it off. */
  done: Record<string, boolean>;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

// ---------------------------------------------------------------------------
// users/{uid}/expenses/{expenseId}
// ---------------------------------------------------------------------------

/** Seeded category set. Stored value on `ExpenseDoc` is a free-form string, so
 *  users can add their own categories from settings. This type is exported as a
 *  convenience for built-in display labels. */
export type ExpenseCategory =
  | "food"
  | "groceries"
  | "transport"
  | "rent"
  | "utilities"
  | "entertainment"
  | "health"
  | "shopping"
  | "savings"
  | "income"
  | "other";

export interface ExpenseDoc {
  /** Amount in minor units of the currency (e.g. cents). Always positive; sign comes from `kind`. */
  amountMinor: number;
  /** ISO 4217 currency code, e.g. "USD", "PHP". Stored as-entered. */
  currency: string;
  /** "expense" subtracts from totals, "income" adds. */
  kind: "expense" | "income";
  /** Category — built-in (`ExpenseCategory`) OR a user-defined custom string. */
  category: string;
  /** Optional short note ("lunch w/ john"). */
  note?: string;
  /** Client-computed `YYYY-MM-DD` in user tz. */
  localDate: LocalDate;
  date: Timestamp;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}
