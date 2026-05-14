import { test, expect, devices } from "@playwright/test";
import {
  clearEmulators,
  completeOnboarding,
  signIn,
} from "./fixtures/auth";

// This file only runs in the mobile project (Pixel 7). The desktop project
// skips it because the bottom tab bar is `md:hidden`.
test.use({ ...devices["Pixel 7"] });

test.beforeEach(async ({ page }) => {
  await clearEmulators();
  await signIn(page);
  await completeOnboarding(page);
});

test("primary tabs navigate", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("link", { name: /^todos$/i }).click();
  await expect(page).toHaveURL(/\/todos/);
  await page.getByRole("link", { name: /^money$/i }).click();
  await expect(page).toHaveURL(/\/money/);
  await page.getByRole("link", { name: /^today$/i }).click();
  await expect(page).toHaveURL(/\/today/);
});

test("More tab opens the sheet, not a navigation", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^more$/i }).click();
  // Sheet exposes a dialog
  await expect(page.getByRole("dialog", { name: /more navigation/i })).toBeVisible();
  // Sheet should list secondary destinations
  await expect(page.getByRole("button", { name: /^workout$/i })).toBeVisible();
  await expect(page.getByRole("button", { name: /^settings$/i })).toBeVisible();
});

test("More sheet navigates and closes", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: /^more$/i }).click();
  await page.getByRole("button", { name: /^settings$/i }).click();
  await expect(page).toHaveURL(/\/settings/);
  await expect(
    page.getByRole("dialog", { name: /more navigation/i }),
  ).not.toBeVisible();
});
