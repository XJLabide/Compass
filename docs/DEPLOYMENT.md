# Deployment

End-to-end guide for taking a fresh clone of this repo to a live, signed-in
production instance on Vercel. Target: under 30 minutes the first time.

Everything here is one-time setup unless noted. Subsequent deploys are just
`git push` to `main`.

## Overview

1. [Create a Firebase project](#1-create-a-firebase-project)
2. [Enable Auth providers (Google + Email/Password)](#2-enable-auth-providers)
3. [Create the Firestore database](#3-create-the-firestore-database)
4. [Register a web app and grab the config](#4-register-a-web-app)
5. [Configure local `.env.local` and run dev](#5-configure-local-envlocal)
6. [Deploy `firestore.rules`](#6-deploy-firestorerules)
7. [Link the GitHub repo to Vercel](#7-link-the-github-repo-to-vercel)
8. [Set Vercel env vars](#8-set-vercel-env-vars)
9. [Verify production sign-in](#9-verify-production-sign-in)

---

## 1. Create a Firebase project

1. Go to <https://console.firebase.google.com> and click **Add project**.
2. Name it (e.g. `personal-tracker`). Google Analytics is optional — disable
   it for a single-user app to keep the surface area small.
3. Wait for the project to provision.

## 2. Enable Auth providers

In the Firebase console: **Build → Authentication → Get started**, then on the
**Sign-in method** tab enable:

- **Google** — pick a support email; that's all that's required.
- **Email/Password** — toggle the first option on. Leave passwordless link off.

Under **Authentication → Settings → Authorized domains** add:

- `localhost` (already present)
- Your eventual Vercel production domain (e.g. `personal-tracker.vercel.app`)
  and any custom domain you'll attach. You can come back and add the exact
  Vercel domain after the first deploy if you don't know it yet.

## 3. Create the Firestore database

1. **Build → Firestore Database → Create database**.
2. Pick **Production mode** (we'll deploy our own rules in a moment).
3. Choose a region close to you (e.g. `us-east1` or `europe-west1`). This is
   permanent — don't pick lightly. For a single user, latency to your
   location matters more than anything else.

## 4. Register a web app

In **Project settings → General → Your apps**, click the **`</>`** icon to add
a web app. Skip the "Also set up Firebase Hosting" checkbox — we use Vercel.

Firebase shows a `firebaseConfig` object. You'll need these six values:

```js
{
  apiKey: "AIza...",                           // NEXT_PUBLIC_FIREBASE_API_KEY
  authDomain: "<project>.firebaseapp.com",     // NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN
  projectId: "<project-id>",                   // NEXT_PUBLIC_FIREBASE_PROJECT_ID
  storageBucket: "<project>.appspot.com",      // NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET
  messagingSenderId: "1234567890",             // NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID
  appId: "1:1234567890:web:abc123"             // NEXT_PUBLIC_FIREBASE_APP_ID
}
```

These are safe to commit to a public repo via env vars — Firebase web config
is not a secret. Access control is enforced by Auth + Firestore rules.

## 5. Configure local `.env.local`

```bash
cp .env.local.example .env.local
```

Open `.env.local` and paste the six `NEXT_PUBLIC_FIREBASE_*` values from the
previous step.

Set the allowlist to your own email (lowercase):

```
NEXT_PUBLIC_ALLOWED_EMAILS=you@example.com
```

Multiple emails are comma-separated, case-insensitive:

```
NEXT_PUBLIC_ALLOWED_EMAILS=you@example.com,partner@example.com
```

Run:

```bash
npm install
npm run dev
```

Open <http://localhost:3000>, sign in with Google or email/password, and you
should land on the dashboard. If the email isn't on the allowlist you'll get
bounced to `/not-authorized`.

## 6. Deploy `firestore.rules`

The rules in [`firestore.rules`](../firestore.rules) hard-code the same
allowlist. Until you edit and deploy them, **no writes will succeed in
production** even with a valid sign-in.

### One-time CLI setup

```bash
npm i -g firebase-tools
firebase login
```

### Pick the project

```bash
firebase use --add
# Choose the project you created in step 1, give it the alias 'default'.
```

This writes a `.firebaserc` at the repo root (gitignored is fine — it's just
your local project alias).

### Edit the allowlist

Open `firestore.rules` and update the `allowed()` function with your email(s),
matching whatever you put in `NEXT_PUBLIC_ALLOWED_EMAILS`:

```
function allowed() {
  return [
    'you@example.com'
  ];
}
```

Keep emails **lowercase** — that's what Firebase Auth stores in
`request.auth.token.email`.

### Deploy

```bash
firebase deploy --only firestore:rules
```

Confirm in the console under **Firestore Database → Rules** that the new
rules are live.

> See [`FIRESTORE_RULES.md`](FIRESTORE_RULES.md) for the rules model,
> per-collection validators, and the local rules-test workflow.

## 7. Link the GitHub repo to Vercel

1. Push the repo to GitHub if you haven't.
2. Go to <https://vercel.com/new> and **Import** the repo.
3. Framework preset: **Next.js** (auto-detected).
4. Root directory: repo root.
5. Build command: leave default (`next build`).
6. Output directory: leave default (`.next`).
7. **Do not deploy yet** — first add the env vars below, otherwise the first
   build will succeed but the runtime will throw on Firebase init.

By default Vercel auto-deploys:

- `main` → Production
- Any other branch / PR → Preview

That's exactly what we want.

## 8. Set Vercel env vars

In the Vercel project: **Settings → Environment Variables**. Add each of the
following for **Production**, **Preview**, and **Development** (the same value
for all three is fine for a single-user app):

| Key                                       | Value                                              |
| ----------------------------------------- | -------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`            | from Firebase config                               |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`        | `<project>.firebaseapp.com`                        |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`         | `<project-id>`                                     |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`     | `<project>.appspot.com`                            |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`| from Firebase config                               |
| `NEXT_PUBLIC_FIREBASE_APP_ID`             | from Firebase config                               |
| `NEXT_PUBLIC_ALLOWED_EMAILS`              | same comma-separated list as your local env        |

After adding, trigger a deploy from the **Deployments** tab (or push a
trivial commit to `main`).

> Tip: `vercel env pull .env.local` from the Vercel CLI will sync these down
> if you'd rather manage them in the Vercel UI than in a local file.

## 9. Verify production sign-in

Once the deploy is green:

1. Open the production URL (`https://<project>.vercel.app`).
2. You should be redirected to `/login`.
3. Sign in with Google or email/password using an allowlisted address.
4. You should land on the dashboard. Create a workout or a check-in to
   verify Firestore writes succeed (any rule failure shows up as a console
   error and a toast).

If sign-in fails with `auth/unauthorized-domain`, go back to
**Authentication → Settings → Authorized domains** in Firebase and add the
exact Vercel domain.

## Subsequent deploys

```bash
git push origin main
```

Vercel builds and ships within ~2–3 minutes. PRs and non-main branches get
their own preview URL automatically.

## Rolling the allowlist

Two places need to match. Both require a deploy of the artifact that owns
them:

| Allowlist                       | Lives in                | Deploy by                                |
| ------------------------------- | ----------------------- | ---------------------------------------- |
| App shell (UI gate)             | `NEXT_PUBLIC_ALLOWED_EMAILS` env var | Update in Vercel → redeploy   |
| Firestore (server-side gate)    | `allowed()` in `firestore.rules`     | `firebase deploy --only firestore:rules` |

Drift between them is the most common foot-gun: a user who's only on the app
allowlist will see the UI but every write will fail with `permission-denied`.

## Troubleshooting

| Symptom                                          | Likely cause                                                                 |
| ------------------------------------------------ | ---------------------------------------------------------------------------- |
| White screen, console says "Firebase: Error (auth/invalid-api-key)" | Missing or wrong `NEXT_PUBLIC_FIREBASE_*` in Vercel — redeploy after fixing. |
| Sign-in popup closes immediately                 | `auth/unauthorized-domain` — add the Vercel domain to Firebase authorized domains. |
| Sign-in works, but `/not-authorized` shows       | Email isn't on `NEXT_PUBLIC_ALLOWED_EMAILS` (case-insensitive match).        |
| Sign-in + dashboard works, but every write fails | Email isn't in `allowed()` in `firestore.rules`, or rules weren't deployed.  |
| Vercel build fails on type errors                | Run `npm run typecheck` locally — production builds run a full type check.  |
| Local writes fail with "Missing or insufficient permissions" | Rules deployed to a different Firebase project than the one your `.env.local` points at. |
