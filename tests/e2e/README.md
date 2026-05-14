# E2E tests

End-to-end tests for Compass built with [Playwright](https://playwright.dev/)
and the [Firebase Local Emulator Suite](https://firebase.google.com/docs/emulator-suite).

## How it works

1. `tests/e2e/global-setup.ts` spawns `firebase emulators:start --only auth,firestore`
   and waits for both ports (Auth 9099, Firestore 8080) to accept connections.
2. Playwright then boots `next dev -p 3100` with `NEXT_PUBLIC_USE_EMULATORS=true`
   so the app connects to the emulators instead of production.
   Ports: **Auth 9099**, **Firestore 8181** (8080 is intentionally avoided —
   commonly occupied by other dev tools like Tomcat), **UI 4001**.
3. Each test starts with `clearEmulators()` (REST DELETE to both emulators) so
   state is isolated between tests.
4. `signIn()` REST-creates the test user on the auth emulator (idempotent),
   then drives the login form.
5. `completeOnboarding()` walks the wizard with defaults so the dashboard
   renders against a seeded profile.

## Running

```bash
# Headless run
npm run test:e2e

# UI mode (best for writing new tests)
npm run test:e2e -- --ui

# Single file, single project
npm run test:e2e tests/e2e/money.spec.ts --project=desktop-chromium

# Debug with inspector
npm run test:e2e -- --debug
```

## Adding a new test

1. Create `tests/e2e/your-feature.spec.ts`
2. Import the auth helpers: `signIn`, `completeOnboarding`, `clearEmulators`
3. Use `test.beforeEach` to reset the emulator + sign in
4. Drive the UI with Playwright locators
5. Assert with `expect`

## Mobile-only tests

Use `test.use({ ...devices["Pixel 7"] })` to lock a spec to a mobile viewport.

## Troubleshooting

- **Emulator port collision**: kill stray `firebase` / `java` processes
  (`pkill -f 'firebase emulators'`).
- **Test user has stale data**: `clearEmulators()` in beforeEach should reset,
  but if you suspect a leak, restart the runner.
- **Wizard timing**: the OnboardingWizard depends on the profile snapshot
  resolving. If a test fails on the wizard step, add a small wait or assert
  on the wizard being visible before navigating it.
