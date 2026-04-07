# KrasbauerOS — Master Context File
> Single source of truth. Read this at the start of every session.
> Last updated: April 7, 2026 — Phase 10 complete + code quality pass. Next: Phase 11 (AI Secretary).

---

## Who is Krasbauer

Teacher in formation based in Morocco. Has a child, freelance work, a YouTube channel ambition, and around 10 ongoing projects with 30+ scattered tasks across car, house, career, family, health, and passions. Self-described as sporadic — motivated in bursts, then drops off. Building this tool specifically to fight that pattern.

**NOT a developer.** Understands concepts when explained but doesn't write code. Makes decisions about features and UX, and expects the tool to be built for him. Thoughtful and deliberate — pushed back on multiple suggestions, asked for competitive research before building, requested a critical review of his own plan before proceeding.

**Working style:**
- Prefers deliberate 10-minute planning sessions over quick capture
- Values seeing everything at a glance over deep interaction
- On a phone — every interaction must work with thumbs on a small screen
- Cares about the aesthetic: dark, minimal, cockpit energy
- Pushes back and asks "why" — silence does not mean agreement

---

## What This Project Is

KrasbauerOS is a personal Life Operating System — a PWA (Progressive Web App) that runs on Android Chrome, installs to the home screen, works fully offline after first load, and stores all data locally in IndexedDB. Hosted on GitHub Pages (free, auto-deploys on push).

It is NOT a todo app. It is NOT a calendar app. It is a cockpit — one place where the user sees every task, every project, every life domain, can schedule things into time blocks, gets alarms, and runs daily rituals to keep the system alive. The core goal is reducing mental charge to near zero.

---

## File Structure (current)

```
/krasbauer-os/
├── index.html                ← HTML skeleton only
├── style.css                 ← all CSS
├── app.js                    ← all JS
├── sw.js                     ← Service Worker (caching + notifications)
├── manifest.json             ← PWA config
├── CLAUDE.md                 ← this file
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

**Architecture rule:** No build tools, no frameworks, no npm. Plain HTML + CSS + JS. Deploy = `git push` (GitHub Pages auto-deploys from main branch). The Service Worker caches all assets for full offline use after first visit.

**Service Worker cache name:** `krasbauer-os-v4` — bump this string in `sw.js` whenever deploying a significant update so clients pick up new files.

---

## Key Design Decisions

- **Mobile-first, Android Chrome primary target.** Bottom tab bar navigation (4 tabs: Dashboard, Tasks, Calendar, Projects). Everything thumb-friendly. Minimum tap target 44px.
- **Dark cockpit aesthetic.** Near-black background (`#0a0a0f`). Domain colors are the ONLY bold elements. Sharp typography: Orbitron for display, Outfit for body. No clutter.
- **8 life domains** (The Pragmatist model): Body, Mind, Work, Family, Social, Environment, Passions, Growth. All customizable (rename, recolor, add, delete).
- **Eisenhower matrix** for priority: Do First / Schedule / Delegate / Eliminate.
- **Task statuses are non-linear tags**, not a pipeline: Todo, Scheduled, In Progress, Done, Reported. A task can go from Todo → Done directly. Calendar actions auto-update status.
- **Archived** is a separate flag, not a status. Archived items disappear from active views but remain searchable.
- **Duration is required** with quick-pick buttons: 15m / 30m / 1h / 2h / custom.
- **No quick capture bar.** The user prefers deliberate planning sessions.
- **Morning ritual** is an inviting dashboard card, NOT a blocking modal. Fades after noon if skipped.
- **Shutdown ritual** triggered by an alarm notification at a user-set evening time.
- **Wheel of Life** deferred — will add later when core system is proven.
- **Protected Time Zones** removed — redundant with Routine Blocks.
- **Focus Mode, Command Palette, Weekly Objectives** dropped for scope.
- **Project milestones** simplified to subtask checklists only.
- **AI Secretary** is Phase 11 (future). Addresses user as "Krasbauer", default tone sharp & direct.

---

## Domains — The Pragmatist (8, customizable)

| # | Domain | Icon | Color |
|---|--------|------|-------|
| 1 | Body | 🏃 | #00D4AA (teal) |
| 2 | Mind | 🧠 | #7B61FF (purple) |
| 3 | Work | 💼 | #3B82F6 (blue) |
| 4 | Family | 👨‍👩‍👧 | #F59E0B (amber) |
| 5 | Social | 🤝 | #EC4899 (pink) |
| 6 | Environment | 🏠 | #84CC16 (lime) |
| 7 | Passions | 🔥 | #EF4444 (red) |
| 8 | Growth | 🌱 | #06B6D4 (cyan) |

---

## IndexedDB Stores

| Store | Purpose |
|-------|---------|
| `tasks` | All tasks. Indexed by: domain, status, type, priority, archived, dueDate |
| `projects` | Project metadata: title, domain, notes, archived. Indexed by: domain, archived |
| `calendar_slots` | Time blocks linked to tasks. Indexed by: date, taskId |
| `routines` | Routine block definitions: name, schedule, startTime |
| `domains` | Domain config: name, color, icon, alertDays, order |
| `daily_logs` | Morning commits, shutdown reflections, rollover history. Key = `YYYY-MM-DD` date string. Field `shutdownDone: true` is written by shutdown ritual — used by midnight rollover check. |
| `settings` | User prefs: wakeTime, sleepTime, ritualAlarmTime, quietHours, lastBackupAt. Key = `'main'` |
| `alarms` | Scheduled notifications. Indexed by: triggerTime, taskId |

**DB_VERSION = 1.** Has not been bumped. If a new index or store is ever needed, bump this and handle `onupgradeneeded`.

---

## Task Data Model

```js
{
  id: genId(),           // timestamp base36 + random
  title: '',
  domain: 'work',        // domain ID
  type: 'one-off',       // 'one-off' | 'recurring' | 'project'
  priority: 'schedule',  // 'do-first' | 'schedule' | 'delegate' | 'eliminate'
  status: 'todo',        // 'todo' | 'scheduled' | 'inprogress' | 'done' | 'reported'
  duration: 30,          // minutes
  dueDate: '',           // 'YYYY-MM-DD' or ''
  notes: '',
  muted: false,          // suppress notifications for this task
  recurrence: null,      // 'daily' | 'weekly' | 'monthly' | 'weekdays' (if recurring)
  routineId: null,       // ID of routine block (if recurring)
  projectId: null,       // ID of parent project (if subtask)
  archived: false,
  rolloverCount: 0,
  blockType: 'flexible', // 'flexible' | 'anchored' (for Phase 11 AI)
  createdAt: Date.now(),
  updatedAt: Date.now(),
  completedAt: null
}
```

---

## Project Data Model

```js
{
  id: genId(),
  title: '',
  domain: 'work',
  notes: '',
  archived: false,
  createdAt: Date.now(),
  updatedAt: Date.now()
}
```

Subtasks are regular tasks with `projectId` set. Deleting a project unlinks subtasks (does not delete them).

---

## Technical Patterns

- **ID generation:** `genId()` = `Date.now().toString(36) + Math.random().toString(36).substr(2,6)`
- **DB helpers:** `dbPut(store, data)`, `dbGet(store, key)`, `dbGetAll(store)`, `dbDelete(store, key)`, `dbClear(store)`
- **Boot:** `initApp()` opens IndexedDB → seeds defaults → `loadAllTasks()` → loads `appDomains`, `appSettings`, `appRoutines` into memory → renders all views → `checkMidnightRollover()` → checks onboarding
- **In-memory state:** `appDomains[]`, `appSettings{}`, `appRoutines[]`, `allProjects[]`, `allTasks[]` cached at boot. `allTasks` is refreshed via `loadAllTasks()` after every mutation (not fetched inline). Other state is refreshed after relevant mutations.
- **Show/hide pattern:** modals and overlays use CSS `.open` class toggle with transitions
- **Toast:** `showToast(msg)` — slides up from above tab bar, auto-dismisses after 2.5s
- **Chip selectors:** `initChipSelector(id)`, `selectChip(id, value)`, `getSelectedChip(id)` — used in all forms
- **Date strings:** Always use `calDateStr(dateObj)` → `YYYY-MM-DD`. Never build manually.
- **Error handling pattern:** All async mutation functions have try/catch. On error: `console.error('[fnName]', err)` + `showToast('Action failed — try again')`.
- **Service Worker cache version:** `krasbauer-os-v4`

