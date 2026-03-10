# ONE AGENCY — Daily Planner PRD
**Version:** 1.0  
**Builder:** Claude Code  
**Hosted on:** Railway (Node.js backend + React frontend)  
**Target user:** Alex (solo operator, internal tool only)

---

## Overview

A personal productivity dashboard for Alex to plan and execute his week across 5 themed days. It surfaces daily context, syncs Apple Reminders as a task list, and shows upcoming meetings pulled from Google Calendar. Dark mode only. Built for solo use — no auth, no multi-user, no public access.

---

## Day Themes (hardcoded)

| Day | Theme | Focus |
|-----|-------|-------|
| Monday | AI Research & News | Read, learn, stay current on AI |
| Tuesday | Development | Build client and internal projects |
| Wednesday | Development | Build client and internal projects |
| Thursday | Outreach & Sales | Find clients, follow up, send proposals |
| Friday | Market Research & Business Planning | Strategy, research, planning ONE AGENCY |

---

## Tech Stack

**Frontend:** React (Vite), Tailwind CSS, dark mode  
**Backend:** Node.js + Express  
**Database:** PostgreSQL (Railway managed Postgres)  
**Deployment:** Railway (both frontend and backend on same Railway project)  
**External APIs:**
- Apple iCloud CalDAV — for Apple Reminders sync
- Google Calendar API (OAuth 2.0) — for meeting/calendar sync

**Environment variables (stored in Railway, never in code):**
- `APPLE_CALDAV_USERNAME` — iCloud email
- `APPLE_CALDAV_APP_PASSWORD` — iCloud app-specific password (not main Apple password)
- `GOOGLE_CLIENT_ID`
- `GOOGLE_CLIENT_SECRET`
- `GOOGLE_REFRESH_TOKEN`
- `DATABASE_URL` — auto-provided by Railway Postgres

---

## Feature 1 — Weekly Planner Shell

**What it does:**  
The main layout of the app. A weekly view showing all 5 workdays with their themes. Today is always highlighted prominently. Each day card shows the theme, a daily focus note (user-editable), and a count of tasks and events for that day.

**UI:**
- Full-width dark dashboard layout
- Top bar: current date, day of week, week number
- 5 day columns (Mon–Fri), today's column is visually elevated (brighter border, slightly larger)
- Each day card shows: day name, theme label (e.g. "🧠 AI Research & News"), task count badge, event count badge, and a short editable focus note for the day
- Clicking a day column expands it or navigates to a day detail view

**Data:**
- Day themes are hardcoded — not editable
- Daily focus notes are stored in Postgres (one row per date)
- Notes persist across sessions

**Success criteria:**
- App loads and shows the current week
- Today is visually distinct
- Day themes are correct and always visible
- Focus note can be typed and saves automatically (debounced, no save button needed)

---

## Feature 2 — Task List (Apple Reminders Sync)

**What it does:**  
Pulls tasks from the user's default Apple Reminders list via iCloud CalDAV and displays them in the app. Tasks can be checked off (completion syncs back to Reminders). New tasks can be added from the app and they appear in Reminders.

**UI:**
- Task panel visible on the day detail view and as a sidebar on the weekly view
- Tasks show: title, due date (if set), completion checkbox
- Completed tasks are struck through and move to bottom or can be hidden
- "Add task" input at the top of the list — type and hit enter
- Tasks with a due date that matches today are surfaced at the top
- Overdue tasks (due date in the past, not completed) are highlighted in amber

**Backend (CalDAV):**
- Use the `tsdav` npm package to connect to Apple iCloud CalDAV
- Endpoint: `https://caldav.icloud.com`
- Auth: iCloud email + app-specific password (user must generate this at appleid.apple.com)
- Fetch the default Reminders list (VTODO components)
- Sync on app load and every 5 minutes while app is open
- When a task is checked off in the app → update the VTODO completion status via CalDAV
- When a new task is added → create a new VTODO via CalDAV

**Success criteria:**
- Tasks from Apple Reminders appear in the app within 10 seconds of load
- Checking a task off in the app marks it complete in Reminders (verify on iPhone)
- Adding a task in the app creates it in Reminders
- Sync runs every 5 minutes automatically

---

