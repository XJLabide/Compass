# Firestore Security Rules

Source of truth: [`firestore.rules`](../firestore.rules).

## Model

- **Default-deny** at the root. Anything not explicitly matched is denied.
- All app data lives under `users/{uid}/...`. Access requires both:
  1. `request.auth != null`, AND
  2. `request.auth.uid == uid` (you can only touch your own subtree).
- Per-collection write validators enforce field shapes (numeric ranges,
  required fields). Anything that fails validation is rejected at write time.
- Firestore rules do not enforce an email allowlist. Do not rely on client-side
  email checks to protect another user's data; ownership is enforced by UID.
- `integrationSecrets` and `oauthStates` deny all client reads and writes.

## Collections

| Path                                 | Validator         | Notes                                                        |
| ------------------------------------ | ----------------- | ------------------------------------------------------------ |
| `users/{uid}/profile/{docId}`        | `profileValid`    | `displayName`, `unitSystem in [imperial, metric]`, targets.  |
| `users/{uid}/program/{docId}`        | `programValid`    | `name`, `sessions[]`.                                        |
| `users/{uid}/exercises/{exerciseId}` | `exerciseValid`   | `name`, `primaryMuscle`, `category`.                         |
| `users/{uid}/sessions/{sessionId}`   | `sessionValid`    | `localDate`, `name`, `sets is list`, optional `durationMin`. |
| `users/{uid}/daily/{YYYY-MM-DD}`     | `dailyValid`      | See ranges below.                                            |
| `users/{uid}/prs/{prId}`             | `prValid`         | `weightKg >= 0`, `reps >= 0`, `e1RMKg >= 0`.                 |
| `users/{uid}/todos/{todoId}`          | `todoValid`       | Validates title, completion state, and optional project metadata. |
| `users/{uid}/projects/{projectId}`    | `projectValid`    | Requires an ordered column list and bounded metadata.        |
| `users/{uid}/expenses/{expenseId}`    | `expenseValid`    | Income/expense values, category, and local date.             |
| `users/{uid}/budgets/{budgetId}`      | `budgetValid`     | Mode, amount, date range, and active state.                   |
| `users/{uid}/recurringFees/{feeId}`   | `recurringFeeValid` | Amount, currency, cadence, and billing fields.             |
| `users/{uid}/goals/{goalId}`          | `goalValid`       | Goal fields and nested metric shapes.                         |
| `users/{uid}/calendarItems/{itemId}`  | `calendarItemValid` | Class, event, or task fields.                                |
| `users/{uid}/routines/{routineId}`    | `routineValid`    | Routine fields and schedule metadata.                        |
| `users/{uid}/accounts/{accountId}`    | Owner-only        | Read/write ownership is enforced; no field validator.       |
| `users/{uid}/portfolio/{holdingId}`   | Owner-only        | Read/write ownership is enforced; no field validator.       |

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

## Local testing

`npm run dev` starts Auth and Firestore emulators under the demo project
`demo-compass-local`. It connects to database `p-tracker`, which loads the
checked-in `firestore.rules` file. Local reads and writes stay in the emulator.

```bash
npm run dev
# In another terminal, verify the Finance transaction query and rules:
npm run verify:firestore-rules
```

The smoke check uses an emulator Auth user and the same `p-tracker` database as
the app. It verifies that the owner query succeeds, a cross-user query fails,
and an invalid transaction write is rejected. The separate Playwright setup
uses `demo-compass-e2e`; both local paths use demo IDs and cannot mutate
production Firestore.

Do not run `firebase deploy` as part of local verification. Production rule
deployment remains an explicit operation against the configured `.firebaserc`
project.
