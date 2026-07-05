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
  await page.goto("/money");
});

test("add an expense and see it in This Month list", async ({ page }) => {
  await page.getByLabel("Amount", { exact: true }).fill("12.50");
  await page.getByRole("button", { name: /add expense/i }).click();
  // Total updates and entry shows in the list.
  await expect(page.getByText(/12\.50/).first()).toBeVisible();
});

test("regression — add an income with no note succeeds", async ({ page }) => {
  // This used to throw "Function addDoc() called with invalid data (note: undefined)".
  await page.getByRole("button", { name: /^income$/i }).click();
  await page.getByLabel("Amount", { exact: true }).fill("2000");
  await page.getByRole("button", { name: /add income/i }).click();
  // Scope to the app's red error banner — Next adds a permanent
  // role="alert" route announcer.
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).not.toBeVisible();
  await expect(page.getByText(/2,?000|2000\.00/).first()).toBeVisible();
});

test("add an expense WITH a note still works", async ({ page }) => {
  await page.getByLabel("Amount", { exact: true }).fill("8");
  await page.getByPlaceholder(/note/i).fill("lunch");
  await page.getByRole("button", { name: /add expense/i }).click();
  await expect(page.getByText("lunch")).toBeVisible();
});

test("add a recurring fee and surface monthly commitment", async ({ page }) => {
  await page.goto("/settings");
  await page.getByPlaceholder(/name, e\.g\. spotify/i).fill("Spotify");
  await page.getByLabel(/recurring fee amount/i).fill("10");
  await page.getByRole("button", { name: /add recurring fee/i }).click();

  await expect(page.getByText("Spotify")).toBeVisible();
  await page.goto("/money");
  await expect(page.getByText("Spotify")).toBeVisible();
  await expect(page.getByText(/\$10 monthly/i)).toBeVisible();
});
