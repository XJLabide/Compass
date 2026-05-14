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
  // Look for the Home nav item — present in both the sidebar (desktop) and
  // the bottom tab bar (mobile). Whichever is visible counts.
  await expect(page.getByRole("link", { name: /^home$/i }).first()).toBeVisible();
});

test("invalid credentials surface an inline error", async ({ page }) => {
  await page.goto("/login");
  await page.getByPlaceholder(/you@example/i).fill("ghost@compass.test");
  await page.getByPlaceholder(/•+/).fill("wrong-password");
  await page.getByRole("button", { name: /^sign in$/i }).click();
  // Next.js adds a permanent role="alert" route announcer — scope to the
  // form's red error banner specifically.
  await expect(
    page.locator('[role="alert"]:not(#__next-route-announcer__)'),
  ).toBeVisible();
});

test("signed-in user can complete onboarding", async ({ page }) => {
  // This test specifically exercises the wizard, so don't pre-seed.
  await signInWithoutOnboarding(page);
  await completeOnboarding(page);
  await expect(page.getByText(/welcome to compass/i)).not.toBeVisible();
});
