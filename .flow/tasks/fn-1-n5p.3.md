## Description
Add the minimum PWA surface using Next.js native conventions: `app/manifest.ts`, a `viewport` export on the root layout, and a theme color. Real icons + install UX are deferred to E7 — placeholder icons OK here.

**Size:** S
**Files:** `src/app/manifest.ts`, edit `src/app/layout.tsx` (add `viewport` export), `public/icon-192.png` (placeholder), `public/icon-512.png` (placeholder)

## Approach
- `viewport`: `{ width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#0a0a0b' }` (matches `bg` token).
- Manifest fields: name, short_name, start_url=`/`, display=`standalone`, background_color, theme_color, icons[].
- Placeholder icons can be solid-color PNGs (call them out in PR notes for E7 replacement).

## Acceptance
- [ ] `GET /manifest.webmanifest` returns valid JSON
- [ ] Chrome DevTools "Application > Manifest" panel shows no errors
- [ ] iOS status bar honors theme color in standalone mode
- [ ] Lighthouse mobile PWA category passes "Web app manifest meets installability requirements"

## Done summary
Added PWA basics: `src/app/manifest.ts` exposing `/manifest.webmanifest` with standalone display + `#0a0a0b` theme/background, `viewport` export on the root layout with `viewportFit: 'cover'` and matching themeColor, Apple PWA meta, and placeholder 192/512 PNG icons in `public/` (to be replaced in E7).
## Evidence
- Commits: 291d222b4dfe5deabf88cf24f0593bc5b0d020ba
- Tests: npm run typecheck, npm run build
- PRs: