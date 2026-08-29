import {
  applicationDefault,
  cert,
  getApps,
  initializeApp,
} from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

export class FirebaseAdminConfigError extends Error {
  constructor() {
    super(
      "Firebase Admin credentials are not configured. Add FIREBASE_SERVICE_ACCOUNT_JSON in production.",
    );
    this.name = "FirebaseAdminConfigError";
  }
}

function getAdminProjectId(): string | undefined {
  return (
    process.env.FIREBASE_PROJECT_ID ||
    process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID
  );
}

function initAdminApp() {
  const app = getApps()[0];
  if (app) return app;

  const serviceAccountJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (serviceAccountJson) {
    return initializeApp({
      credential: cert(JSON.parse(serviceAccountJson)),
      projectId: getAdminProjectId(),
    });
  }

  if (process.env.VERCEL) {
    throw new FirebaseAdminConfigError();
  }

  return initializeApp({
    credential: applicationDefault(),
    projectId: getAdminProjectId(),
  });
}

export function getAdminAuth() {
  return getAuth(initAdminApp());
}

export function getAdminDb() {
  const dbId = process.env.NEXT_PUBLIC_FIREBASE_DB_ID;
  if (dbId && dbId !== "(default)") {
    return getFirestore(initAdminApp(), dbId);
  }
  return getFirestore(initAdminApp());
}

export async function requireUid(request: Request): Promise<string> {
  const auth = request.headers.get("authorization") ?? "";
  const token = auth.match(/^Bearer\s+(.+)$/i)?.[1];
  if (!token) {
    throw new Response("Missing authorization token.", { status: 401 });
  }

  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return decoded.uid;
  } catch (err) {
    if (err instanceof FirebaseAdminConfigError) {
      throw err;
    }
    throw new Response("Invalid authorization token.", { status: 401 });
  }
}

export function isFirebaseAdminConfigError(
  err: unknown,
): err is FirebaseAdminConfigError {
  return err instanceof FirebaseAdminConfigError;
}

export function googleCalendarSetupRequiredStatus() {
  return {
    provider: "google_calendar",
    status: "disconnected",
    setupRequired: true,
    setupMessage:
      "Firebase Admin credentials are missing in production. Add FIREBASE_SERVICE_ACCOUNT_JSON, then reconnect.",
  } as const;
}
