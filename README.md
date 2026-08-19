# Personal Tracker

A single-user PWA for tracking strength training, daily check-ins (bodyweight,
sleep, nutrition, mood), and lifting PRs. Built with Next.js 14 (App Router),
Firebase Auth + Firestore, and Tailwind. Designed mobile-first so it works as
a home-screen app on iOS and Android.

## Stack

- **Next.js 14** (App Router, React 18)
- **Firebase** — Auth (Google + Email/Password) and Firestore
- **Tailwind CSS** for styling
- **Recharts** for charts (e1RM trend, etc.)
- **date-fns** for date math
- **Hosting:** Vercel (auto-deploys from `main`)

## Quick start

Requires Node 18+ and an npm 9+ install. You also need a Firebase project — see
[`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) if you don't have one yet.

```bash
# 1. Clone and install
git clone <your-fork-url> personal-tracker
cd personal-tracker
npm install

# 2. Configure environment
cp .env.local.example .env.local
# Fill in NEXT_PUBLIC_FIREBASE_* values from your Firebase project's
# web app config, and add your email to NEXT_PUBLIC_ALLOWED_EMAILS.

# 3. Run the dev server
npm run dev
# Open http://localhost:3000 and sign in with an allowlisted email.
```

That's it for local dev. The first sign-in writes a profile doc into Firestore
under `users/{uid}/profile`.

## Environment variables

All Firebase values come from your Firebase web app config
(Project settings → General → Your apps → SDK setup and configuration).

| Variable                                  | Description                                                |
| ----------------------------------------- | ---------------------------------------------------------- |
| `NEXT_PUBLIC_FIREBASE_API_KEY`            | Firebase web API key                                       |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`        | Local: `<project-id>.firebaseapp.com`. Production PWA: your app domain, with `/__/auth/*` proxied by `next.config.mjs`. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID`         | Firebase project ID                                        |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET`     | `<project-id>.appspot.com`                                 |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID`| Numeric sender ID                                          |
| `NEXT_PUBLIC_FIREBASE_APP_ID`             | Firebase app ID (`1:...:web:...`)                          |

For installed iOS PWAs, Google sign-in uses Firebase redirect auth. On Vercel,
set `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` to the deployed app domain and add that
exact domain in Firebase Auth authorized domains.

## Scripts

| Command            | What it does                                  |
| ------------------ | --------------------------------------------- |
| `npm run dev`      | Next.js dev server on port 3000               |
| `npm run build`    | Production build (also catches type errors)   |
| `npm run start`    | Run the production build locally              |
| `npm run lint`     | ESLint (Next config)                          |
| `npm run typecheck`| `tsc --noEmit` — strict TypeScript check       |

## Project layout

```
src/
  app/
    (auth)/         # /login, /not-authorized
    (app)/          # signed-in shell: dashboard, workout, history, settings
    api/            # (none in v1)
  components/       # shared UI (cards, sheets, charts)
  lib/              # firebase init, dates, e1RM, validators, repositories
docs/
  DEPLOYMENT.md     # Vercel + Firebase project setup
  FIRESTORE_RULES.md# Rules model, deploy, allowlist editing
  PRD.md            # Product requirements
firestore.rules     # Source of truth for security rules
tests/              # Rules tests via @firebase/rules-unit-testing
```

## Deploying

See [`docs/DEPLOYMENT.md`](docs/DEPLOYMENT.md) for a step-by-step setup of:

1. A Firebase project with Google + Email/Password providers
2. Deploying `firestore.rules`
3. Linking the GitHub repo to Vercel
4. Wiring the same `NEXT_PUBLIC_*` env vars into Vercel

Pushes to `main` trigger a Vercel production deploy.

## Security model (TL;DR)

- Firestore is locked down by [`firestore.rules`](firestore.rules): a request
  is only allowed if the caller is authenticated, the `request.auth.uid`
  matches the `{uid}` in the path.
- The app shell requires Firebase Auth, but it does not maintain a separate
  email allowlist.
- The `NEXT_PUBLIC_*` env vars are public by design — Firebase web config is
  not a secret. Access control happens via Firebase Auth + owner-scoped
  Firestore rules, not by hiding the API key.

## License

Private / unlicensed. Personal project.
