import { NextResponse } from "next/server";

import { requireUid } from "@/lib/server/firebaseAdmin";
import {
  disconnectGoogleCalendar,
  getGoogleCalendarStatus,
} from "@/lib/server/googleCalendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  try {
    const uid = await requireUid(request);
    const status = await getGoogleCalendarStatus(uid);
    return NextResponse.json({ status });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to load Google Calendar status." },
      { status: 500 },
    );
  }
}

export async function DELETE(request: Request) {
  try {
    const uid = await requireUid(request);
    const result = await disconnectGoogleCalendar(uid);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to disconnect Google Calendar." },
      { status: 500 },
    );
  }
}
