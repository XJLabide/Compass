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
_To be filled in when the task is completed._

## Evidence
_Commands run, outputs, screenshots — added during work._
