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
  const uid = await signInWithoutOnboarding(
    page,
    `onboarding-${Date.now()}@compass.test`,
  );
  const baseUrl =
    `http://127.0.0.1:8181/v1/projects/personal-tracker-32b2a/` +
    `databases/p-tracker/documents/users/${uid}`;
  const headers = { Authorization: "Bearer owner" };
  const profileBeforeOnboarding = await page.request.get(
    `${baseUrl}/profile/profile`,
    { headers },
  );
  expect(profileBeforeOnboarding.status()).toBe(404);
  await expect(page.getByText(/step 1 of 3/i)).toBeVisible({ timeout: 10_000 });

  await completeOnboarding(page, { requireWizard: true, currency: "EUR" });
  await expect(page.getByText(/welcome to compass/i)).not.toBeVisible();

  const profileResponse = await page.request.get(
    `${baseUrl}/profile/profile`,
    { headers },
  );
  expect(profileResponse.ok()).toBeTruthy();

  const profile = (await profileResponse.json()) as {
    fields?: Record<string, Record<string, unknown>>;
  };
  expect(profile.fields?.onboarded?.booleanValue).toBe(true);
  expect(profile.fields?.unitSystem?.stringValue).toBe("imperial");
  expect(profile.fields?.timezone?.stringValue).toEqual(expect.any(String));
  expect(profile.fields?.currency?.stringValue).toBe("EUR");
  // The owner can set these later in Settings; first-run setup leaves them unset.
  expect(profile.fields?.proteinTargetG?.integerValue).toBe("0");
  expect(profile.fields?.calorieTargetKcal).toBeUndefined();
  expect(profile.fields?.wakeTime).toBeUndefined();
  expect(profile.fields?.bedTime).toBeUndefined();

  // A fresh account has its profile only; it doesn't inherit the old starter plan.
  const programResponse = await page.request.get(
    `${baseUrl}/program/active`,
    { headers },
  );
  expect(programResponse.status()).toBe(404);

  await page.goto("/money");
  await expect(page.getByRole("heading", { name: "Finances" })).toBeVisible();
  await expect(page.getByText("€0.00").first()).toBeVisible();
  await expect
    .poll(async () => {
      const response = await page.request.get(`${baseUrl}/profile/profile`, { headers });
      const savedProfile = (await response.json()) as {
        fields?: Record<string, Record<string, unknown>>;
      };
      return savedProfile.fields?.currency?.stringValue;
    })
    .toBe("EUR");

  await page.goto("/settings");
  await page.getByLabel(/reporting currency/i).selectOption("USD");
  await expect
    .poll(async () => {
      const response = await page.request.get(`${baseUrl}/profile/profile`, { headers });
      const savedProfile = (await response.json()) as {
        fields?: Record<string, Record<string, unknown>>;
      };
      return savedProfile.fields?.currency?.stringValue;
    })
    .toBe("USD");

  await page.goto("/money");
  await expect(page.getByText("$0.00").first()).toBeVisible();
});
