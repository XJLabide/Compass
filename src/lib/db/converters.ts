import type {
  DocumentData,
  FirestoreDataConverter,
  QueryDocumentSnapshot,
  SnapshotOptions,
} from "firebase/firestore";

import type {
  DailyDoc,
  Exercise,
  ExpenseDoc,
  NoriMessage,
  NoriThread,
  PRDoc,
  Profile,
  ProgramDoc,
  RecurringFeeDoc,
  RoutineDoc,
  SessionDoc,
  TodoDoc,
} from "./types";

/**
 * Firestore data converters for the canonical schema.
 *
 * Each converter is a pass-through for v1: we trust the stored shape matches
 * the TS interface. Field-level validation lives in the security rules
 * (task fn-3-167.2) and at the call site for writes. The converters exist so
 * `db.collection(...).withConverter(...)` reads/writes are fully typed end-to-
 * end and callers never need a manual cast.
 *
 * If we later need to migrate a field (e.g. legacy `weight` → `weightKg`),
 * normalize in `fromFirestore` here so the rest of the app keeps the canonical
 * shape.
 */

function makePassthroughConverter<T extends DocumentData>(): FirestoreDataConverter<T> {
  return {
    toFirestore(value: T): DocumentData {
      return value as DocumentData;
    },
    fromFirestore(
      snapshot: QueryDocumentSnapshot,
      options?: SnapshotOptions,
    ): T {
      return snapshot.data(options) as T;
    },
  };
}

export const profileConverter: FirestoreDataConverter<Profile> =
  makePassthroughConverter<Profile>();

export const programConverter: FirestoreDataConverter<ProgramDoc> =
  makePassthroughConverter<ProgramDoc>();

export const exerciseConverter: FirestoreDataConverter<Exercise> =
  makePassthroughConverter<Exercise>();

export const sessionConverter: FirestoreDataConverter<SessionDoc> =
  makePassthroughConverter<SessionDoc>();

export const dailyConverter: FirestoreDataConverter<DailyDoc> =
  makePassthroughConverter<DailyDoc>();

export const prConverter: FirestoreDataConverter<PRDoc> =
  makePassthroughConverter<PRDoc>();

export const todoConverter: FirestoreDataConverter<TodoDoc> =
  makePassthroughConverter<TodoDoc>();

export const expenseConverter: FirestoreDataConverter<ExpenseDoc> =
  makePassthroughConverter<ExpenseDoc>();

export const recurringFeeConverter: FirestoreDataConverter<RecurringFeeDoc> =
  makePassthroughConverter<RecurringFeeDoc>();

export const routineConverter: FirestoreDataConverter<RoutineDoc> =
  makePassthroughConverter<RoutineDoc>();

export const noriThreadConverter: FirestoreDataConverter<NoriThread> =
  makePassthroughConverter<NoriThread>();

export const noriMessageConverter: FirestoreDataConverter<NoriMessage> =
  makePassthroughConverter<NoriMessage>();
