# Firestore Security Rules

Source of truth: [`firestore.rules`](../firestore.rules).

## Model

- **Default-deny** at the root. Anything not explicitly matched is denied.
- All app data lives under `users/{uid}/...`. Access requires both:
  1. `request.auth.uid == uid` (you can only touch your own subtree), AND
  2. `request.auth.token.email` is on the hard-coded allowlist (`allowed()` in
     the rules file). This is the same allowlist enforced at the app shell.
- Per-collection write validators enforce field shapes (numeric ranges,
  required fields). Anything that fails validation is rejected at write time.

## Collections

| Path                                 | Validator         | Notes                                                        |
| ------------------------------------ | ----------------- | ------------------------------------------------------------ |
| `users/{uid}/profile/{docId}`        | `profileValid`    | `displayName`, `unitSystem in [imperial, metric]`, targets.  |
| `users/{uid}/program/{docId}`        | `programValid`    | `name`, `sessions[]`.                                        |
| `users/{uid}/exercises/{exerciseId}` | `exerciseValid`   | `name`, `primaryMuscle`, `category`.                         |
| `users/{uid}/sessions/{sessionId}`   | `sessionValid`    | `localDate`, `name`, `sets is list`, optional `durationMin`. |
| `users/{uid}/daily/{YYYY-MM-DD}`     | `dailyValid`      | See ranges below.                                            |
| `users/{uid}/prs/{prId}`             | `prValid`         | `weightKg >= 0`, `reps >= 0`, `e1RMKg >= 0`.                 |

### `daily` field ranges

| Field          | Type   | Range / Constraint            |
| -------------- | ------ | ----------------------------- |
| `bodyweightKg` | number | `> 0` and `< 1000` if present |
| `sleepHours`   | number | `0..24` if present            |
| `sleepQuality` | int    | `1..5` if present             |
| `proteinG`     | number | `>= 0` if present             |
| `waterMl`      | number | `>= 0` if present             |
| `calories`     | int    | `0..100000` if present        |
| `steps`        | int    | `0..1_000_000` if present     |
| `mood`         | int    | `1..5` if present             |
| `note`         | string | any string                    |
| `localDate`    | string | required                      |

### `sessions.sets[*]` (validated client-side; rules require `sets is list`)

| Field        | Constraint            |
| ------------ | --------------------- |
| `weightKg`   | `number, >= 0`        |
| `reps`       | `int, >= 0`           |
| `rpe`        | `1..10` if present    |
| `exerciseId` | non-empty string      |
| `order`      | `int, >= 0`           |

## Deployment

```bash
# One-time setup
npm i -g firebase-tools
firebase login

# Pick the project (see .firebaserc; if missing, run `firebase use --add`).
firebase use <project-id>

# Deploy only the rules (no functions, no hosting):
firebase deploy --only firestore:rules
```

## Editing the allowlist

The allowlist is intentionally **hard-coded in `firestore.rules`** for v1. To
add or remove a user:

1. Open `firestore.rules`.
2. Find the `allowed()` function:

   ```
   function allowed() {
     return [
       'labide.xj@gmail.com'
     ];
   }
   ```

3. Add or remove the email from the list. Keep them lowercase to match what
   Firebase Auth stores in `request.auth.token.email`.
4. Commit the change.
5. Redeploy:

   ```bash
   firebase deploy --only firestore:rules
   ```

The app-level allowlist (used by the (app) shell to gate UI) lives separately
in the app config — keep the two in sync.

## Local testing

The rules test suite lives in [`tests/firestore-rules.test.ts`](../tests/firestore-rules.test.ts)
and uses `@firebase/rules-unit-testing` against the Firestore emulator.

```bash
# Start the emulator in one terminal:
firebase emulators:start --only firestore

# In another terminal, run the rules tests:
npx jest tests/firestore-rules.test.ts
# or, if you wire it into `npm test`:
npm test -- tests/firestore-rules.test.ts
```

The tests cover:

- Unauthenticated reads/writes are denied on every path.
- A signed-in (allowlisted) user **cannot** read another uid's data.
- An allowlisted user **can** write valid `profile`, `daily`, `sessions`,
  `exercises`, `program`, and `prs` documents to their own subtree.
- Invalid `daily` writes are rejected (e.g. `sleepHours: 30`,
  `bodyweightKg: -5`, `mood: 9`).
- A signed-in user whose email is **not** on the allowlist is denied.
