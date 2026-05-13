/**
 * Firestore security-rules tests.
 *
 * Run against the Firestore emulator:
 *   firebase emulators:exec --only firestore "npx jest tests/firestore-rules.test.ts"
 *
 * Or, with the emulator already running on the default port (8080):
 *   npx jest tests/firestore-rules.test.ts
 */
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { readFileSync } from "fs";
import { resolve } from "path";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp,
} from "firebase/firestore";

const PROJECT_ID = "personal-tracker-rules-test";
const ALLOWED_EMAIL = "labide.xj@gmail.com";
const NOT_ALLOWED_EMAIL = "stranger@example.com";

let env: RulesTestEnvironment;

beforeAll(async () => {
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(resolve(__dirname, "../firestore.rules"), "utf8"),
      host: "127.0.0.1",
      port: 8080,
    },
  });
});

afterAll(async () => {
  await env.cleanup();
});

beforeEach(async () => {
  await env.clearFirestore();
});

function ownedDb(uid: string, email = ALLOWED_EMAIL) {
  return env
    .authenticatedContext(uid, { email, email_verified: true })
    .firestore();
}

function unauthDb() {
  return env.unauthenticatedContext().firestore();
}

describe("default-deny", () => {
  test("unauthenticated read on user subtree is denied", async () => {
    const db = unauthDb();
    await assertFails(getDoc(doc(db, "users/alice/profile/profile")));
  });

  test("unauthenticated write on user subtree is denied", async () => {
    const db = unauthDb();
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
      }),
    );
  });

  test("unauthenticated read of a random root path is denied", async () => {
    const db = unauthDb();
    await assertFails(getDoc(doc(db, "random/path")));
  });
});

describe("cross-user isolation", () => {
  test("allowlisted user cannot read another uid's data", async () => {
    // Seed alice's profile via the privileged context.
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users/alice/profile/profile"), {
        displayName: "Alice",
        unitSystem: "metric",
        proteinTargetG: 160,
        weeklyGainLb: 0.5,
        timezone: "UTC",
      });
    });

    const bob = ownedDb("bob");
    await assertFails(getDoc(doc(bob, "users/alice/profile/profile")));
  });

  test("allowlisted user cannot write to another uid's subtree", async () => {
    const bob = ownedDb("bob");
    await assertFails(
      setDoc(doc(bob, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        bodyweightKg: 80,
      }),
    );
  });
});

describe("allowlist enforcement", () => {
  test("signed-in user NOT on allowlist is denied even on own subtree", async () => {
    const db = ownedDb("alice", NOT_ALLOWED_EMAIL);
    await assertFails(getDoc(doc(db, "users/alice/profile/profile")));
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
      }),
    );
  });

  test("allowlisted user can read/write their own subtree", async () => {
    const db = ownedDb("alice");
    await assertSucceeds(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        bodyweightKg: 80.5,
      }),
    );
    await assertSucceeds(getDoc(doc(db, "users/alice/daily/2026-05-13")));
  });
});

describe("daily field validators", () => {
  test("sleepHours: 30 is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        sleepHours: 30,
      }),
    );
  });

  test("bodyweightKg: -5 is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        bodyweightKg: -5,
      }),
    );
  });

  test("mood: 9 is rejected (range 1..5)", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        mood: 9,
      }),
    );
  });

  test("sleepQuality: 5 is accepted", async () => {
    const db = ownedDb("alice");
    await assertSucceeds(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        localDate: "2026-05-13",
        sleepHours: 7.5,
        sleepQuality: 5,
        proteinG: 180,
        mood: 4,
      }),
    );
  });

  test("missing localDate is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/daily/2026-05-13"), {
        bodyweightKg: 80,
      }),
    );
  });
});

describe("sessions validator", () => {
  test("valid session with sets array is accepted", async () => {
    const db = ownedDb("alice");
    await assertSucceeds(
      setDoc(doc(db, "users/alice/sessions/abc"), {
        localDate: "2026-05-13",
        name: "Upper A",
        sets: [
          { exerciseId: "bench", weightKg: 80, reps: 5, order: 0 },
        ],
      }),
    );
  });

  test("non-list sets is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/sessions/abc"), {
        localDate: "2026-05-13",
        name: "Upper A",
        sets: "not-a-list",
      }),
    );
  });

  test("missing name is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/sessions/abc"), {
        localDate: "2026-05-13",
        sets: [],
      }),
    );
  });
});

describe("profile validator", () => {
  test("invalid unitSystem is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/profile/profile"), {
        displayName: "Alice",
        unitSystem: "furlongs",
        proteinTargetG: 160,
        weeklyGainLb: 0.5,
        timezone: "UTC",
      }),
    );
  });

  test("negative proteinTargetG is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/profile/profile"), {
        displayName: "Alice",
        unitSystem: "metric",
        proteinTargetG: -10,
        weeklyGainLb: 0.5,
        timezone: "UTC",
      }),
    );
  });

  test("well-formed profile is accepted", async () => {
    const db = ownedDb("alice");
    await assertSucceeds(
      setDoc(doc(db, "users/alice/profile/profile"), {
        displayName: "Alice",
        unitSystem: "metric",
        proteinTargetG: 160,
        weeklyGainLb: 0.5,
        timezone: "America/New_York",
      }),
    );
  });
});

describe("prs validator", () => {
  test("negative weightKg is rejected", async () => {
    const db = ownedDb("alice");
    await assertFails(
      setDoc(doc(db, "users/alice/prs/pr1"), {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        weightKg: -1,
        reps: 5,
        e1RMKg: 90,
        sessionId: "sess1",
        localDate: "2026-05-13",
      }),
    );
  });

  test("valid PR is accepted", async () => {
    const db = ownedDb("alice");
    await assertSucceeds(
      setDoc(doc(db, "users/alice/prs/pr1"), {
        exerciseId: "bench",
        exerciseName: "Bench Press",
        weightKg: 100,
        reps: 5,
        e1RMKg: 115,
        sessionId: "sess1",
        localDate: "2026-05-13",
      }),
    );
  });
});