## Feature 3 — Calendar View (Google Calendar Sync)

**What it does:**  
Shows upcoming meetings and events pulled from Google Calendar. Read-only — the app displays events but does not create or edit them. Events appear on the correct day in the weekly view.

**UI:**
- Events appear as chips/blocks on each day column in the weekly view
- Each event shows: title, start time, end time, and an optional colour (from Google Calendar colour)
- Clicking an event shows a small popover with full details (title, time, description if any, video call link if present — e.g. Google Meet URL)
- If a day has no events, show a subtle "No meetings" label

**Backend (Google Calendar API):**
- Use Google Calendar REST API with a service account or OAuth refresh token
- Fetch events for the current week on load
- Refresh every 15 minutes
- Only pull from the primary calendar (or allow user to select which calendars in a settings panel later)
- Store fetched events in Postgres with a TTL so the app works even if Google API is temporarily unavailable

**Success criteria:**
- Events from Google Calendar appear on the correct days
- Event times are shown in Australian Eastern time (AEST/AEDT)
- Clicking an event shows its details
- A Google Meet link (if present) is clickable and opens in a new tab

---

## Feature 4 — Saved Content Inbox (V2 — DO NOT BUILD IN V1)

Parked for a future version. Will be a simple URL + note inbox for saving Instagram, Threads, and X posts to review on the relevant themed day. Do not build this in V1.

---

## General UI/UX Rules

- **Dark mode only** — background approximately `#0f1117`, card surfaces `#1a1d27`, borders subtle `#2a2d3a`
- **Font:** Inter or similar clean sans-serif
- **Accent colour:** A single brand colour for highlights — suggest electric blue `#4f8ef7` or violet `#7c6ff7` (builder can choose whichever looks best in dark mode)
- **No animations needed** — clean, fast, functional
- **Mobile responsiveness:** Not required for V1. Desktop only.
- **No login/auth** — the app is accessed directly via Railway URL. Add a note in the README about keeping the URL private.

---

## Database Schema (Postgres)

```sql
-- Daily focus notes
CREATE TABLE daily_notes (
  id SERIAL PRIMARY KEY,
  date DATE UNIQUE NOT NULL,
  note TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);

-- Cached calendar events (from Google Calendar)
CREATE TABLE calendar_events (
  id TEXT PRIMARY KEY, -- Google event ID
  title TEXT NOT NULL,
  start_time TIMESTAMP NOT NULL,
  end_time TIMESTAMP NOT NULL,
  description TEXT,
  meet_link TEXT,
  colour TEXT,
  fetched_at TIMESTAMP DEFAULT NOW()
);

-- App settings (key-value store for things like selected calendar ID)
CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Tasks are NOT stored in Postgres — they live in Apple Reminders via CalDAV and are fetched fresh each sync. This keeps Reminders as the source of truth.

---

## Build Order

Build in this exact order. Do not move to the next feature until the current one works.

1. **Project setup** — Railway project, Postgres database, React + Vite frontend, Express backend, environment variables wired up
2. **Feature 1** — Weekly planner shell with day themes and editable daily focus notes
3. **Feature 2** — Apple Reminders sync via CalDAV (fetch, display, check off, add)
4. **Feature 3** — Google Calendar sync (fetch and display events on correct days)
5. **Polish pass** — Ensure dark mode is consistent, today highlighting works, event and task counts show on day cards

---

## Environment Setup Notes for Claude Code

- Railway provides a `DATABASE_URL` env var automatically when Postgres is added — use this directly with `pg` or `drizzle-orm`
- For Apple CalDAV, the user will generate an **app-specific password** at https://appleid.apple.com → Security → App-Specific Passwords. This is NOT their main Apple password.
- For Google Calendar, set up OAuth credentials at Google Cloud Console → create a Desktop app OAuth client → generate a refresh token using the OAuth playground or a one-time script → store the refresh token in Railway env vars
- All env vars go in Railway dashboard → project → Variables. Never hardcode them.

---

## Out of Scope for V1

- User authentication
- Multiple users
- Mobile/responsive layout
- Saved social posts inbox
- Editing or creating Google Calendar events
- Multiple Reminders lists
- Push notifications
- AI features (daily briefing, smart scheduling, etc.) — can be added in V2