---

## What's Been Built

### Phase 1 — Foundation ✅
- PWA shell: manifest, icons, Service Worker (offline-first, background notifications)
- Bottom tab bar with 4 tabs and animated glow line indicator
- IndexedDB with all 8 stores, seeded with 8 default domains and default settings
- Settings panel (slide-in from right): wake/sleep/ritual times, domain editor (add/edit/delete with color picker), export/import JSON, reset all data
- Full task CRUD: create, view, edit, delete with all properties
- Task form is a bottom sheet with chip selectors for all fields
- Per-task mute toggle for notifications

### Phase 2 — Task Board ✅
- Search bar (title + notes, includes archived)
- Filter pills: status, priority, type
- Domain filter row (All + per-domain icon buttons)
- Sort toggle cycling: priority → due date → domain → newest
- Swipe right = Done, swipe left = Archive
- Swipe is direction-locked: vertical scroll intent cancels swipe (Y-axis guard added)
- Visual distinction: floating tasks have dashed left border; Scheduled have solid blue border
- Archive toggle at bottom, task count header

### Phase 3 — Calendar ✅
- Daily view (default): vertical hour grid from wake to sleep time
- Week strip at top: 7 days (Mon–Sun) with domain-colored dots, tap to navigate
- Prev/next arrows, Today button, Day/Week view toggle (all navigation is async-safe)
- Tap empty slot → bottom sheet listing all unscheduled tasks
- Tap task in picker → assigns to slot, status auto → Scheduled
- "+ New Task" in picker → creates task and auto-assigns
- Task blocks: domain-colored, height proportional to duration, title + time range
- Done tasks faded with strikethrough
- Red current-time indicator line (updates every minute)
- Auto-status logic: assign → Scheduled; remove → Todo
- Deleting a task cleans up its calendar slots

### Phase 4 — Notifications ✅
- Service Worker handles notification display with "Done" action button and click routing
- Start-time and end-time alarms stored in IndexedDB when tasks are scheduled
- Alarm checker runs every 30 seconds, fires due alarms via SW + in-app banner
- Quiet hours respected; per-task mute respected
- Alarms suppressed for tasks already marked Done (no ghost notifications)
- Shutdown ritual alarm: auto-schedules daily, reschedules after firing
- In-app alarm banner: slides down from top, auto-dismisses after 15s
- Calendar tab shows red pulsing badge when upcoming alarms exist today

### Phase 5 — Dashboard ✅
- Panel 1 (Today): live chronological list of today's scheduled tasks, domain color, time, duration, inline done-checkbox. Overcommitment warning (red alert) when total scheduled > available hours.
- Panel 2 (Overview): domain activity bars (completions per domain, last 7 days) with inactivity alert badges. Active projects list (real data, up to 5).
- Horizontal swipe between panels with dot indicators.

### Phase 6 — Rituals ✅
- **Morning ritual** — 4-step guided flow triggered by tapping the dashboard card:
  - Step 1: Yesterday recap (completed + rolled-over tasks with rollover count)
  - Step 2: Today's plan (pre-populated scheduled tasks)
  - Step 3: Quick adjustments (add/remove/reschedule tasks)
  - Step 4: Commit day — dismiss the card
  - Card fades after noon if skipped
- **Shutdown ritual** — 4-step guided flow triggered by alarm notification:
  - Step 1: Review tasks (check off done, mark Reported)
  - Step 2: Rollover (incomplete tasks auto-roll to tomorrow, rollover counter increments)
  - Step 3: Optional reflection line "How was today?"
  - Step 4: Close day → log entry saved to `daily_logs` with `shutdownDone: true`
  - Auto-rollover if dismissed

