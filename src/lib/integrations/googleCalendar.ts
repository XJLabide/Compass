import type { CalendarEventItemDoc, LocalDate } from "@/lib/db/types";

export const GOOGLE_CALENDAR_PROVIDER = "google_calendar" as const;
export const GOOGLE_SYNC_PAST_DAYS = 30;
export const GOOGLE_SYNC_FUTURE_DAYS = 90;

export type GoogleCalendarEventDate = {
  date?: string;
  dateTime?: string;
  timeZone?: string;
};

export type GoogleCalendarEvent = {
  id: string;
  recurringEventId?: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  updated?: string;
  start?: GoogleCalendarEventDate;
  end?: GoogleCalendarEventDate;
};

export type MappedGoogleCalendarItem = {
  id: string;
  data: Omit<
    CalendarEventItemDoc,
    "createdAt" | "updatedAt" | "externalSyncedAt"
  >;
};

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

function toDocSafeId(value: string): string {
  return Buffer.from(value).toString("base64url").slice(0, 120);
}

export function googleCalendarItemId(
  calendarId: string,
  eventId: string,
  localDate?: string,
): string {
  return `gcal_${toDocSafeId([calendarId, eventId, localDate ?? ""].join("|"))}`;
}

function formatInTimeZone(
  value: string,
  timeZone: string,
): { localDate: LocalDate; time: string } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(new Date(value));

  const map = parts.reduce<Record<string, string>>((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});

  return {
    localDate: `${map.year}-${map.month}-${map.day}`,
    time: `${map.hour}:${map.minute}`,
  };
}

function addDaysIso(iso: string, days: number): string {
  const date = new Date(`${iso}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function enumerateAllDayDates(startDate: string, exclusiveEndDate?: string) {
  const dates: string[] = [];
  const end =
    exclusiveEndDate && exclusiveEndDate > startDate
      ? exclusiveEndDate
      : addDaysIso(startDate, 1);
  for (let cursor = startDate; cursor < end; cursor = addDaysIso(cursor, 1)) {
    dates.push(cursor);
  }
  return dates;
}

export function mapGoogleEventToCalendarItems({
  calendarId,
  event,
  userTimeZone,
}: {
  calendarId: string;
  event: GoogleCalendarEvent;
  userTimeZone: string;
}): MappedGoogleCalendarItem[] {
  if (event.status === "cancelled") return [];
  if (!event.id || !event.start) return [];

  const externalEventId = event.recurringEventId ?? event.id;
  const title = event.summary?.trim() || "(No title)";
  const base = {
    type: "event" as const,
    title,
    active: true,
    recurrence: "none" as const,
    externalSource: GOOGLE_CALENDAR_PROVIDER,
    externalCalendarId: calendarId,
    externalEventId,
    externalInstanceId: event.id,
    ...(event.location?.trim() ? { location: event.location.trim() } : {}),
    ...(event.htmlLink ? { externalUrl: event.htmlLink } : {}),
    ...(event.updated ? { externalUpdatedAt: event.updated } : {}),
  };

  if (event.start.date) {
    return enumerateAllDayDates(event.start.date, event.end?.date).map(
      (localDate) => ({
        id: googleCalendarItemId(calendarId, event.id, localDate),
        data: {
          ...base,
          date: localDate,
        },
      }),
    );
  }

  if (!event.start.dateTime) return [];
  const start = formatInTimeZone(event.start.dateTime, userTimeZone);
  const end = event.end?.dateTime
    ? formatInTimeZone(event.end.dateTime, userTimeZone)
    : null;

  return [
    {
      id: googleCalendarItemId(calendarId, event.id),
      data: {
        ...base,
        date: start.localDate,
        startTime: start.time,
        ...(end ? { endTime: end.time } : {}),
      },
    },
  ];
}

export function buildSyncWindow(now = new Date()) {
  const start = new Date(now);
  start.setUTCDate(start.getUTCDate() - GOOGLE_SYNC_PAST_DAYS);
  start.setUTCHours(0, 0, 0, 0);

  const end = new Date(now);
  end.setUTCDate(end.getUTCDate() + GOOGLE_SYNC_FUTURE_DAYS);
  end.setUTCHours(23, 59, 59, 999);

  return {
    timeMin: start.toISOString(),
    timeMax: end.toISOString(),
    startDate: start.toISOString().slice(0, 10),
    endDate: end.toISOString().slice(0, 10),
  };
}
