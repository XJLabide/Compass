import { randomUUID } from "node:crypto";
import { deleteApp, initializeApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  deleteUser,
  getAuth,
} from "firebase/auth";
import {
  collection,
  connectFirestoreEmulator,
  deleteDoc,
  doc,
  getDocs,
  getFirestore,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  where,
} from "firebase/firestore";

const projectId = "demo-compass-local";
const email = `rules-check-${randomUUID()}@compass.test`;
const password = `local-${randomUUID()}`;
const today = new Date().toISOString().slice(0, 10);
const monthStart = `${today.slice(0, 7)}-01`;
const monthEnd = new Date(
  Date.UTC(Number(today.slice(0, 4)), Number(today.slice(5, 7)), 0),
)
  .toISOString()
  .slice(0, 10);

const app = initializeApp(
  {
    apiKey: "demo-api-key",
    authDomain: "localhost",
    projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:rules-check",
  },
  `rules-check-${randomUUID()}`,
);
const auth = getAuth(app);
connectAuthEmulator(auth, "http://127.0.0.1:9299", {
  disableWarnings: true,
});
const db = getFirestore(app, "p-tracker");
connectFirestoreEmulator(db, "127.0.0.1", 8281);

let expenseRef;
let testUser;
const timeoutId = setTimeout(() => {
  process.stderr.write(
    "Firestore rules verification timed out. Start the local Firebase emulators and try again.\n",
  );
  process.exit(1);
}, 15_000);

async function expectPermissionDenied(operation, description) {
  try {
    await operation;
  } catch (error) {
    if (error?.code === "permission-denied") return;
    throw error;
  }
  throw new Error(`${description} unexpectedly succeeded`);
}

try {
  const credential = await createUserWithEmailAndPassword(auth, email, password);
  testUser = credential.user;
  expenseRef = doc(
    db,
    "users",
    testUser.uid,
    "expenses",
    `rules-check-${randomUUID()}`,
  );

  await setDoc(expenseRef, {
    amountMinor: 1250,
    currency: "PHP",
    kind: "expense",
    category: "food",
    localDate: today,
    date: serverTimestamp(),
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const ownerQuery = query(
    collection(db, "users", testUser.uid, "expenses"),
    where("localDate", ">=", monthStart),
    where("localDate", "<=", monthEnd),
    orderBy("localDate", "desc"),
  );
  const ownerResults = await getDocs(ownerQuery);
  if (!ownerResults.docs.some((result) => result.id === expenseRef.id)) {
    throw new Error("Owner transaction query did not return the saved expense");
  }

  const allHistoryQuery = query(
    collection(db, "users", testUser.uid, "expenses"),
    orderBy("localDate", "desc"),
  );
  const allHistoryResults = await getDocs(allHistoryQuery);
  if (!allHistoryResults.docs.some((result) => result.id === expenseRef.id)) {
    throw new Error("All-history transaction query did not return the saved expense");
  }

  await expectPermissionDenied(
    getDocs(
      query(
        collection(db, "users", "another-user", "expenses"),
        where("localDate", ">=", monthStart),
        where("localDate", "<=", monthEnd),
        orderBy("localDate", "desc"),
      ),
    ),
    "Cross-user transaction query",
  );

  await expectPermissionDenied(
    setDoc(doc(db, "users", testUser.uid, "expenses", "invalid-amount"), {
      amountMinor: -1,
      currency: "PHP",
      kind: "expense",
      category: "food",
      localDate: today,
    }),
    "Negative transaction amount write",
  );

  process.stdout.write(
    "PASS: budget-period and all-history owner queries, cross-user denial, and invalid-write denial.\n",
  );
} finally {
  clearTimeout(timeoutId);
  if (expenseRef) await deleteDoc(expenseRef).catch(() => {});
  if (testUser) await deleteUser(testUser).catch(() => {});
  await deleteApp(app);
}
