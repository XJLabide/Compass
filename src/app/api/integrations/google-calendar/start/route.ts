import { NextResponse } from "next/server";

import { requireUid } from "@/lib/server/firebaseAdmin";
import { createGoogleCalendarAuthUrl } from "@/lib/server/googleCalendar";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
  try {
    const uid = await requireUid(request);
    const authUrl = await createGoogleCalendarAuthUrl(request, uid);
    return NextResponse.json({ authUrl });
  } catch (err) {
    if (err instanceof Response) return err;
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to start Google Calendar connection." },
      { status: 500 },
    );
  }
}
