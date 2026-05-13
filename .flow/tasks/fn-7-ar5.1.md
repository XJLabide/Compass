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
Added README.md (quick start, env vars, scripts, layout, security TL;DR) and docs/DEPLOYMENT.md (end-to-end Firebase + Vercel setup, rules deploy, env wiring, verification, troubleshooting). Docs-only task; no app code touched.
## Evidence
- Commits: 8baced79e3cc19522598929ca3994d1fda04619d
- Tests:
- PRs: