## New Product Direction

Refocus the app on three core features: **To-Do List + Calendar + Daily Mini Journal**. Remove the entire goal/forest/checkpoint system.

### 1. Removals

Delete these files entirely:
- `src/pages/Forest.tsx`
- `src/pages/Goals.tsx`
- `src/pages/GoalDetail.tsx`
- `src/pages/NewGoal.tsx`
- `src/pages/Share.tsx`
- `src/lib/goals-store.ts`
- `src/components/GrowthPlant.tsx`
- `src/components/WeeklySummaryModal.tsx`

Remove routes, nav links, and imports referring to them from `App.tsx` and `BottomNav.tsx`.

Strip i18n keys that only referenced goals/forest/checkpoints.

### 2. To-Do List (Home `/`)

Simplify `src/pages/Index.tsx`:
- Header: today's date + streak + today's completion %
- Single task list (no "goal actions" vs "other tasks" split)
- Fast add via floating `+` button and inline input
- Tap to toggle, swipe/hover to delete, tap task text to edit inline
- Quick-add chips at top: user's **Reusable Tasks** — one tap adds to today
- Below tasks: **Daily Mini Journal** — a single text area, saved to that day's `reflection`. Placeholder copy: "One thing you did today toward something important to you." Optional.

### 3. Reusable Tasks

New feature stored in localStorage under `reusable-tasks`:
- `src/lib/reusable-tasks.ts` with `loadReusable/saveReusable/addReusable/removeReusable`
- Managed in **Settings** page: list + add + delete
- Surfaced on Home as a horizontally scrollable chip row above the task list; tapping a chip adds that task to today

### 4. Calendar (`/calendar`, replaces Monthly)

Rewrite `src/pages/Monthly.tsx` → `src/pages/Calendar.tsx`:
- Month grid (familiar Google Calendar style) with dots for days that have events
- Tap a day → day view showing time-ordered events + tasks for that date
- **Events** stored in localStorage under `calendar-events`:
  - `{ id, title, date (YYYY-MM-DD), startTime (HH:mm), endTime?, notes? }`
- Actions: Add, Edit, Move (change date/time), Delete via a dialog form using existing shadcn `Dialog`, `Input`, and date picker
- New file: `src/lib/events-store.ts`

### 5. Bottom Nav

Three tabs only: **Today** (`/`) · **Calendar** (`/calendar`) · **Settings** (`/settings`).

### 6. Settings

Keep language switch. Add "Reusable Tasks" management section. Remove any goal-related settings.

### 7. i18n

Add keys: `calendar`, `events`, `addEvent`, `editEvent`, `deleteEvent`, `eventTitle`, `startTime`, `endTime`, `notes`, `reusableTasks`, `addReusable`, `journalPrompt`, `today`, `settings`. Prune goal-related keys.

### Technical Notes

- Data model kept in localStorage (no backend added). Existing `store.ts` (`DayData` with `tasks` + `reflection`) is retained and reused for the journal.
- No new dependencies required — `date-fns` and shadcn `Calendar`/`Dialog`/`Popover` are already available.
- Old localStorage keys (`growth-goals`, `growth-forest`, `growth-single-goal`) are left untouched (dormant) rather than migrated, to avoid destructive changes; they simply stop being read.

### Out of Scope

- No cloud sync, no auth, no notifications, no recurring events (can be added later if requested).
