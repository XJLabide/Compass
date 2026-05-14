import { expect, type Page } from "@playwright/test";

/**
 * Test-only credentials. The user is allowlisted via NEXT_PUBLIC_ALLOWED_EMAILS
 * in .env.test / playwright.config.ts. The Auth emulator accepts any password
 * and silently creates the user on first sign-in.
 */
export const TEST_EMAIL = "test@compass.test";
export const TEST_PASSWORD = "test-password-123";

const PROJECT_ID = "personal-tracker-32b2a";

/**
 * Wipe all auth users + firestore docs between tests. The emulator exposes
 * REST endpoints under the standard ports for this.
 */
export async function clearEmulators(): Promise<void> {
  await Promise.all([
    fetch(
      `http://127.0.0.1:9099/emulator/v1/projects/${PROJECT_ID}/accounts`,
      { method: "DELETE" },
    ),
    fetch(
      `http://127.0.0.1:8181/emulator/v1/projects/${PROJECT_ID}/databases/p-tracker/documents`,
      { method: "DELETE" },
    ),
  ]);
}

/**
 * Drive the email/password sign-in form. The Auth emulator auto-creates the
 * account if it doesn't exist when using REST signUp, but the SDK's
 * signInWithEmailAndPassword will fail if the user doesn't exist — so we
 * sign them up via REST first, then sign in via the UI.
 */
export async function ensureTestUser(): Promise<string> {
  // signUp is idempotent on the emulator: if the user exists, it returns 400
  // EMAIL_EXISTS which we work around by signing in instead. Returns the localId
  // (uid) so callers can seed Firestore for that user.
  const signUpRes = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signUp?key=test-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  if (signUpRes.ok) {
    const data = (await signUpRes.json()) as { localId: string };
    return data.localId;
  }
  // EMAIL_EXISTS — sign in instead to grab the uid.
  const signInRes = await fetch(
    `http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=test-api-key`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        email: TEST_EMAIL,
        password: TEST_PASSWORD,
        returnSecureToken: true,
      }),
    },
  );
  const data = (await signInRes.json()) as { localId: string };
  return data.localId;
}

/**
 * Pre-seed an onboarded profile directly on the Firestore emulator. Skips the
 * OnboardingWizard for tests that don't care about it.
 *
 * Uses the emulator's REST API to write the user's profile/profile doc with
 * `onboarded: true` and sensible defaults. After this, signIn() lands in an
 * app shell where the wizard is hidden.
 */
/**
 * Pre-seed an onboarded profile on the Firestore emulator. Uses the emulator's
 * `Bearer owner` bypass header so we don't need to wire auth into the test
 * setup. Direct REST writes to the `p-tracker` database (the same DB the app
 * connects to).
 *
 * Field shape follows google.firestore.v1.Document — emulator parses the
 * `fields` map and applies the values as-is, no rule enforcement.
 */
export async function seedOnboardedProfile(uid: string): Promise<void> {
  const url = `http://127.0.0.1:8181/v1/projects/${PROJECT_ID}/databases/p-tracker/documents/users/${uid}/profile/profile`;
  const now = new Date().toISOString();
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer owner",
    },
    body: JSON.stringify({
      fields: {
        displayName: { stringValue: "Test User" },
        unitSystem: { stringValue: "imperial" },
        proteinTargetG: { integerValue: "180" },
        weeklyGainLb: { doubleValue: 0.5 },
        timezone: { stringValue: "UTC" },
        currency: { stringValue: "USD" },
        onboarded: { booleanValue: true },
        createdAt: { timestampValue: now },
        updatedAt: { timestampValue: now },
      },
    }),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`seedOnboardedProfile failed (${res.status}): ${body}`);
  }
  // Read it back so we know the doc is queryable.
  const verify = await fetch(url, {
    headers: { Authorization: "Bearer owner" },
  });
  if (!verify.ok) {
    throw new Error(
      `seedOnboardedProfile readback failed (${verify.status}): ${await verify.text()}`,
    );
  }
  const verified = (await verify.json()) as { fields?: Record<string, unknown> };
  if (!verified.fields?.onboarded) {
    throw new Error(
      `seedOnboardedProfile readback missing onboarded field: ${JSON.stringify(verified)}`,
    );
  }
}

/**
 * Sign in a test user and pre-seed an onboarded profile so the wizard never
 * shows. The vast majority of tests don't care about the onboarding flow —
 * keep `signInWithoutOnboarding` for the few that do.
 */
export async function signIn(page: Page): Promise<string> {
  const uid = await ensureTestUser();
  await seedOnboardedProfile(uid);
  await page.goto("/login");
  await page.getByPlaceholder(/you@example/i).fill(TEST_EMAIL);
  await page.getByPlaceholder(/•+/).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  // Make sure the OnboardingWizard never flashes — if it does, the page
  // would layout-shift mid-test and clicks become unstable.
  await expect(page.getByText(/welcome to compass/i)).not.toBeVisible({
    timeout: 5_000,
  });
  return uid;
}

/** Sign in without seeding a profile — for tests that exercise the wizard itself. */
export async function signInWithoutOnboarding(page: Page): Promise<string> {
  const uid = await ensureTestUser();
  await page.goto("/login");
  await page.getByPlaceholder(/you@example/i).fill(TEST_EMAIL);
  await page.getByPlaceholder(/•+/).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/login"), {
    timeout: 15_000,
  });
  return uid;
}

/**
 * Finish the onboarding wizard with defaults. Use in tests where we need a
 * seeded profile so the dashboard renders against real data.
 *
 * Walks the 5 steps using the visible "Step N of 5" text as a sync barrier
 * between clicks — Playwright otherwise races React's re-render and ends up
 * clicking the same Step 1 Next button repeatedly.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  const wizard = page.getByText(/welcome to compass/i);
  if (!(await wizard.count())) return;
  await expect(wizard).toBeVisible({ timeout: 10_000 });

  for (let step = 1; step <= 4; step++) {
    await expect(page.getByText(new RegExp(`step ${step} of 5`, "i"))).toBeVisible();
    await page.getByRole("button", { name: /^next$/i }).click();
  }
  await expect(page.getByText(/step 5 of 5/i)).toBeVisible();
  await page.getByRole("button", { name: /finish setup/i }).click();
  await expect(wizard).not.toBeVisible({ timeout: 10_000 });
}
