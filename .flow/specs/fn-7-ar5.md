# Deploy + PWA Polish — Vercel, offline persistence, install prompt, docs

## Overview
Make it shippable: deploy to Vercel from main branch, polish the PWA story (real icons, install prompt UX, safe-area pass, theme color), enable Firestore offline persistence so logs queue silently on gym wifi, and write the deployment + README docs.

## Scope
**In:**
- Vercel project linked to GitHub repo; main branch auto-deploys
- All `NEXT_PUBLIC_FIREBASE_*` and `NEXT_PUBLIC_ALLOWED_EMAILS` set in Vercel project envs
- Firestore offline persistence enabled via `initializeFirestore` with `persistentLocalCache({ tabManager: persistentMultipleTabManager() })`
- Connection-aware UX: small offline indicator at the top of the app shell when `navigator.onLine === false`
- PWA polish:
  - Real `icon-192.png` and `icon-512.png` (placeholder OK; flagged)
  - `apple-touch-icon` link
  - Install prompt: capture `beforeinstallprompt`, surface a small "Install" button in Settings; iOS detection -> show manual "Add to Home Screen" instructions
  - Verify Lighthouse PWA score >= 90
- Safe-area pass: audit every fixed/sticky element for `env(safe-area-inset-*)`
- Docs: `README.md` (quick start), `docs/DEPLOYMENT.md` (Vercel + Firebase setup), `docs/FIRESTORE_RULES.md` (rules deploy, allowlist editing)

**Out:**
- Service worker beyond what Next.js generates / required by manifest (custom SW is v2)
- Push notifications (v2)
- Sentry / analytics (v2)

## Approach
- Use Next.js native `app/manifest.ts` + `viewport` export (no `next-pwa`).
- Offline indicator implemented in app shell layout; subscribes to `online`/`offline` events.
- Install prompt logic in a small client component mounted in Settings.

## Quick commands
```bash
# Local PWA smoke:
npm run build && npm run start
# Run Lighthouse mobile audit in Chrome DevTools -> PWA category
```

## Acceptance
- [ ] Pushing to main deploys to Vercel within 3 minutes
- [ ] Production URL loads with all envs wired (no Firebase init errors)
- [ ] Firestore writes attempted offline are queued and sync when reconnected
- [ ] Offline indicator appears when network is killed, disappears on reconnect
- [ ] App is installable from Chrome address bar; Settings exposes install button
- [ ] iOS Safari shows the "Add to Home Screen" hint when not yet installed
- [ ] Lighthouse mobile PWA score >= 90
- [ ] README and DEPLOYMENT docs let a fresh clone reach a deployed instance

## References
- Vercel + Next.js: https://vercel.com/docs/frameworks/nextjs
- Firestore offline: https://firebase.google.com/docs/firestore/manage-data/enable-offline
- PWA install: https://nextjs.org/docs/app/guides/progressive-web-apps
