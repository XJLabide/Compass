import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase/app";
import {
  connectAuthEmulator,
  createUserWithEmailAndPassword,
  getAuth,
  signInWithEmailAndPassword,
} from "firebase/auth";
import {
  connectFirestoreEmulator,
  doc,
  getDoc,
  getFirestore,
  serverTimestamp,
  setDoc,
} from "firebase/firestore";

const projectId = "demo-compass-local";
const email = "local-dev@compass.test";
const password = "local-dev-password";
const app = initializeApp(
  {
    apiKey: "demo-api-key",
    authDomain: "localhost",
    projectId,
    storageBucket: `${projectId}.appspot.com`,
    messagingSenderId: "000000000000",
    appId: "1:000000000000:web:local-dev-seed",
  },
  `local-dev-seed-${randomUUID()}`,
);

try {
  const auth = getAuth(app);
  connectAuthEmulator(auth, "http://127.0.0.1:9299", {
    disableWarnings: true,
  });

  let user;
  try {
    ({ user } = await signInWithEmailAndPassword(auth, email, password));
  } catch (error) {
    if (error?.code !== "auth/user-not-found") throw error;
    ({ user } = await createUserWithEmailAndPassword(auth, email, password));
  }

  const db = getFirestore(app, "p-tracker");
  connectFirestoreEmulator(db, "127.0.0.1", 8281);
  const profileRef = doc(db, "users", user.uid, "profile", "profile");
  const profile = await getDoc(profileRef);
  if (!profile.exists()) {
    await setDoc(profileRef, {
      displayName: "Local Developer",
      unitSystem: "metric",
      proteinTargetG: 0,
      weeklyGainLb: 0,
      currency: "PHP",
      timezone: "Asia/Manila",
      routineTimeBlocks: [],
      onboarded: true,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  }

  process.stdout.write(`Local emulator account ready: ${email}\n`);
} finally {
  await deleteApp(app);
}
