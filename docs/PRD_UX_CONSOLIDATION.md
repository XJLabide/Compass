# PRD: Navigation & Daily Experience Consolidation

**Document Status:** Approved for Implementation  
**Target Version:** Compass v2.1  
**Author:** AI Pair Programmer & Xander  
**Last Updated:** 2026-07-27  

---

## 1. Executive Summary

As Compass has grown, the app has expanded to 9 distinct top-level navigation items (`Home`, `Today`, `Nori`, `Todos`, `Money`, `Workout`, `Nutrition`, `Check-in`, `History`, `Settings`). This clutter creates cognitive overhead, feature duplication (e.g., logging metrics on `/check-in` vs `/today`), and ambiguity surrounding "Routines" (daily habits vs workout routines).

This PRD defines the consolidation of Compass into **6 core navigation hubs**, unifying the daily experience into `/today`, resolving routine naming ambiguities, and preserving **100% of underlying backend data models, security rules, and Nori AI tool contracts**.

---

## 2. Goals & Success Criteria

| # | Goal | Target Metric / Result |
|---|------|------------------------|
| **G1** | **Streamline Primary Navigation** | Reduce primary sidebar / bottom bar items from 9 down to 6 clean hubs. |
| **G2** | **Eliminate Feature Duplication** | Consolidate daily check-in logging and history archives directly into `/today`. |
| **G3** | **Clarify Habit vs Workout Concepts** | Rename daily routine items to "Habits" across the UI and provide habit management directly inside `/today`. |
| **G4** | **Zero Regression / Non-Interference** | 100% backwards compatibility with Firestore schemas, security rules, and Nori AI tools. |

---

## 3. Non-Interference Guarantee (Strict Boundary)

> [!IMPORTANT]
> **Data Model & Backend Integrity:**
> This consolidation is strictly a **frontend UX refactoring**. The following core systems will remain **completely untouched**:
> 1. **Firestore Database Schemas**: `users/{uid}/daily/{date}`, `users/{uid}/routines`, `users/{uid}/profile`, `users/{uid}/todos`, `users/{uid}/expenses`, and `users/{uid}/sessions` retain their exact structure and fields.
> 2. **Firestore Security Rules**: [firestore.rules](file:///Users/xander/Documents/Projects/Personal Tracker/firestore.rules) will not be modified or weakened.
> 3. **Nori AI Tools & Executors**: All tool definitions (`log_check_in`, `get_check_in`, `list_routines`, `check_routine`, `log_food`) and OpenRouter handlers continue functioning seamlessly.
> 4. **Existing URL Bookmarks**: Legacy route `/check-in` will automatically client-side redirect to `/today` to avoid broken links.

---

## 4. Navigation Architecture

### 4.1 Primary Navigation (6 Core Hubs)

```
Compass App
 ├── 🏠 Home        (/)        — High-level executive dashboard & trend analytics
 ├── ☀️ Today       (/today)   — Daily Execution Hub (Habits, Check-in Form, Nutrition & Reflection)
 ├── 🥗 Nutrition   (/nutrition)— Food logging console, meal categories & favorites library
 ├── 💪 Workout     (/workout) — Training sessions, exercise library & workout programs
 ├── 💰 Finance     (/money)   — Expense tracking, income & budget analytics
 └── ✨ Nori AI     (/nori)    — Conversational AI assistant
```

*Note: `Settings` remains in the sidebar footer / mobile menu. `Todos` is integrated cleanly alongside daily tasks.*

---

## 5. Detailed Feature Specifications

### 5.1 Consolidated Today Page (`/today`)
The `/today` route becomes the single **Daily Execution Hub**. It organizes the day chronologically into focused sections:

1. **Header & Date Selector**:
   - Displays current date with a fast **Date Picker** dropdown allowing users to scrub back up to 7 days (incorporating the functionality of `/history`).
2. **Habits Checklist (formerly Routines)**:
   - Categorized by time blocks (*Morning*, *Midday*, *Evening*, *Before-Bed*, *Anytime*).
   - "Manage Habits" button opens an inline drawer to create/edit habits without leaving `/today`.
3. **Daily Check-in Section**:
   - Compact, interactive inputs for **Bodyweight**, **Sleep (Hours & Quality)**, **Water**, **Mood**, and **Steps**.
   - Auto-saves into the day's `DailyDoc`.
4. **Nutrition & Macro Summary**:
   - Displays target vs consumed Calories, Protein, Carbs, and Fats alongside the animated **MacroRatioChart**.
   - Includes a quick-add food button + link to `/nutrition`.
5. **Daily Reflection & Notes**:
   - Collapsible input blocks for **Wins**, **Struggles**, **Plan for Tomorrow**, and **Notes**.

### 5.2 Habits Management (Formerly Daily Routines)
- **Labeling**: All references to daily routines in the UI are updated to **"Habits"** to distinguish them from **Workout Programs/Routines**.
- **Management Drawer**: Clicking "Manage Habits" opens a modal drawer allowing the user to create new habits, set weekday schedules, and assign time-blocks (`morning`, `evening`, etc.).
- **Data Safety**: Underlying Firestore documents in `users/{uid}/routines` remain identical (`RoutineDoc`).

### 5.3 Legacy Route Redirection
- **`/check-in`**: Next.js redirect to `/today?checkin=true` (smoothly scrolling the user to the Check-in section).
- **`/history`**: Next.js redirect to `/today` with date selector drawer open.

---

## 6. Verification & Test Plan

1. **Automated Testing**:
   - `npm run typecheck` — verify zero TypeScript errors across modified components.
   - `npm run lint` — verify zero ESLint warnings.
   - `npm run build` — confirm clean Next.js production compilation.

2. **Integration Verification**:
   - Verify checking off a habit on `/today` updates Firestore in real-time.
   - Verify submitting a check-in on `/today` updates bodyweight, sleep, and mood fields on the `DailyDoc`.
   - Verify Nori AI can still call `log_check_in` and `log_food` without error.

---

## 7. Approval & Next Steps

This PRD is saved at [docs/PRD_UX_CONSOLIDATION.md](file:///Users/xander/Documents/Projects/Personal Tracker/docs/PRD_UX_CONSOLIDATION.md). Implementation can begin upon user command.
