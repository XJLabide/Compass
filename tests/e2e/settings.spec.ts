import { test, expect } from "@playwright/test";
import {
  clearEmulators,
  completeOnboarding,
  signIn,
} from "./fixtures/auth";

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
  await completeOnboarding(page);
});

test("integrations hub shows connected Google sync controls", async ({ page }) => {
  await page.route("**/api/integrations/google-calendar/status", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        status: {
          provider: "google_calendar",
          status: "connected",
          accountEmail: "test@example.com",
          selectedCalendarIds: ["primary"],
          lastSyncAt: { seconds: 1787983200 },
        },
      }),
    });
  });
  await page.route("**/api/integrations/google-calendar/calendars", (route) => {
    if (route.request().method() !== "GET") return route.continue();
    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        calendars: [{ id: "primary", summary: "Personal", primary: true }],
      }),
    });
  });

  await page.goto("/settings");
  await expect(page.getByText("Connected services")).toBeVisible();
  await expect(page.getByText("Google Calendar").first()).toBeVisible();
  await expect(page.getByText("Strava")).toBeVisible();
  await expect(page.getByText("Canvas LMS")).toBeVisible();
  await expect(page.getByRole("button", { name: /sync now/i })).toBeVisible();
  await expect(page.getByText("test@example.com")).toBeVisible();
});
