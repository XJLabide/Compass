import { getApps, initializeApp, cert, applicationDefault } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore } from "firebase-admin/firestore";

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
  } catch {
    throw new Response("Invalid authorization token.", { status: 401 });
  }
}
