import { NextResponse } from "next/server";

import {
  googleCalendarSetupRequiredStatus,
  isFirebaseAdminConfigError,
  requireUid,
} from "@/lib/server/firebaseAdmin";
import {
  markGoogleCalendarSyncError,
  syncGoogleCalendar,
} from "@/lib/server/googleCalendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  let uid: string | null = null;
  try {
    uid = await requireUid(request);
    const result = await syncGoogleCalendar(uid);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    if (isFirebaseAdminConfigError(err)) {
      return NextResponse.json(
        { error: googleCalendarSetupRequiredStatus().setupMessage },
        { status: 503 },
      );
    }
    const message =
      err instanceof Error ? err.message : "Failed to sync Google Calendar.";
    if (uid) await markGoogleCalendarSyncError(uid, message).catch(() => undefined);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
