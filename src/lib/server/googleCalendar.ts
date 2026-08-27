import { FieldValue } from "firebase-admin/firestore";

import {
  GOOGLE_SYNC_FUTURE_DAYS,
  GOOGLE_SYNC_PAST_DAYS,
  buildSyncWindow,
  mapGoogleEventToCalendarItems,
  type GoogleCalendarEvent,
} from "@/lib/integrations/googleCalendar";
import { getAdminDb } from "@/lib/server/firebaseAdmin";
import { decryptToken, encryptToken } from "@/lib/server/tokenCrypto";

const PROVIDER = "google_calendar";
const MAX_BATCH_WRITES = 450;
const SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.events.readonly",
  "https://www.googleapis.com/auth/calendar.calendarlist.readonly",
];

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  id_token?: string;
  error?: string;
  error_description?: string;
};

type UserInfoResponse = {
  sub?: string;
  email?: string;
  name?: string;
};

type CalendarListResponse = {
  items?: Array<{
    id?: string;
    summary?: string;
    primary?: boolean;
    accessRole?: string;
    backgroundColor?: string;
    selected?: boolean;
  }>;
};

type EventsResponse = {
  items?: GoogleCalendarEvent[];
};

export type GoogleCalendarOption = {
  id: string;
  summary: string;
  primary: boolean;
  accessRole?: string;
  backgroundColor?: string;
  selected?: boolean;
};

async function commitBatched(
  db: FirebaseFirestore.Firestore,
  writes: Array<(batch: FirebaseFirestore.WriteBatch) => void>,
) {
  for (let index = 0; index < writes.length; index += MAX_BATCH_WRITES) {
    const batch = db.batch();
    for (const write of writes.slice(index, index + MAX_BATCH_WRITES)) {
      write(batch);
    }
    await batch.commit();
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) throw new Error(`${key} is not configured.`);
  return value;
}

export function getGoogleRedirectUri(request: Request): string {
  if (process.env.GOOGLE_CALENDAR_REDIRECT_URI) {
    return process.env.GOOGLE_CALENDAR_REDIRECT_URI;
  }
  const url = new URL(request.url);
  return `${url.origin}/api/integrations/google-calendar/callback`;
}

export async function createGoogleCalendarAuthUrl(
  request: Request,
  uid: string,
) {
  const state = crypto.randomUUID();
  const db = getAdminDb();
  await db.collection("oauthStates").doc(state).set({
    uid,
    provider: PROVIDER,
    createdAt: FieldValue.serverTimestamp(),
    expiresAtMs: Date.now() + 10 * 60 * 1000,
  });

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", requireEnv("GOOGLE_CALENDAR_CLIENT_ID"));
  authUrl.searchParams.set("redirect_uri", getGoogleRedirectUri(request));
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent");
  authUrl.searchParams.set("include_granted_scopes", "true");
  authUrl.searchParams.set("scope", SCOPES.join(" "));
  authUrl.searchParams.set("state", state);

  return authUrl.toString();
}

export async function consumeOAuthState(state: string): Promise<string> {
  const db = getAdminDb();
  const ref = db.collection("oauthStates").doc(state);
  const snap = await ref.get();
  await ref.delete().catch(() => undefined);

  const data = snap.data();
  if (
    !snap.exists ||
    data?.provider !== PROVIDER ||
    typeof data.uid !== "string" ||
    typeof data.expiresAtMs !== "number" ||
    data.expiresAtMs < Date.now()
  ) {
    throw new Error("Google Calendar connection expired. Try connecting again.");
  }

  return data.uid;
}

async function exchangeCodeForTokens(request: Request, code: string) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      redirect_uri: getGoogleRedirectUri(request),
      grant_type: "authorization_code",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Token exchange failed.");
  }
  if (!json.refresh_token) {
    throw new Error("Google did not return a refresh token. Revoke access and reconnect.");
  }
  return json;
}

