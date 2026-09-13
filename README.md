# Internal Ops Dashboard (v1)

> **Target:** Production-grade portfolio project for the Google Applications Engineering Intern (Summer 2027) application.  
> **Tech Stack:** Node.js · Express · PostgreSQL · Chart.js · Jest · Render.

An automated, private web dashboard that continuously tracks Pull Request, Commit, and Issue activity across 5 high-impact open-source GitHub repositories (`facebook/react`, `vercel/next.js`, `nodejs/node`, `vitejs/vite`, and `sveltejs/svelte`). It polls GitHub's REST API on an hourly schedule, persists events idempotently into PostgreSQL, and serves an executive-grade operational console powered by Chart.js.

---

## Architecture & System Design

```
┌────────────────┐   node-cron (hourly)  ┌─────────────────────────┐
│   node-cron    ├──────────────────────►│       Sync Worker       │
└────────────────┘                       │ (integrations/worker.js)│
                                         └───────────┬─────────────┘
     ┌──────────────────────┐   REST API             │
     │  GitHub REST API v3  │◄───────────────────────┤
     │  (@octokit/rest)     │                        │
     └──────────────────────┘                        ▼
                                         ┌─────────────────────────┐
                                         │       PostgreSQL        │
                                         │  events (idempotent)    │
                                         │  sync_runs (telemetry)  │
                                         └───────────┬─────────────┘
                                                     │
                         ┌───────────────────────────┴───────────────────────────┐
                         ▼                                                       ▼
              ┌──────────────────────┐                               ┌──────────────────────┐
              │     Express API      │                               │    EJS + Chart.js    │
              │  /api/metrics/*      │◄──────────────────────────────┤      /dashboard      │
              │  /api/sync           │                               │   (Executive Dark)   │
              └──────────────────────┘                               └──────────────────────┘
```

The system operates across three cleanly separated layers:
1. **Integrations Layer (`src/integrations/`, `src/sync/`)**: Manages external communication with GitHub, handles cursor-based pagination, exponential backoff with full jitter on HTTP 429/5xx, and header inspection (`Retry-After`).
2. **Storage & Data Engine (`src/db/`)**: Owns the persistent state in PostgreSQL. Enforces idempotency at the database engine level via `UNIQUE (source, source_id)` and `ON CONFLICT DO NOTHING`, eliminating duplicate-event bugs.
3. **Presentation Layer (`src/routes/`, `src/views/`, `src/public/`)**: Serves server-rendered EJS templates with client-side Chart.js reactive visualizations, live relative time tickers, and manual sync triggers.

---

## Key Technical Decisions & Engineering Highlights

### 1. Database-Enforced Idempotency
```sql
CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,          -- 'github'
  event_type     TEXT NOT NULL,          -- 'pr_opened' | 'pr_merged' | 'pr_closed' | 'commit' | 'issue_opened' | 'issue_closed'
  source_id      TEXT NOT NULL,          -- external id (e.g. 'github_pr_101_opened')
  actor          TEXT,                   -- GitHub username
  target         TEXT,                   -- repository (e.g. 'facebook/react')
  occurred_at    TIMESTAMPTZ NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source, source_id)             -- Idempotency guarantee
);
```
- Every hourly sync run safely overlaps with the preceding run without duplicating rows.
- Re-running the sync 100 times results in exactly 0 duplicate events, zero app-side cache state, and no distributed race conditions.

### 2. Exponential Backoff with Jitter & Retry-After (`src/sync/retry.js`)
```javascript
const backoff = retryAfter
  ? retryAfter * 1000
  : Math.min(maxMs, baseMs * 2 ** (attempt - 1)) + Math.random() * 250;
```
- **Transient handling:** Automatically retries HTTP 429 (Rate Limit) and HTTP 5xx (Server Error).
- **Fast failure:** Rejects non-retryable 4xx client errors (400, 401, 404) immediately on attempt 1.
- **Server respect:** Honors upstream `Retry-After` header when present; otherwise executes capped exponential backoff with random jitter to avoid thundering herd collisions.

### 3. Observability & Sync Audit Telemetry (`src/db/repos/syncRuns.js`)
- Every execution (automated cron or manual "Sync Now" button) creates a record in `sync_runs` tracking execution timestamp, status (`running` -> `success` / `failed`), ingested event count, and error diagnostics.

### 4. Advanced SQL Aggregation
- Leverages modern PostgreSQL `FILTER (WHERE ...)` syntax to compute multiple KPI aggregations in single-pass queries:
```sql
SELECT
  COUNT(*) FILTER (WHERE event_type = 'pr_merged' AND occurred_at > NOW() - INTERVAL '7 days')::int AS prs_merged_7d,
  COUNT(*) FILTER (WHERE event_type = 'commit' AND occurred_at > NOW() - INTERVAL '7 days')::int AS commits_7d,
  COUNT(*) FILTER (WHERE event_type = 'issue_opened' AND occurred_at > NOW() - INTERVAL '14 days')::int AS open_issues_recent
FROM events
WHERE source = 'github';
```

---

## User Interface & Dashboard Views

