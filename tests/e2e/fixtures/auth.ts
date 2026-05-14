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
      `http://127.0.0.1:8080/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
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
export async function ensureTestUser(): Promise<void> {
  // signUp is idempotent on the emulator: if the user exists, it returns 400
  // EMAIL_EXISTS which we ignore. The emulator accepts any apiKey value.
  await fetch(
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
}

export async function signIn(page: Page): Promise<void> {
  await ensureTestUser();
  await page.goto("/login");
  // The login form is the form column on the left.
  await page.getByPlaceholder(/you@example/i).fill(TEST_EMAIL);
  await page.getByPlaceholder(/•+/).fill(TEST_PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();

  // Wait to land on the app shell. The OnboardingWizard may appear; tests
  // that need to bypass it should call `dismissOnboarding(page)` afterward.
  await expect(page).toHaveURL(/\/(today|$)/);
}

/**
 * Finish the onboarding wizard with defaults. Use in tests where we need a
 * seeded profile so the dashboard renders against real data.
 */
export async function completeOnboarding(page: Page): Promise<void> {
  const wizard = page.getByText(/welcome to compass/i);
  if (await wizard.count()) {
    // Step 1: name + units — accept defaults, click Next.
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 2: timezone — accept detected.
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 3: targets — accept defaults.
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 4: currency + optional budget — accept defaults.
    await page.getByRole("button", { name: /^next$/i }).click();
    // Step 5: confirm.
    await page.getByRole("button", { name: /finish setup/i }).click();
    await expect(wizard).not.toBeVisible({ timeout: 5_000 });
  }
}
