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
  const row = page.getByText("Read for 20 min");
  await row.click();
  // After completion the row should sink into the Done group; line-through is visible.
  await expect(page.locator("li", { hasText: "Read for 20 min" })).toHaveClass(
    /line-through|done/i,
  );
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
