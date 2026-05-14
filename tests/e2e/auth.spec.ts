import { test, expect } from "@playwright/test";
import {
  clearEmulators,
  completeOnboarding,
  signInWithoutOnboarding,
  signIn,
} from "./fixtures/auth";

test.beforeEach(async () => {
  await clearEmulators();
});

test("email/password sign-in lands on the app shell", async ({ page }) => {
  await signIn(page);
  // Either home (/) or today (/today) is acceptable depending on default routing.
  await expect(page).toHaveURL(/\/(today)?$/);
  // The sidebar (desktop) or bottom tab (mobile) should be visible.
  // Easier check: the Compass brand text appears somewhere in the chrome.
  await expect(page.getByText(/compass/i).first()).toBeVisible();
});

test("invalid credentials surface an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder(/you@example/i).fill("ghost@compass.test");
  await page.getByPlaceholder(/•+/).fill("wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await expect(page.getByRole("alert")).toBeVisible();
});

test("signed-in user can complete onboarding", async ({ page }) => {
  // This test specifically exercises the wizard, so don't pre-seed.
  await signInWithoutOnboarding(page);
  await completeOnboarding(page);
  await expect(page.getByText(/welcome to compass/i)).not.toBeVisible();
});
