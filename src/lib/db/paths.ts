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
  goalConverter,
  noriMessageConverter,
  noriThreadConverter,
  prConverter,
  profileConverter,
  projectConverter,
  programConverter,
  recurringFeeConverter,
  routineConverter,
  sessionConverter,
  todoConverter,
  portfolioConverter,
  accountConverter,
  budgetConverter,
  calendarItemConverter,
} from "./converters";
import type {
  BudgetDoc,
  CalendarItemDoc,
  DailyDoc,
  Exercise,
  ExpenseDoc,
  GoalDoc,
  LocalDate,
  NoriMessage,
  NoriThread,
  PRDoc,
  Profile,
  ProjectDoc,
  ProgramDoc,
  RecurringFeeDoc,
  RoutineDoc,
  SessionDoc,
  TodoDoc,
  PortfolioHoldingDoc,
  AccountBalanceDoc,
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
// projects — users/{uid}/projects/{projectId}
// ---------------------------------------------------------------------------

export function projectsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<ProjectDoc> {
  return collection(userDoc(uid, db), "projects").withConverter(
    projectConverter,
  );
}

export function projectPath(
  uid: string,
  projectId: string,
  db?: Firestore,
): DocumentReference<ProjectDoc> {
  return doc(userDoc(uid, db), "projects", projectId).withConverter(
    projectConverter,
  );
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
// goals — users/{uid}/goals/{goalId}
// ---------------------------------------------------------------------------

export function goalsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<GoalDoc> {
  return collection(userDoc(uid, db), "goals").withConverter(goalConverter);
}

export function goalPath(
  uid: string,
  goalId: string,
  db?: Firestore,
): DocumentReference<GoalDoc> {
  return doc(userDoc(uid, db), "goals", goalId).withConverter(goalConverter);
}

// ---------------------------------------------------------------------------
// calendarItems — users/{uid}/calendarItems/{itemId}
// ---------------------------------------------------------------------------

export function calendarItemsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<CalendarItemDoc> {
  return collection(userDoc(uid, db), "calendarItems").withConverter(
    calendarItemConverter,
  );
}

export function calendarItemPath(
  uid: string,
  itemId: string,
  db?: Firestore,
): DocumentReference<CalendarItemDoc> {
  return doc(userDoc(uid, db), "calendarItems", itemId).withConverter(
    calendarItemConverter,
  );
}

// ---------------------------------------------------------------------------
// budgets — users/{uid}/budgets/{budgetId}
// ---------------------------------------------------------------------------

export function budgetsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<BudgetDoc> {
  return collection(userDoc(uid, db), "budgets").withConverter(
    budgetConverter,
  );
}

export function budgetPath(
  uid: string,
  budgetId: string,
  db?: Firestore,
): DocumentReference<BudgetDoc> {
  return doc(userDoc(uid, db), "budgets", budgetId).withConverter(
    budgetConverter,
  );
}

// ---------------------------------------------------------------------------
// recurringFees — users/{uid}/recurringFees/{feeId}
// ---------------------------------------------------------------------------

export function recurringFeesPath(
  uid: string,
  db?: Firestore,
): CollectionReference<RecurringFeeDoc> {
  return collection(userDoc(uid, db), "recurringFees").withConverter(
    recurringFeeConverter,
  );
}

export function recurringFeePath(
  uid: string,
  feeId: string,
  db?: Firestore,
): DocumentReference<RecurringFeeDoc> {
  return doc(userDoc(uid, db), "recurringFees", feeId).withConverter(
    recurringFeeConverter,
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
  return collection(userDoc(uid, db), "noriThreads").withConverter(
    noriThreadConverter,
  );
}

export function noriThreadPath(
  uid: string,
  threadId: string,
  db?: Firestore,
): DocumentReference<NoriThread> {
  return doc(userDoc(uid, db), "noriThreads", threadId).withConverter(
    noriThreadConverter,
  );
}

export function noriMessagesPath(
  uid: string,
  threadId: string,
  db?: Firestore,
): CollectionReference<NoriMessage> {
  return collection(
    userDoc(uid, db),
    "noriThreads",
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
    "noriThreads",
    threadId,
    "messages",
    messageId,
  ).withConverter(noriMessageConverter);
}

// ---------------------------------------------------------------------------
// portfolio — users/{uid}/portfolio/{holdingId}
// ---------------------------------------------------------------------------

export function portfolioPath(
  uid: string,
  db?: Firestore,
): CollectionReference<PortfolioHoldingDoc> {
  return collection(userDoc(uid, db), "portfolio").withConverter(
    portfolioConverter,
  );
}

export function holdingPath(
  uid: string,
  holdingId: string,
  db?: Firestore,
): DocumentReference<PortfolioHoldingDoc> {
  return doc(userDoc(uid, db), "portfolio", holdingId).withConverter(
    portfolioConverter,
  );
}

// ---------------------------------------------------------------------------
// accounts — users/{uid}/accounts/{accountId}
// ---------------------------------------------------------------------------

export function accountsPath(
  uid: string,
  db?: Firestore,
): CollectionReference<AccountBalanceDoc> {
  return collection(userDoc(uid, db), "accounts").withConverter(
    accountConverter,
  );
}

export function accountPath(
  uid: string,
  accountId: string,
  db?: Firestore,
): DocumentReference<AccountBalanceDoc> {
  return doc(userDoc(uid, db), "accounts", accountId).withConverter(
    accountConverter,
  );
}
