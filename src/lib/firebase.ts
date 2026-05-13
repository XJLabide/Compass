import { getApp, getApps, initializeApp, type FirebaseApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  getAuth,
  setPersistence,
  type Auth,
} from "firebase/auth";
import {
  getFirestore,
  initializeFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  type Firestore,
} from "firebase/firestore";

/**
 * Firebase client singleton.
 *
 * IMPORTANT: This module is client-only. Do NOT import it from server components
 * or route handlers — `firebase/auth` relies on browser globals.
 *
 * Configuration is read from `NEXT_PUBLIC_FIREBASE_*` env vars at first use.
 * When envs are missing (e.g. during initial build before `.env.local` exists),
 * lazy accessors throw with a clear message instead of crashing module load.
 */

type FirebaseHandles = {
  app: FirebaseApp;
  auth: Auth;
  db: Firestore;
};

let handles: FirebaseHandles | null = null;
let persistencePromise: Promise<void> | null = null;
let firestorePersistenceWarned = false;

function readConfig(): FirebaseOptions {
  const config: FirebaseOptions = {
    apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
    authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
    storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
    appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  };

  const missing = (
    [
      ["NEXT_PUBLIC_FIREBASE_API_KEY", config.apiKey],
      ["NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN", config.authDomain],
      ["NEXT_PUBLIC_FIREBASE_PROJECT_ID", config.projectId],
      ["NEXT_PUBLIC_FIREBASE_APP_ID", config.appId],
    ] as const
  )
    .filter(([, value]) => !value)
    .map(([key]) => key);

  if (missing.length > 0) {
    throw new Error(
      `Firebase config missing required env vars: ${missing.join(", ")}. ` +
        `Set them in .env.local (see .env.local.example).`,
    );
  }

  return config;
}

// Firestore database ID. Defaults to "(default)" but can be overridden via
// NEXT_PUBLIC_FIREBASE_DB_ID to support multi-database projects.
const DB_ID = process.env.NEXT_PUBLIC_FIREBASE_DB_ID || "(default)";

function init(): FirebaseHandles {
  if (handles) return handles;

  const isNewApp = getApps().length === 0;
  const app = isNewApp ? initializeApp(readConfig()) : getApp();
  const auth = getAuth(app);

  // Try to enable persistent IndexedDB cache with multi-tab support. Safari
  // private mode and some embedded webviews block IndexedDB; fall back to the
  // default in-memory Firestore in that case so the app still works.
  let db: Firestore;
  if (isNewApp) {
    try {
      db = initializeFirestore(
        app,
        {
          localCache: persistentLocalCache({
            tabManager: persistentMultipleTabManager(),
          }),
        },
        DB_ID,
      );
    } catch (err) {
      if (!firestorePersistenceWarned) {
        firestorePersistenceWarned = true;
        // eslint-disable-next-line no-console
        console.warn(
          "Firestore offline persistence unavailable; falling back to in-memory cache.",
          err,
        );
      }
      db = getFirestore(app, DB_ID);
    }
  } else {
    db = getFirestore(app, DB_ID);
  }

  // Set persistence once; fire-and-forget. Errors are swallowed because the
  // auth instance still works with in-memory persistence as a fallback.
  if (!persistencePromise) {
    persistencePromise = setPersistence(auth, browserLocalPersistence).catch(
      (err: unknown) => {
        // eslint-disable-next-line no-console
        console.warn("Firebase auth persistence setup failed:", err);
      },
    );
  }

  handles = { app, auth, db };
  return handles;
}

export function getFirebase(): FirebaseHandles {
  return init();
}

export function getFirebaseAuth(): Auth {
  return init().auth;
}

export function getFirebaseDb(): Firestore {
  return init().db;
}
