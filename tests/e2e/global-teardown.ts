import { readFileSync, rmSync, existsSync } from "node:fs";
import path from "node:path";

const TMP_DIR = path.resolve(process.cwd(), ".playwright-tmp");
const PID_FILE = path.join(TMP_DIR, "emulator.pid");

/**
 * Stop the Firebase emulator suite spawned in global-setup.
 * Sends SIGTERM to the process group so the JVM children also die.
 */
export default async function globalTeardown(): Promise<void> {
  if (!existsSync(PID_FILE)) return;
  const pid = Number(readFileSync(PID_FILE, "utf8").trim());
  if (!Number.isFinite(pid) || pid <= 0) return;
  try {
    // Negative pid = kill the whole process group spawned with detached: true.
    process.kill(-pid, "SIGTERM");
  } catch {
    // Process already gone or never started; ignore.
  }
  try {
    rmSync(PID_FILE);
  } catch {
    /* best effort */
  }
}