The executive ops dashboard at `/dashboard` delivers:
- **3 KPI Stat Tiles**: PRs Merged (7d), Total Commits (7d), and Open Issues Tracked.
- **Chart 1 — PR Velocity Trends (14 Days)**: Smooth-curved line chart comparing daily opened PRs against merged PRs with gradient area fills.
- **Chart 2 — Top Contributors (7 Days)**: Horizontal ranking bar chart identifying the top 10 most active engineers across merged PRs, commits, and issues.
- **Chart 3 — Repository Activity Composition (14 Days)**: Stacked bar chart showing the breakdown of PRs, commits, and issues per repository.
- **Live Activity Feed**: Tabular stream of the 15 latest events with clickable links to GitHub PRs/commits, actor handles, and timestamps.
- **Sync Now Controller & Relative Time Ticker**: Interactive trigger with spinner, active state disabling, toast alerts, and live "Last synced: X minutes ago" badge.

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard` | Renders the HTML ops dashboard |
| `GET` | `/api/metrics/stats` | Headline KPI metrics (PRs merged 7d, commits 7d, open issues) |
| `GET` | `/api/metrics/prs-per-day` | Opened vs merged PR counts per day (`?days=14`) |
| `GET` | `/api/metrics/top-contributors` | Top contributors ranked by activity (`?days=7&limit=10`) |
| `GET` | `/api/metrics/activity-by-repo` | Stacked event metrics grouped by repository (`?days=14`) |
| `GET` | `/api/metrics/recent-events` | Latest ingested events (`?limit=15`) |
| `POST` | `/api/sync` or `/sync` | Triggers immediate sync pull across all tracked repos |
| `GET` | `/api/sync/status` | Current sync state and latest audit record |
| `GET` | `/healthz` | System health and database connectivity probe |

---

## Local Development Setup

### 1. Clone & Install
```bash
git clone https://github.com/your-username/ops-dashboard.git
cd ops-dashboard
npm install
```

### 2. Configure Environment Variables
Copy `.env.example` to `.env`:
```bash
cp .env.example .env
```
Populate `DATABASE_URL` with your PostgreSQL credentials:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/ops_dashboard
GITHUB_TOKEN=ghp_your_token_here
REPOS=facebook/react,vercel/next.js,nodejs/node,vitejs/vite,sveltejs/svelte
CRON_SCHEDULE=0 * * * *
```
*(Note: `GITHUB_TOKEN` is optional for low-volume testing, but recommended to avoid GitHub's 60 req/hr unauthenticated rate limit).*

### 3. Database Migration & Realistic Seed
Run the programmatic migration and seed scripts:
```bash
npm run migrate
npm run seed
```

### 4. Run the Application
```bash
# Production start
npm start

# Development mode with auto-reload
npm run dev
```
Visit `http://localhost:3000/dashboard` in your browser.

### 5. Run the Automated Test Suite
```bash
npm test
```
The Jest test suite exercises:
- `tests/retry.test.js`: Exponential backoff on 429/500, Retry-After compliance, max attempt cutoff, and 4xx fail-fast behavior.
- `tests/github.test.js`: Multi-page pagination consumption, event normalization, and PR issue filtering.
- `tests/sync.test.js`: Idempotent deduplication guarantee under duplicate loads, audit record lifecycle.
- `tests/metrics.test.js`: Single-pass SQL aggregation calculations, and Supertest HTTP endpoint schema validation.

---

## Deploying to Render

1. Push your repository to GitHub.
2. Log into [Render](https://render.com) and create a **New PostgreSQL** database (free tier).
3. Copy the Internal Database URL.
4. Create a **New Web Service** pointing to your repository:
   - **Environment:** Node
   - **Build Command:** `npm install`
   - **Start Command:** `node src/server.js`
5. Configure Environment Variables under Web Service settings:
   - `DATABASE_URL`: *(paste from Step 3)*
   - `GITHUB_TOKEN`: *(your fine-grained GitHub PAT)*
   - `REPOS`: `facebook/react,vercel/next.js,nodejs/node,vitejs/vite,sveltejs/svelte`
   - `NODE_ENV`: `production`
6. Run the initial migration via the Render Shell tab:
   ```bash
   node src/db/migrate.js
   node src/db/seed.js # (optional: seeds historical baseline)
   ```
7. Seed the database with live events:
   ```bash
   curl -X POST https://your-render-app.onrender.com/sync
   ```
8. Navigate to `https://your-render-app.onrender.com/dashboard`.

---

## Resume Bullets (Google Applications Engineering)

```
- Built a scheduled integration service that pulls PR, commit, and issue activity
  from the GitHub REST API across 5 open-source repositories, normalizes and
  persists events to PostgreSQL, and renders a Chart.js dashboard with 3
  operational views — turning a manual "check each repo weekly" workflow into a
  hands-off, always-current view.

- Engineered production-grade integration handling: token-based auth,
  cursor-based pagination, exponential backoff with jitter and Retry-After
  handling on 429/5xx responses, and idempotent upserts (UNIQUE constraint on
  (source, source_id)) that make every hourly sync safe to re-run.

- Deployed to Render with a node-cron scheduler, tracked every run in a
  sync_runs audit table for observability, and validated with a Jest + nock test
  suite covering rate-limit backoff, pagination, and duplicate-event rejection.
```

---

## The 30-Second Interview Pitch

> *"I built an internal ops dashboard that watches five open-source GitHub repos and shows me PR, commit, and issue trends without me having to visit GitHub. It runs on a Node.js + Express + Postgres stack, pulls from the GitHub REST API every hour via node-cron, and handles the tricky parts of real integration — pagination, exponential backoff with jitter on 429s, idempotent upserts so re-running the sync doesn't duplicate data. There's a Chart.js dashboard with three views. It's deployed on Render and has a Jest test suite covering the retry logic, pagination, and duplicate rejection."*
