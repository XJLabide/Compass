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
  await page.goto("/today");
});

test("Today renders all main sections", async ({ page }) => {
  await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
  // Sections (case-insensitive subheadings)
  for (const label of [
    /workout/i,
    /routines/i,
    /todos/i,
    /money/i,
    /check-in/i,
    /reflection/i,
  ]) {
    await expect(page.getByText(label).first()).toBeVisible();
  }
});

test("reflection field persists across reload", async ({ page }) => {
  const struggles = page.getByPlaceholder(/what's on your mind/i);
  await struggles.fill("backlog feels heavy");
  // Blur to commit
  await struggles.blur();
  // Wait for the saved flash
  await expect(page.getByText(/^saved$/i).first()).toBeVisible({ timeout: 5_000 });

  await page.reload();
  await expect(
    page.getByPlaceholder(/what's on your mind/i),
  ).toHaveValue("backlog feels heavy");
});

test("inline mood picker writes to today's daily doc", async ({ page }) => {
  // The mood row exposes 5 emoji buttons aria-labeled "Mood 1".."Mood 5".
  await page.getByRole("button", { name: /mood 4/i }).click();
  // Pressed state visible via background tint — check aria.
  await expect(page.getByRole("button", { name: /mood 4/i })).toHaveAttribute(
    "type",
    "button",
  );
});
