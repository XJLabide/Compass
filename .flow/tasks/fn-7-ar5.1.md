## Description
Set up Vercel deployment connected to GitHub, configure all env vars, and write README + DEPLOYMENT docs.

**Size:** M
**Files:** `README.md`, `docs/DEPLOYMENT.md`, no app code changes expected

## Approach
- Vercel project linked to `main`; Production + Preview deployments enabled.
- Envs in Vercel: all `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_ALLOWED_EMAILS`.
- README: quick start (clone, `npm install`, `.env.local` from example, `npm run dev`).
- DEPLOYMENT: Firebase project creation, enabling Google + Email/Password providers, deploying `firestore.rules`, Vercel link + env setup.

## Acceptance
- [ ] Pushing to `main` triggers a Vercel deploy that succeeds
- [ ] Production URL loads `/login` and sign-in works end-to-end
- [ ] A new dev following README can run the app locally in <10 minutes
- [ ] DEPLOYMENT doc covers Firebase project + rules deploy

## Done summary
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
