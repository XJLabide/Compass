import { NextResponse } from "next/server";

import {
  googleCalendarSetupRequiredStatus,
  isFirebaseAdminConfigError,
  requireUid,
} from "@/lib/server/firebaseAdmin";
import {
  listGoogleCalendars,
  saveSelectedCalendars,
} from "@/lib/server/googleCalendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const uid = await requireUid(request);
    const calendars = await listGoogleCalendars(uid);
    return NextResponse.json({ calendars });
  } catch (err) {
    if (err instanceof Response) return err;
    if (isFirebaseAdminConfigError(err)) {
      return NextResponse.json(
        { error: googleCalendarSetupRequiredStatus().setupMessage },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error: err instanceof Error ? err.message : "Failed to load calendars.",
      },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  try {
    const uid = await requireUid(request);
    const body = (await request.json()) as { calendarIds?: unknown };
    const calendarIds = Array.isArray(body.calendarIds)
      ? body.calendarIds.filter((id): id is string => typeof id === "string")
      : [];
    await saveSelectedCalendars(uid, calendarIds);
    return NextResponse.json({ selectedCalendarIds: calendarIds });
  } catch (err) {
    if (err instanceof Response) return err;
    if (isFirebaseAdminConfigError(err)) {
      return NextResponse.json(
        { error: googleCalendarSetupRequiredStatus().setupMessage },
        { status: 503 },
      );
    }
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Failed to save calendar selection.",
      },
      { status: 500 },
    );
  }
}
