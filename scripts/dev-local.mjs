import { spawn, spawnSync } from "node:child_process";
import { rmSync } from "node:fs";
import { resolve } from "node:path";

const projectId = "demo-compass-local";
const emulatorPorts = [8281, 9299];

if (process.argv.includes("--clean")) {
  rmSync(resolve(process.cwd(), ".next"), { recursive: true, force: true });
}

const env = {
  ...process.env,
  NEXT_PUBLIC_FIREBASE_API_KEY: "demo-api-key",
  NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN: "localhost",
  NEXT_PUBLIC_FIREBASE_PROJECT_ID: projectId,
  NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET: `${projectId}.appspot.com`,
  NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID: "000000000000",
  NEXT_PUBLIC_FIREBASE_APP_ID: "1:000000000000:web:local",
  NEXT_PUBLIC_FIREBASE_DB_ID: "p-tracker",
  NEXT_PUBLIC_USE_EMULATORS: "true",
  NEXT_PUBLIC_EMULATOR_HOST: "127.0.0.1",
  NEXT_PUBLIC_EMULATOR_FIRESTORE_PORT: "8281",
  NEXT_PUBLIC_EMULATOR_AUTH_PORT: "9299",
  NEXT_PUBLIC_ALLOWED_EMAILS: "local-dev@compass.test",
  LOCAL_DEV_EMAIL: "local-dev@compass.test",
  LOCAL_DEV_PASSWORD: "local-dev-password",
};

const emulatorAlreadyRunning = emulatorPorts.every((port) => {
  const result = spawnSync("lsof", ["-nP", `-iTCP:${port}`, "-sTCP:LISTEN"], {
    encoding: "utf8",
  });
  return result.status === 0 && result.stdout.includes("LISTEN");
});

process.stdout.write(
  emulatorAlreadyRunning
    ? `Using the existing local Auth and Firestore emulators with ${projectId}.\n`
    : `Starting local Auth and Firestore emulators with ${projectId}.\n`,
);
process.stdout.write(
  `Local sign-in: ${env.LOCAL_DEV_EMAIL} / ${env.LOCAL_DEV_PASSWORD}\n`,
);

const command = emulatorAlreadyRunning ? "npm" : "firebase";
const args = emulatorAlreadyRunning
  ? ["run", "dev:local-server"]
  : [
      "emulators:exec",
      "--only",
      "auth,firestore",
      "--project",
      projectId,
      "npm run dev:local-server",
    ];

const emulatorProcess = spawn(command, args, { env, stdio: "inherit" });

emulatorProcess.on("error", (error) => {
  process.stderr.write(`Could not start Firebase Emulator Suite: ${error.message}\n`);
  process.exitCode = 1;
});

emulatorProcess.on("exit", (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
