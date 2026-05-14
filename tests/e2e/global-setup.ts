import { spawn, type ChildProcess } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

/**
 * Playwright global setup. Starts the Firebase emulator suite (Auth + Firestore)
 * in the background, waits for the Firestore port to accept connections, then
 * hands off to the dev server (managed by Playwright's `webServer`).
 *
 * The emulator child process pid is stored at `.playwright-tmp/emulator.pid`
 * so `global-teardown` can stop it cleanly.
 */
const TMP_DIR = path.resolve(process.cwd(), ".playwright-tmp");
const PID_FILE = path.join(TMP_DIR, "emulator.pid");
const LOG_FILE = path.join(TMP_DIR, "emulator.log");

const FIRESTORE_PORT = 8181;
const AUTH_PORT = 9099;

async function waitForPort(port: number, timeoutMs = 30_000): Promise<void> {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/`);
      // Firestore returns 200 with "Ok"; Auth returns 200 with JSON.
      if (res.status >= 200 && res.status < 500) return;
    } catch {
      /* still booting */
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for emulator port ${port}`);
}

export default async function globalSetup(): Promise<void> {
  mkdirSync(TMP_DIR, { recursive: true });

  // Clear any stale data + log file from a previous run.
  writeFileSync(LOG_FILE, "");

  // Spawn the emulator suite. We DO NOT pipe stdout to Playwright — it goes
  // to a log file so a noisy emulator doesn't pollute test output.
  const child: ChildProcess = spawn(
    "firebase",
    [
      "emulators:start",
      "--only",
      "auth,firestore",
      "--project",
      "personal-tracker-32b2a",
    ],
    {
      cwd: process.cwd(),
      detached: true,
      stdio: ["ignore", "pipe", "pipe"],
    },
  );

  child.stdout?.on("data", (b) => {
    writeFileSync(LOG_FILE, b, { flag: "a" });
  });
  child.stderr?.on("data", (b) => {
    writeFileSync(LOG_FILE, b, { flag: "a" });
  });

  if (!child.pid) {
    throw new Error("Failed to spawn firebase emulators");
  }
  writeFileSync(PID_FILE, String(child.pid));

  // Wait for both ports to come up.
  await Promise.all([waitForPort(FIRESTORE_PORT), waitForPort(AUTH_PORT)]);

  // eslint-disable-next-line no-console
  console.log(
    `[e2e] emulators ready (auth:${AUTH_PORT}, firestore:${FIRESTORE_PORT}). pid=${child.pid}`,
  );
}
