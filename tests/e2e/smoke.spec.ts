import { test, expect } from "@playwright/test";
import { clearEmulators } from "./fixtures/auth";

test.beforeEach(async () => {
  await clearEmulators();
});

test("app boots — / redirects to /login when signed out", async ({ page }) => {
  await page.goto("/");
  await expect(page).toHaveURL(/\/login/);
  await expect(page.getByText(/welcome back/i)).toBeVisible();
});

test("login page shows Compass brand + form", async ({ page, viewport }) => {
  await page.goto("/login");
  await expect(page.getByText(/welcome back/i)).toBeVisible();
  await expect(page.getByPlaceholder(/you@example/i)).toBeVisible();
  await expect(page.getByRole("button", { name: /^sign in$/i })).toBeVisible();
  // The hero column is `lg:flex` (≥1024px). Skip the hero check on mobile.
  if (viewport && viewport.width >= 1024) {
    await expect(page.getByText(/track your day/i)).toBeVisible();
  }
});

test("not-authorized page renders for blocked emails", async ({ page }) => {
  await page.goto("/not-authorized");
  await expect(page.getByText(/not authorized/i)).toBeVisible();
});