### Phase 7 — Recurring & Routines ✅
- **Recurring tasks:** recurrence field on task form (daily / weekly / monthly / weekdays)
- **Routine blocks:** named groups of recurring tasks (e.g. "Morning Routine")
  - Modal: name, schedule (daily/weekdays/weekly), preferred start time
  - Managed in Settings panel with edit/delete
- **Calendar rendering:** routine blocks appear as collapsible grouped slots
- **`generateRecurringSlots(startDate, endDate)`:** auto-generates calendar slots for recurring tasks. Called inside `renderCalendar()` directly (no monkey-patch).
- `appRoutines[]` loaded into memory at boot via `loadRoutines()`

### Phase 8 — Projects ✅
- **Projects tab:** header with project count + `+` button, project cards, archive toggle
- **Project cards:** domain color dot, title, progress bar (done subtasks / total), domain label
- **Swipe left on card → archive**
- **Project detail overlay** (full screen, tap project card to open):
  - Domain pill + archived badge
  - Progress block: big number (done/total) + percentage bar
  - Notes section — inline editable textarea, Save button appears on change
  - Subtasks checklist — tap circle to toggle done, tap title to open full task form
  - "+ Add Subtask" button — opens task form pre-linked to the project
  - Related calendar slots section (upcoming + past)
- **Edit / Archive / Delete** buttons in project detail header
- **Dashboard Overview panel** shows real active project cards (up to 5) with progress bars

### Phase 9 — Data Safety ✅
- **Export:** downloads JSON of all 8 IndexedDB stores. Sets `appSettings.lastBackupAt = Date.now()` on export.
- **Import preview:** 2-step process — parse JSON → show preview modal with store item counts → confirm to commit. Uses `_pendingImportData` global. On confirm: clears all stores, writes imported data, reloads all in-memory state.
- **Backup reminder card** in Settings: shows days since last backup. Pulses red + shows "Export now" button when overdue (> 7 days). Reads `appSettings.lastBackupAt`.

### Phase 10 — Polish ✅
- **Onboarding wizard:** 3-step full-screen overlay on first launch only (keyed to `localStorage: kos-onboarded`).
  - Step 0: Welcome screen
  - Step 1: Wake / sleep / shutdown alarm time inputs (pre-filled from defaults)
  - Step 2: Ready screen → "Let's go ✓" saves times to `appSettings` + DB, sets localStorage flag
  - Times captured via `_obTimes` global in `onboardingNext()`, cleared after `completeOnboarding()`
- **Midnight rollover:** `checkMidnightRollover()` runs at boot. Checks yesterday's calendar slots — if any tasks are still `scheduled` and `daily_logs[yesterday].shutdownDone` is not true, rolls them to `todo` and increments `rolloverCount`. Shows toast.
- **`allTasks` global cache:** `var allTasks = []` loaded once at boot via `loadAllTasks()`. Refreshed after every mutation. Eliminates per-render `dbGetAll('tasks')` calls.
- **Desktop layout:** `@media (min-width: 768px)` converts to CSS Grid: 180px sidebar (header + vertical tab nav) on left, content fills right. All overlays remain `position: fixed` (full-screen).

### Code Quality Pass ✅
- **Error handling:** All 9 async mutation functions wrapped in try/catch: `saveTaskForm`, `deleteCurrentTask`, `toggleTaskDone`, `archiveTask`, `assignTaskToSlot`, `removeSlot`, `toggleSubtaskDone`, `deleteCurrentProject`, `confirmResetData`.
- **Monkey-patches eliminated:** `renderDomainBars` and `renderCalendar` overrides merged into original function bodies. Globals `_baseRenderDomainBars` and `_origRenderCalendar` removed.
- **Missing awaits fixed:** `applyFilters()`, `renderProjectDetail()` call in saveTaskForm, and all 4 calendar navigation functions (`calNavPrev`, `calNavNext`, `calGoToday`, `calToggleView`) are now properly async.
- **Alarm ghost notifications fixed:** Alarm checker now skips firing if `task.status === 'done'`.
- **Swipe Y-axis guard:** Swipe on task cards now tracks both X and Y from `touchstart`. On first significant movement, if Y > X the swipe is cancelled — prevents accidental archive/done during vertical scroll.
- **Variable shadow fixed:** `db2` renamed to `dateB` in sort comparator.
- **Date string consistency:** All manual `YYYY-MM-DD` constructions replaced with `calDateStr()`.

