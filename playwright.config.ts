import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright config for Compass e2e tests.
 *
 * - Tests run against the Next.js dev server (started by `webServer` below).
 * - The dev server runs with NEXT_PUBLIC_USE_EMULATORS=true so the app
 *   connects to the local Firebase emulator suite (Auth on 9099, Firestore
 *   on 8080).
 * - `globalSetup` is responsible for starting the emulators *before* the
 *   dev server boots, and `globalTeardown` shuts them down.
 * - Projects cover a desktop Chromium and a mobile Chromium (Pixel 7) view.
 *
 * Run locally:
 *   npm run test:e2e            # headless
 *   npm run test:e2e -- --ui   # interactive
 *   npm run test:e2e -- --debug
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: 1, // emulator state is shared; keep serial for now
  reporter: process.env.CI ? "github" : "list",

  globalSetup: "./tests/e2e/global-setup.ts",
  globalTeardown: "./tests/e2e/global-teardown.ts",

  use: {
    baseURL: "http://127.0.0.1:3100",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },

  projects: [
    {
      name: "desktop-chromium",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } },
    },
    {
      name: "mobile-chromium",
      use: { ...devices["Pixel 7"] },
    },
  ],

  webServer: {
    command: "next dev -p 3100",
    url: "http://127.0.0.1:3100",
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // Load test env vars into the dev server so the app uses the emulators.
      NEXT_PUBLIC_FIREBASE_API_KEY: "test-api-key",
      NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
      NEXT_PUBLIC_FIREBASE_PROJECT_ID: "personal-tracker-32b2a",
      NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: "test.appspot.com",
      NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
      NEXT_PUBLIC_FIREBASE_APP_ID: "1:000:web:test",
      NEXT_PUBLIC_FIREBASE_DB_ID: "(default)",
      NEXT_PUBLIC_USE_EMULATORS: "true",
      NEXT_PUBLIC_EMULATOR_HOST: "127.0.0.1",
      NEXT_PUBLIC_ALLOWED_EMAILS: "test@compass.test",
    },
  },
});
