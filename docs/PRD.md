# Personal Tracker — Product Requirements Document

**Status:** Draft v0.1
**Owner:** Xander
**Last updated:** 2026-05-13

---

## 1. Vision

A single-user personal dashboard that makes hitting a **muscle-gain goal** the path of least resistance. Every screen is built around one question: *"Did I do the things today that move me toward more muscle?"*

The app is opinionated, not generic. It assumes a structured Upper/Lower lifting program, detailed logging, and that daily inputs (training, sleep, food, weight) roll up automatically into goal progress — no separate "review" step required.

## 2. Goals (what success looks like)

| # | Goal | Measured by |
|---|------|-------------|
| G1 | I open the app every day | 7-day login streak ≥ 90% over 4 weeks |
| G2 | I log every training session | ≥ 95% of planned sessions logged within 24h |
| G3 | I see weekly trends without thinking | Dashboard shows bodyweight, protein avg, training volume, sleep avg at a glance |
| G4 | I gain muscle | Bodyweight trends up at 0.25–0.5 lb/week with strength PRs increasing |

## 3. Non-goals (v1 explicitly does NOT do)

- Multi-user / social / sharing
- Food database / barcode scanning (protein + calories are typed numbers in v1)
- Wearable integration (Apple Health, Whoop, etc.)
- Habits, goals UI, to-do list (deferred to v2 — see §10)
- Coaching logic, AI recommendations, deload algorithms
- Native mobile app (PWA-friendly web only)

## 4. Target user

One user: me. Intermediate lifter on an Upper/Lower 4-day split, in a lean bulk, willing to spend up to 5 minutes/day on detailed logging if the UX is fast.

## 4b. Platform — mobile-first

**Primary device: phone.** The app is used in the gym (one-handed, sweaty, sometimes bad lighting), in bed (sleep entry), and at the kitchen table (food log). Desktop is a secondary "review trends" surface, not the build target.

Design rules (binding for v1):

- **Layout:** single-column, max-width ~420px on mobile, scales up gracefully on desktop. No multi-column dashboards on mobile.
- **Navigation:** bottom tab bar (Home / Workout / Check-in / History / Settings) — thumb-reach, not a hamburger.
- **Touch targets:** ≥ 44×44 px. Number inputs use `inputmode="decimal"` so the numeric keypad opens instantly.
- **Workout logger specifically:**
  - Sticky exercise header while scrolling sets
  - Large weight/reps steppers (+/- buttons) in addition to direct entry — usable in gloves
  - Auto-advance to next set after logging
  - No modals that block the whole screen for a single set; use inline editing
- **Daily check-in:** fits on one screen without scrolling on a 6.1" phone. Submit button always visible (sticky footer).
- **Dashboard:** stacked cards, swipeable charts. Top of page = today's CTAs (log workout / check in) — anything older lives below the fold.
- **Performance:** first interactive < 2s on 4G. Skeleton states, not spinners. Charts render after critical content.
- **PWA basics:** installable to home screen, dark theme on iOS status bar, viewport meta correct, no horizontal scroll ever.
- **Offline:** designed-for but not required in v1 (see §12 Q4). Firestore offline persistence enabled so logs queue silently on bad gym wifi.

Desktop is "responsive grows-up" — same components, more columns where space allows. Not a separate codepath.

## 5. v1 scope — modules

### 5.1 Auth
- Firebase Auth, email/password + Google sign-in
- Single account, no signup flow for others initially (allowlist email)
- Protected app shell — unauthed users see only `/login`

### 5.2 Workout module (the heart of the app)
**Program model:**
- Built-in Upper/Lower 4-day template, editable
- Program = ordered list of *sessions* (Upper A, Lower A, Upper B, Lower B)
- Each session = list of *planned exercises* with target sets × rep range

**Logging flow:**
- Tap "Start session" on dashboard → pre-populated exercise list from program
- For each exercise: log sets (weight, reps, RPE 1–10)
- Quick-add unplanned exercises mid-session
- Per-session: optional notes + soreness check-in for next session
- Auto-detect PRs (heaviest weight × reps, e1RM) and surface a 🔥 marker

**Data shown:**
- Last-session weights pre-filled as suggestions
- Per-exercise history graph (e1RM over time)

### 5.3 Daily check-in module
One screen, one form, one submit. Captures:
- Bodyweight (lb or kg, user preference)
- Sleep: hours + quality (1–5)
- Calories (number) + protein grams (number)
- Water (cups/L)
- Steps (number, manual entry — no health-kit in v1)
- Mood / energy (1–5)
- Free-text "note"

Defaults: yesterday's values pre-fill where it makes sense (target protein, target calories).

