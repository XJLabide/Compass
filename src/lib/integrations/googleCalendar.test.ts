import {
  googleCalendarItemId,
  mapGoogleEventToCalendarItems,
} from "./googleCalendar";

describe("mapGoogleEventToCalendarItems", () => {
  test("maps a timed event into one Compass event", () => {
    const [item] = mapGoogleEventToCalendarItems({
      calendarId: "primary",
      userTimeZone: "UTC",
      event: {
        id: "evt-1",
        summary: "Planning",
        location: "Room 1",
        htmlLink: "https://calendar.google.com/event",
        updated: "2026-08-27T01:00:00.000Z",
        start: { dateTime: "2026-08-27T09:30:00Z" },
        end: { dateTime: "2026-08-27T10:15:00Z" },
      },
    });

    expect(item).toEqual({
      id: googleCalendarItemId("primary", "evt-1"),
      data: {
        type: "event",
        title: "Planning",
        location: "Room 1",
        active: true,
        recurrence: "none",
        date: "2026-08-27",
        startTime: "09:30",
        endTime: "10:15",
        externalSource: "google_calendar",
        externalCalendarId: "primary",
        externalEventId: "evt-1",
        externalInstanceId: "evt-1",
        externalUrl: "https://calendar.google.com/event",
        externalUpdatedAt: "2026-08-27T01:00:00.000Z",
      },
    });
  });

  test("maps all-day multi-day events into one item per date", () => {
    const items = mapGoogleEventToCalendarItems({
      calendarId: "primary",
      userTimeZone: "UTC",
      event: {
        id: "evt-2",
        summary: "Conference",
        start: { date: "2026-08-27" },
        end: { date: "2026-08-30" },
      },
    });

    expect(items.map((item) => item.data.date)).toEqual([
      "2026-08-27",
      "2026-08-28",
      "2026-08-29",
    ]);
  });

  test("uses recurringEventId for external event metadata", () => {
    const [item] = mapGoogleEventToCalendarItems({
      calendarId: "work",
      userTimeZone: "UTC",
      event: {
        id: "abc_20260827T090000Z",
        recurringEventId: "abc",
        summary: "Standup",
        start: { dateTime: "2026-08-27T09:00:00Z" },
        end: { dateTime: "2026-08-27T09:15:00Z" },
      },
    });

    expect(item.data.externalEventId).toBe("abc");
    expect(item.data.externalInstanceId).toBe("abc_20260827T090000Z");
  });

  test("skips cancelled events", () => {
    expect(
      mapGoogleEventToCalendarItems({
        calendarId: "primary",
        userTimeZone: "UTC",
        event: {
          id: "evt-3",
          status: "cancelled",
          summary: "Cancelled",
          start: { dateTime: "2026-08-27T09:00:00Z" },
        },
      }),
    ).toEqual([]);
  });

  test("handles timed events with no end time", () => {
    const [item] = mapGoogleEventToCalendarItems({
      calendarId: "primary",
      userTimeZone: "UTC",
      event: {
        id: "evt-4",
        summary: "Reminder",
        start: { dateTime: "2026-08-27T09:00:00Z" },
      },
    });

    expect(item.data.endTime).toBeUndefined();
  });
});