async function refreshAccessToken(uid: string): Promise<string> {
  const db = getAdminDb();
  const secretSnap = await db.collection("integrationSecrets").doc(`${uid}_${PROVIDER}`).get();
  const encryptedRefreshToken = secretSnap.data()?.refreshToken;
  if (typeof encryptedRefreshToken !== "string") {
    throw new Error("Google Calendar is not connected.");
  }

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: requireEnv("GOOGLE_CALENDAR_CLIENT_ID"),
      client_secret: requireEnv("GOOGLE_CALENDAR_CLIENT_SECRET"),
      refresh_token: decryptToken(encryptedRefreshToken),
      grant_type: "refresh_token",
    }),
    cache: "no-store",
  });
  const json = (await res.json()) as TokenResponse;
  if (!res.ok || !json.access_token) {
    throw new Error(json.error_description || json.error || "Failed to refresh Google token.");
  }
  return json.access_token;
}

async function fetchGoogleJson<T>(url: string, accessToken: string): Promise<T> {
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
  });
  const json = await res.json();
  if (!res.ok) {
    const message =
      typeof json?.error?.message === "string"
        ? json.error.message
        : "Google Calendar API request failed.";
    throw new Error(message);
  }
  return json as T;
}

export async function finishGoogleCalendarConnection(
  request: Request,
  state: string,
  code: string,
) {
  const uid = await consumeOAuthState(state);
  const tokens = await exchangeCodeForTokens(request, code);
  const userInfo = await fetchGoogleJson<UserInfoResponse>(
    "https://openidconnect.googleapis.com/v1/userinfo",
    tokens.access_token!,
  );

  const db = getAdminDb();
  const now = FieldValue.serverTimestamp();
  await db.collection("integrationSecrets").doc(`${uid}_${PROVIDER}`).set(
    {
      uid,
      provider: PROVIDER,
      googleSubject: userInfo.sub ?? null,
      accountEmail: userInfo.email ?? null,
      accountName: userInfo.name ?? null,
      refreshToken: encryptToken(tokens.refresh_token!),
      scope: tokens.scope ?? SCOPES.join(" "),
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await db.doc(`users/${uid}/integrations/${PROVIDER}`).set(
    {
      provider: PROVIDER,
      status: "connected",
      accountEmail: userInfo.email ?? null,
      accountName: userInfo.name ?? null,
      selectedCalendarIds: ["primary"],
      syncWindowPastDays: GOOGLE_SYNC_PAST_DAYS,
      syncWindowFutureDays: GOOGLE_SYNC_FUTURE_DAYS,
      lastSyncError: null,
      createdAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  return uid;
}

export async function getGoogleCalendarStatus(uid: string) {
  const snap = await getAdminDb().doc(`users/${uid}/integrations/${PROVIDER}`).get();
  return snap.exists ? snap.data() : { provider: PROVIDER, status: "disconnected" };
}

export async function listGoogleCalendars(uid: string): Promise<GoogleCalendarOption[]> {
  const accessToken = await refreshAccessToken(uid);
  const url = "https://www.googleapis.com/calendar/v3/users/me/calendarList";
  const data = await fetchGoogleJson<CalendarListResponse>(url, accessToken);
  return (data.items ?? [])
    .filter((item) => item.id && item.summary)
    .map((item) => ({
      id: item.id!,
      summary: item.summary!,
      primary: item.primary === true,
      accessRole: item.accessRole,
      backgroundColor: item.backgroundColor,
      selected: item.selected,
    }));
}

export async function saveSelectedCalendars(uid: string, calendarIds: string[]) {
  const selectedCalendarIds = Array.from(
    new Set(calendarIds.map((id) => id.trim()).filter(Boolean)),
  );
  await getAdminDb().doc(`users/${uid}/integrations/${PROVIDER}`).set(
    {
      selectedCalendarIds:
        selectedCalendarIds.length > 0 ? selectedCalendarIds : ["primary"],
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}

export async function disconnectGoogleCalendar(uid: string) {
  const db = getAdminDb();
  const imported = await db
    .collection(`users/${uid}/calendarItems`)
    .where("externalSource", "==", PROVIDER)
    .get();
  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  imported.docs.forEach((doc) => {
    writes.push((batch) => batch.delete(doc.ref));
  });
  writes.push((batch) =>
    batch.delete(db.collection("integrationSecrets").doc(`${uid}_${PROVIDER}`)),
  );
  writes.push((batch) =>
    batch.set(
      db.doc(`users/${uid}/integrations/${PROVIDER}`),
      {
        provider: PROVIDER,
        status: "disconnected",
        selectedCalendarIds: [],
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  );
  await commitBatched(db, writes);
  return { deletedImportedEvents: imported.size };
}

export async function syncGoogleCalendar(uid: string) {
  const db = getAdminDb();
  const integrationRef = db.doc(`users/${uid}/integrations/${PROVIDER}`);
  const integrationSnap = await integrationRef.get();
  const integration = integrationSnap.data();
  if (integration?.status !== "connected" && integration?.status !== "error") {
    throw new Error("Google Calendar is not connected.");
  }

  const selectedCalendarIds =
    Array.isArray(integration.selectedCalendarIds) &&
    integration.selectedCalendarIds.length > 0
      ? integration.selectedCalendarIds.filter(
          (id: unknown): id is string => typeof id === "string",
        )
      : ["primary"];
  const profileSnap = await db.doc(`users/${uid}/profile/profile`).get();
  const userTimeZone =
    typeof profileSnap.data()?.timezone === "string"
      ? profileSnap.data()!.timezone
      : "UTC";
  const accessToken = await refreshAccessToken(uid);
  const window = buildSyncWindow();
  const importedItems = new Map<string, ReturnType<typeof mapGoogleEventToCalendarItems>[number]>();

  for (const calendarId of selectedCalendarIds) {
    const url = new URL(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendarId)}/events`,
    );
    url.searchParams.set("timeMin", window.timeMin);
    url.searchParams.set("timeMax", window.timeMax);
    url.searchParams.set("singleEvents", "true");
    url.searchParams.set("orderBy", "startTime");
    url.searchParams.set("showDeleted", "false");
    url.searchParams.set("maxResults", "2500");

    const data = await fetchGoogleJson<EventsResponse>(url.toString(), accessToken);
    for (const event of data.items ?? []) {
      const mapped = mapGoogleEventToCalendarItems({
        calendarId,
        event,
        userTimeZone,
      });
      for (const item of mapped) importedItems.set(item.id, item);
    }
  }

  const existing = await db
    .collection(`users/${uid}/calendarItems`)
    .where("externalSource", "==", PROVIDER)
    .get();

  const writes: Array<(batch: FirebaseFirestore.WriteBatch) => void> = [];
  let upserted = 0;
  let deleted = 0;
  const seenIds = new Set(importedItems.keys());

  for (const item of importedItems.values()) {
    writes.push((batch) =>
      batch.set(
        db.doc(`users/${uid}/calendarItems/${item.id}`),
        {
          ...item.data,
          createdAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
          externalSyncedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      ),
    );
    upserted += 1;
  }

  for (const doc of existing.docs) {
    const data = doc.data();
    const date = typeof data.date === "string" ? data.date : "";
    const selected = selectedCalendarIds.includes(data.externalCalendarId);
    if (
      selected &&
      date >= window.startDate &&
      date <= window.endDate &&
      !seenIds.has(doc.id)
    ) {
      writes.push((batch) => batch.delete(doc.ref));
      deleted += 1;
    }
  }

  writes.push((batch) =>
    batch.set(
      integrationRef,
      {
        status: "connected",
        lastSyncAt: FieldValue.serverTimestamp(),
        lastSyncError: null,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  );

  await commitBatched(db, writes);
  return { upserted, deleted };
}

export async function markGoogleCalendarSyncError(uid: string, message: string) {
  await getAdminDb().doc(`users/${uid}/integrations/${PROVIDER}`).set(
    {
      status: "error",
      lastSyncError: message,
      updatedAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
}
