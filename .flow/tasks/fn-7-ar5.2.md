## Description
Enable Firestore offline persistence with multi-tab support; add a connection-aware offline indicator to the app shell.

**Size:** S
**Files:** edit `src/lib/firebase.ts` (switch to `initializeFirestore` with cache options), `src/components/OfflineIndicator.tsx`, edit `src/app/(app)/layout.tsx`

## Approach
- Use `initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })` (per practice-scout — modern API).
- Indicator: subscribes to `window.online`/`offline` events; renders a small pill at the top of the app shell when offline.
- Wrap init in try/catch — Safari private mode + some webviews block IndexedDB.

## Acceptance
- [ ] Killing network in DevTools shows offline pill within 1s
- [ ] Writes attempted offline persist locally and sync on reconnect
- [ ] Opening a second tab does not throw `failed-precondition`
- [ ] Init failure is graceful (logged once, app still works without persistence)

## Done summary
Enabled Firestore offline persistence via `initializeFirestore` with `persistentLocalCache` + `persistentMultipleTabManager`, wrapped in try/catch for environments without IndexedDB. Added `OfflineIndicator` component subscribing to `online`/`offline` window events; mounted in the `(app)` shell layout.
## Evidence
- Commits: 6ecc06c022cf2d7be3c132d32cf172546e4e2f43
- Tests: npx tsc --noEmit (changed files clean), npx next lint (no warnings/errors on changed files)
- PRs: