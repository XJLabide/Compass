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
  prConverter,
  profileConverter,
  programConverter,
  sessionConverter,
} from "./converters";
import type {
  DailyDoc,
  Exercise,
  LocalDate,
  PRDoc,
  Profile,
  ProgramDoc,
  SessionDoc,
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
