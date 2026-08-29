import { NextResponse } from "next/server";

import { isFirebaseAdminConfigError } from "@/lib/server/firebaseAdmin";
import { finishGoogleCalendarConnection } from "@/lib/server/googleCalendar";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state");
  const code = url.searchParams.get("code");
  const error = url.searchParams.get("error");
  const redirect = new URL("/settings", url.origin);

  if (error) {
    redirect.searchParams.set("googleCalendar", "error");
    redirect.searchParams.set("message", error);
    return NextResponse.redirect(redirect);
  }

  if (!state || !code) {
    redirect.searchParams.set("googleCalendar", "error");
    redirect.searchParams.set("message", "missing_callback_params");
    return NextResponse.redirect(redirect);
  }

  try {
    await finishGoogleCalendarConnection(request, state, code);
    redirect.searchParams.set("googleCalendar", "connected");
  } catch (err) {
    redirect.searchParams.set("googleCalendar", "error");
    redirect.searchParams.set(
      "message",
      isFirebaseAdminConfigError(err)
        ? "server_setup_required"
        : err instanceof Error
          ? err.message
          : "connection_failed",
    );
  }

  return NextResponse.redirect(redirect);
}