### 5.4 Dashboard (home)
Top-of-app view, single scroll. Sections in order:
1. **Today** — date, "log workout" CTA if scheduled, "daily check-in" CTA with completion badge
2. **Goal banner** — bodyweight trend vs target (e.g. "+0.3 lb/wk over last 4 wks — on track")
3. **This week** — workouts done / planned, avg protein, avg sleep, weight delta
4. **Trends** (4 mini-charts) — bodyweight, weekly training volume, protein avg, sleep avg, last 8 weeks
5. **Recent PRs** — last 3 PRs with date

## 6. Goal roll-up logic (auto)

The "muscle gain" goal isn't a separate screen in v1 — it's the dashboard. Roll-up rules:

| Daily input | Rolls up to |
|---|---|
| Workout logged | This-week count + training volume chart |
| Bodyweight entry | Bodyweight trend chart + weekly delta |
| Protein grams | Weekly avg + "% of days hit target" |
| Sleep hours | Weekly avg |
| Set PR | Recent PRs strip |

User sets two targets in settings: **protein target (g/day)** and **bodyweight rate-of-gain (lb/week)**. Dashboard colors green/yellow/red against these.

## 7. Technical stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | Next.js 14 (App Router) + TypeScript | Industry standard, fast iteration |
| Styling | Tailwind CSS | Speed; consistent with dark-first design |
| Auth | Firebase Auth | Free, simple, Google sign-in built-in |
| DB | Firestore | Free tier easily covers single-user, real-time, simple schema |
| Hosting | Vercel | Free, GitHub → auto-deploy |
| Charts | Recharts | Lightweight, declarative |
| Icons | lucide-react | Clean, consistent |

## 8. Data model (Firestore)

All collections scoped under `users/{uid}/...`

```
users/{uid}
  profile: { displayName, unitSystem: "imperial"|"metric", proteinTargetG, weeklyGainLb, createdAt }

users/{uid}/program/active
  name: "Upper/Lower"
  sessions: [
    { id, name: "Upper A", exercises: [{ exerciseId, name, targetSets, repRangeLow, repRangeHigh, order }] }
  ]

users/{uid}/exercises/{exerciseId}     // master list (seeded + user-added)
  name, primaryMuscle, category

users/{uid}/sessions/{sessionId}       // a logged workout
  date, programSessionId, name, durationMin, notes
  sets: [{ exerciseId, weight, reps, rpe, isPR, order }]

users/{uid}/daily/{YYYY-MM-DD}         // one doc per day
  bodyweight, sleepHours, sleepQuality, calories, proteinG, waterCups, steps, mood, note, updatedAt

users/{uid}/prs/{prId}                 // denormalized PR feed
  exerciseId, exerciseName, weight, reps, e1RM, sessionId, date
```

## 9. Pages / routes

| Route | Purpose |
|---|---|
| `/login` | Email + Google sign-in |
| `/` | Dashboard (auth required) |
| `/workout/new` | Start/log a session |
| `/workout/[sessionId]` | View past session |
| `/check-in` | Daily check-in form |
| `/history` | Sessions list + check-in calendar |
| `/exercise/[id]` | Exercise history + e1RM chart |
| `/settings` | Targets, unit system, program editor |

## 10. v2 backlog (NOT in v1)

Tracked here so we don't forget but explicitly out of scope:
- To-do list (daily tasks, carry-forward)
- Habits + streaks (independent of workouts)
- Goals UI (multiple goals, milestones, progress bars)
- Apple Health / Google Fit import
- Photo progress (monthly selfies)
- Cardio/sports session types
- Deload week detection + recommendations
- CSV/JSON export

## 11. Success metrics (after 4 weeks of use)

- **Engagement:** ≥ 6/7 days/week of app open
- **Completeness:** ≥ 90% of daily check-ins filled, ≥ 95% of planned sessions logged
- **Outcome:** measurable progress — bodyweight up, ≥ 1 PR per exercise per 4 weeks

## 12. Open questions

1. **Sign-in:** Google-only OK, or also email/password? *(default: both)*
2. **Units:** does the app need to support switching mid-stream, or pick once at onboarding? *(default: pick once, editable)*
3. **Rest timer:** built into workout logger, or skip in v1? *(default: skip, add in v2)*
4. **Offline support:** PWA + offline queue for workouts on bad gym wifi? *(default: skip v1, but design schema to allow it)*
5. **Backup:** Firestore is the source of truth — do we need a periodic JSON export? *(default: defer to v2)*

## 13. Open risks

| Risk | Mitigation |
|---|---|
| Friction in daily check-in tanks adoption | Pre-fill yesterday's values, single-screen form, < 60 sec to submit |
| Workout logging on phone in the gym is slow | Number-pad inputs, big touch targets, last-session prefill |
| Firestore free tier overrun | Single user, low write volume — verify after 1 week of usage |
| Lock-in to Firebase | Schema documented above; export script in v2 |

---

**Next step after PRD approval:** write `ARCHITECTURE.md` (Firestore rules, route structure, component breakdown) and `ROADMAP.md` (week-by-week build plan to v1).
