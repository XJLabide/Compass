## Description
Add a minimal ESLint config so `npm run lint` works without prompts, then verify all three quality gates (`typecheck`, `lint`, `build`) are green on a clean clone.

**Size:** S
**Files:** `.eslintrc.json`

## Approach
- Use `{ "extends": "next/core-web-vitals" }` — minimal, sufficient.

## Acceptance
- [ ] `npm run lint` exits 0 on fresh clone (after `npm install`)
- [ ] `npm run typecheck` exits 0
- [ ] `npm run build` exits 0 and outputs `.next/`

## Done summary
Added minimal `.eslintrc.json` extending `next/core-web-vitals` so `npm run lint` runs non-interactively. Verified all three M0 quality gates green: `npm run typecheck`, `npm run lint`, and `npm run build` (outputs `.next/`).
## Evidence
- Commits: a00e9e23dcdf7dc91692bc72af3252ec168db579
- Tests: npm run typecheck, npm run lint, npm run build
- PRs: