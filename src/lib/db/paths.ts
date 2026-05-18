import {
  collection,
  doc,
  type CollectionReference,
  type DocumentReference,
  type Firestore,
} from "firebase/firestore";

import { getFirebaseDb } from "@/lib/firebase";

import {
  dailyConverter,
  exerciseConverter,
  expenseConverter,
  noriMessageConverter,
  noriThreadConverter,
  prConverter,
  profileConverter,
  programConverter,
  routineConverter,
  sessionConverter,
  todoConverter,
} from "./converters";
import type {
  DailyDoc,
  Exercise,
  ExpenseDoc,
  LocalDate,
  NoriMessage,
  NoriThread,
  PRDoc,
  Profile,
  ProgramDoc,
  RoutineDoc,
  SessionDoc,
  TodoDoc,
} from "./types";

/**
 * Typed Firestore path builders.
 *
 * Every builder accepts a `uid` and returns a `DocumentReference<T>` or
 * `CollectionReference<T>` pre-attached to the appropriate `withConverter`,
 * so callers never need a cast and never need to thread generics.
 *
 * The `db` argument is optional and defaults to the app's Firestore singleton.
 * Passing it explicitly is useful for tests and for the (future) emulator
 * harness.
 */

// ---------------------------------------------------------------------------
// users/{uid}
// ---------------------------------------------------------------------------

function userDoc(uid: string, db: Firestore = getFirebaseDb()) {
  return doc(db, "users", uid);
}

// ---------------------------------------------------------------------------
// profile  — users/{uid}/profile/profile (single doc)
// ---------------------------------------------------------------------------

/** Conventional id of the singleton profile document. */
export const PROFILE_DOC_ID = "profile";

export function profilePath(
  uid: string,
  db?: Firestore,
): DocumentReference<Profile> {
  return doc(userDoc(uid, db), "profile", PROFILE_DOC_ID).withConverter(
    profileConverter,
  );
}

// ---------------------------------------------------------------------------
// program — users/{uid}/program/active (single doc, id = "active")
// ---------------------------------------------------------------------------

/** Conventional id of the active program document. */
export const ACTIVE_PROGRAM_DOC_ID = "active";

export function programPath(
  uid: string,
  db?: Firestore,
): DocumentReference<ProgramDoc> {
  return doc(userDoc(uid, db), "program", ACTIVE_PROGRAM_DOC_ID).withConverter(
    programConverter,
  );
}

// ---------------------------------------------------------------------------
// exercises — users/{uid}/exercises/{exerciseId}
// ---------------------------------------------------------------------------

export function exercisesPath(
  uid: string,
  db?: Firestore,
): CollectionReference<Exercise> {
  return collection(userDoc(uid, db), "exercises").withConverter(
    exerciseConverter,
  );
}

export function exercisePath(
  uid: string,
  exerciseId: string,
  db?: Firestore,
): DocumentReference<Exercise> {
  return doc(userDoc(uid, db), "exercises", exerciseId).withConverter(
    exerciseConverter,
  );
}

// ---------------------------------------------------------------------------
// sessions — users/{uid}/sessions/{sessionId}
// ---------------------------------------------------------------------------

export function sessionsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<SessionDoc> {
  return collection(userDoc(uid, db), "sessions").withConverter(
    sessionConverter,
  );
}

export function sessionPath(
  uid: string,
  sessionId: string,
  db?: Firestore,
): DocumentReference<SessionDoc> {
  return doc(userDoc(uid, db), "sessions", sessionId).withConverter(
    sessionConverter,
  );
}

// ---------------------------------------------------------------------------
// daily — users/{uid}/daily/{YYYY-MM-DD}
// ---------------------------------------------------------------------------

export function dailyCollectionPath(
  uid: string,
  db?: Firestore,
): CollectionReference<DailyDoc> {
  return collection(userDoc(uid, db), "daily").withConverter(dailyConverter);
}

export function dailyPath(
  uid: string,
  localDate: LocalDate,
  db?: Firestore,
): DocumentReference<DailyDoc> {
  return doc(userDoc(uid, db), "daily", localDate).withConverter(
    dailyConverter,
  );
}

// ---------------------------------------------------------------------------
// prs — users/{uid}/prs/{prId}
// ---------------------------------------------------------------------------

export function prsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<PRDoc> {
  return collection(userDoc(uid, db), "prs").withConverter(prConverter);
}

export function prPath(
  uid: string,
  prId: string,
  db?: Firestore,
): DocumentReference<PRDoc> {
  return doc(userDoc(uid, db), "prs", prId).withConverter(prConverter);
}

// ---------------------------------------------------------------------------
// todos — users/{uid}/todos/{todoId}
// ---------------------------------------------------------------------------

export function todosPath(
  uid: string,
  db?: Firestore,
): CollectionReference<TodoDoc> {
  return collection(userDoc(uid, db), "todos").withConverter(todoConverter);
}

export function todoPath(
  uid: string,
  todoId: string,
  db?: Firestore,
): DocumentReference<TodoDoc> {
  return doc(userDoc(uid, db), "todos", todoId).withConverter(todoConverter);
}

// ---------------------------------------------------------------------------
// expenses — users/{uid}/expenses/{expenseId}
// ---------------------------------------------------------------------------

export function expensesPath(
  uid: string,
  db?: Firestore,
): CollectionReference<ExpenseDoc> {
  return collection(userDoc(uid, db), "expenses").withConverter(
    expenseConverter,
  );
}

export function expensePath(
  uid: string,
  expenseId: string,
  db?: Firestore,
): DocumentReference<ExpenseDoc> {
  return doc(userDoc(uid, db), "expenses", expenseId).withConverter(
    expenseConverter,
  );
}

// ---------------------------------------------------------------------------
// routines — users/{uid}/routines/{routineId}
// ---------------------------------------------------------------------------

export function routinesPath(
  uid: string,
  db?: Firestore,
): CollectionReference<RoutineDoc> {
  return collection(userDoc(uid, db), "routines").withConverter(
    routineConverter,
  );
}

export function routinePath(
  uid: string,
  routineId: string,
  db?: Firestore,
): DocumentReference<RoutineDoc> {
  return doc(userDoc(uid, db), "routines", routineId).withConverter(
    routineConverter,
  );
}

// ---------------------------------------------------------------------------
// nori — users/{uid}/nori/threads/{threadId} + .../messages/{msgId}
// ---------------------------------------------------------------------------

export function noriThreadsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<NoriThread> {
  return collection(userDoc(uid, db), "nori", "_root", "threads").withConverter(
    noriThreadConverter,
  );
}

export function noriThreadPath(
  uid: string,
  threadId: string,
  db?: Firestore,
): DocumentReference<NoriThread> {
  return doc(
    userDoc(uid, db),
    "nori",
    "_root",
    "threads",
    threadId,
  ).withConverter(noriThreadConverter);
}

export function noriMessagesPath(
  uid: string,
  threadId: string,
  db?: Firestore,
): CollectionReference<NoriMessage> {
  return collection(
    userDoc(uid, db),
    "nori",
    "_root",
    "threads",
    threadId,
    "messages",
  ).withConverter(noriMessageConverter);
}

export function noriMessagePath(
  uid: string,
  threadId: string,
  messageId: string,
  db?: Firestore,
): DocumentReference<NoriMessage> {
  return doc(
    userDoc(uid, db),
    "nori",
    "_root",
    "threads",
    threadId,
    "messages",
    messageId,
  ).withConverter(noriMessageConverter);
}
