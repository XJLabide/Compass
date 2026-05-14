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
  await page.goto("/todos");
});

test("add a todo and see it in the list", async ({ page }) => {
  await page.getByPlaceholder(/add a task/i).fill("Buy milk");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Buy milk")).toBeVisible();
});

test("toggle a todo to done", async ({ page }) => {
  await page.getByPlaceholder(/add a task/i).fill("Read for 20 min");
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Read for 20 min")).toBeVisible();

  // Tap the row to toggle done.
  await page.getByText("Read for 20 min").click();

  // Completed todos sink into a divider labeled "Done" with a count.
  // Waiting for that divider proves the toggle wrote.
  await expect(page.getByText(/^done$/i)).toBeVisible({ timeout: 5_000 });
});

test("Routines tab opens via the tab control", async ({ page }) => {
  await page.getByRole("tab", { name: /routines/i }).click();
  await expect(page).toHaveURL(/tab=routines/);
  await expect(page.getByPlaceholder(/new routine/i)).toBeVisible();
});

test("add a routine with custom schedule", async ({ page }) => {
  await page.getByRole("tab", { name: /routines/i }).click();
  await page.getByPlaceholder(/new routine/i).fill("Drink water");
  // Default selection is "Daily" — leave it.
  await page.getByRole("button", { name: /^add$/i }).click();
  await expect(page.getByText("Drink water")).toBeVisible();
});