---

## What's NOT Built Yet

### Phase 11 — AI Secretary (future)
- 6 AI moments: task creation assistance, smart scheduling, balance coaching, project companion, weekly review facilitation, persistent chat sidebar
- Ambient suggestions (dismissible) + on-demand sidebar chat
- Configurable personality; default: sharp & direct executive assistant
- Addresses user as "Krasbauer"
- AI suggests, human approves — never full autopilot. AI cannot move Anchored blocks.
- Anthropic API integration (claude-sonnet model)

---

## Known Issues / Tech Debt

- **No undo:** Swipe to archive/done is irreversible (no confirmation). Could misfire despite Y-axis guard.
- **No loading states:** Async DB reads happen silently before renders. No spinner or skeleton.
- **Morning ritual card fade:** `updateRitualCards()` runs at boot and sets a timeout. If the user leaves the app open all morning the card may not fade until next boot.
- **DB_VERSION = 1:** Has never been bumped. If a new store or index is needed, bump the version and add a migration in `onupgradeneeded`.
- **No task cache invalidation strategy:** If two browser tabs open the same app, each has its own `allTasks` copy — last write wins.
- **Inline `onclick=` handlers:** All HTML is built via string concatenation with inline event handlers. Not ideal but not worth refactoring before Phase 11.
- **Week starts Monday:** `getWeekDates()` returns Mon–Sun. This is the current behavior — change to Sun–Sat if needed by modifying the `(day + 6) % 7` formula.

---

## Removed Features (conscious decisions)

| Feature | Reason |
|---------|--------|
| Wheel of Life | Deferred — will add later when core is proven |
| Protected Time Zones | Redundant with Routine Blocks |
| Quick capture bar | User prefers deliberate planning sessions |
| Focus Mode | Dropped for scope |
| Command palette (Cmd+K) | Mobile-first — no keyboard |
| Weekly objectives layer | Dropped for scope |
| Project milestones/timeline | Simplified to subtask checklists |

---

## How to Deploy

Push to GitHub — GitHub Pages auto-deploys from the `master` branch. Live URL: `https://krasbauer.github.io/krasbauer-os`

**Note:** If deploying after significant JS/CSS changes, bump the cache name in `sw.js` (currently `krasbauer-os-v5`) so returning users get fresh assets immediately.

---

## Version Control Rules

- **Before touching any file:** run `git add . && git commit -m "checkpoint: before [task description]"`
- **After completing any task successfully:** run `git add . && git commit -m "feat: [what was done]"`
- **After any deploy-ready state:** run `git push`
- **Never leave a session without at least one commit.**
- Commit messages must be meaningful — describe what changed, not that a change happened.

---

## Instructions for Claude

- **Always extend the existing files.** Do not create new files unless there is a strong reason.
- **One file per concern.** Logic → `app.js`. Styling → `style.css`. Structure → `index.html`.
- **Match the existing code style:** vanilla JS, no frameworks, `async/await`, CSS variable naming convention (`--bg-primary`, `--domain-body`, etc.), `genId()` for IDs.
- **Mobile-first always.** Every UI element must be thumb-friendly. Minimum tap target 44px.
- **Domain colors are the only bold visual element.** Everything else stays muted.
- **Do not add features beyond what is asked.** No extra error handling, no extra options, no speculative abstractions.
- **Date strings:** always use `calDateStr(dateObj)` — never build `YYYY-MM-DD` manually.
- **After any DB mutation:** call `await loadAllTasks()` before rendering.
- **New async functions that navigate calendar:** must `await renderCalendar()`, not fire-and-forget.
- **Error handling:** wrap DB mutation bodies in try/catch following the established pattern.
- **Before reading `app.js` or `style.css`,** always Grep for the relevant function first — never read the full file. `app.js` is ~3200 lines; `style.css` is ~3000 lines.
- **When the user says "go"** on the next phase, build it completely — do not leave stubs or TODOs.
