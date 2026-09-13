# Internal Ops Dashboard

An automated operations monitoring platform that tracks Pull Request, Commit, and Issue activity across open-source GitHub repositories. Built with Node.js, Express, and PostgreSQL, the service polls the GitHub REST API on an hourly schedule, persists events idempotently into PostgreSQL, and serves a clean, high-contrast operational dashboard with Chart.js visualizations.

---

## Features

- **Automated Hourly Synchronization:** Background worker driven by `node-cron` automatically pulls recent PRs, commits, and issues across configured repositories.
- **Database-Level Idempotency:** Guaranteed duplicate-free ingestion using PostgreSQL `UNIQUE (source, source_id)` constraints and `ON CONFLICT DO NOTHING` upserts.
- **Production-Grade Resilience:** Custom exponential backoff engine with random jitter, rate-limit (HTTP 429) backoff, and upstream `Retry-After` header parsing.
- **Audit & Observability:** Every sync execution (automated or manual) is recorded in a `sync_runs` audit table tracking runtime, duration, status, and ingested event counts.
- **Rate-Limited Manual Trigger:** On-demand sync via `POST /sync` and the dashboard UI, protected against abuse by `express-rate-limit`.
- **Clean Operational Dashboard:** Single-page console with 3 KPI metric tiles, 3 Chart.js graphs (PR trends, top contributors, repository composition), and a live activity feed with direct GitHub links.
- **100% Automated Test Coverage:** Comprehensive Jest test suite covering retry backoff, Octokit pagination, idempotent deduplication, and SQL metric aggregations.

---

## Architecture & Data Flow

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
                                         │  sync_runs (audit log)  │
                                         └───────────┬─────────────┘
                                                     │
                         ┌───────────────────────────┴───────────────────────────┐
                         ▼                                                       ▼
              ┌──────────────────────┐                               ┌──────────────────────┐
              │     Express API      │                               │   Clean UI Console   │
              │  /api/metrics/*      │◄──────────────────────────────┤      /dashboard      │
              │  /sync               │                               │     (EJS + CSS)      │
              └──────────────────────┘                               └──────────────────────┘
```

The system is organized into three decoupled layers:
1. **Integrations Layer (`src/integrations/`, `src/sync/`)**: Manages external HTTP communication with GitHub, handles cursor pagination, exponential backoff with full jitter on HTTP 429/5xx, and header inspection (`Retry-After`).
2. **Storage Layer (`src/db/`)**: Owns the persistent state in PostgreSQL. Enforces idempotency at the database engine level via `UNIQUE (source, source_id)` and executes single-pass metric aggregations using PostgreSQL `FILTER (WHERE ...)`.
3. **Presentation Layer (`src/routes/`, `src/views/`, `src/public/`)**: Serves server-rendered EJS templates with client-side Chart.js reactive visualizations, live relative time tickers, and manual sync triggers.

---

## Database Schema

```sql
CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,          -- e.g. 'github'
  event_type     TEXT NOT NULL,          -- 'pr_opened' | 'pr_merged' | 'pr_closed' | 'commit' | 'issue_opened' | 'issue_closed'
  source_id      TEXT NOT NULL,          -- external unique ID (e.g. 'github_pr_101_opened')
  actor          TEXT,                   -- GitHub username
  target         TEXT,                   -- repository (e.g. 'facebook/react')
  occurred_at    TIMESTAMPTZ NOT NULL,
  payload        JSONB NOT NULL,
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source, source_id)             -- Idempotency constraint
);

CREATE INDEX idx_events_occurred_at ON events (occurred_at DESC);
CREATE INDEX idx_events_source_target ON events (source, target);
CREATE INDEX idx_events_event_type ON events (event_type);

CREATE TABLE IF NOT EXISTS sync_runs (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL,         -- 'running' | 'success' | 'failed'
  events_ingested INT DEFAULT 0,
  error_message   TEXT
);
```

---

## API Reference

| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/dashboard` | Server-rendered HTML operations dashboard |
| `GET` | `/api/metrics/stats` | Headline KPI stats (PRs merged 7d, commits 7d, open issues now) |
| `GET` | `/api/metrics/prs-per-day` | Opened vs. merged PR counts per day (`?days=14`) |
| `GET` | `/api/metrics/top-contributors` | Top active contributors ranked by activity (`?days=7&limit=10`) |
| `GET` | `/api/metrics/activity-by-repo` | Event volume breakdown grouped by repository (`?days=14`) |
| `GET` | `/api/metrics/recent-events` | List of latest ingested events (`?limit=15`) |
| `POST` | `/sync` | Triggers immediate sync pull (rate-limited to 5 req/min) |
| `GET` | `/sync/status` | Current sync run state and latest execution telemetry |
| `GET` | `/healthz` | Service health and database connectivity probe |

---

## Local Development Setup

### Prerequisites
- **Node.js**: v20 or higher
- **PostgreSQL**: v14 or higher (local or managed cloud instance)
- **Git**

### 1. Clone & Install
```bash
git clone https://github.com/haripatel123/dashboard-dev.git
cd dashboard-dev
npm install
```

### 2. Configure Environment Variables
Copy the template `.env.example` to `.env`:
```bash
cp .env.example .env
```
Configure your database connection and GitHub token in `.env`:
```env
PORT=3000
NODE_ENV=development
DATABASE_URL=postgresql://username:password@localhost:5432/ops_dashboard
GITHUB_TOKEN=your_github_personal_access_token
REPOS=facebook/react,vercel/next.js,nodejs/node,vitejs/vite,sveltejs/svelte
CRON_SCHEDULE=0 * * * *
```

> **Note on `GITHUB_TOKEN`:** A fine-grained GitHub Personal Access Token (PAT) with read-only access to public repositories is recommended to raise your rate limit from 60 requests/hr to 5,000 requests/hr.

### 3. Run Migrations & Seed Baseline Data
```bash
# Apply PostgreSQL tables and indexes
npm run migrate

# (Optional) Seed realistic demo events for immediate visualization
npm run seed
```

### 4. Start the Application
```bash
# Development mode with auto-reload
npm run dev

# Production start
npm start
```
Open **`http://localhost:3000/dashboard`** in your browser.

---

## Automated Test Suite

The project includes an automated test suite using Jest, Supertest, and Nock.

```bash
npm test
```

### Test Coverage:
- **`tests/retry.test.js`**: Validates exponential backoff delays, jitter, upstream `Retry-After` header parsing, cutoff at `maxAttempts`, and fast rejection of 4xx client errors.
- **`tests/github.test.js`**: Verifies multi-page pagination consumption, event normalization into unified records, and filtering out pull requests from the issues endpoint.
- **`tests/sync.test.js`**: Verifies database-enforced idempotency under duplicate loads, audit trail creation in `sync_runs`, and rate limiting on `POST /sync`.
- **`tests/metrics.test.js`**: Validates single-pass PostgreSQL KPI aggregations, contributor rankings, and Express HTTP API routes.

---

## Deploying to Render

1. Push your repository to GitHub.
2. In the [Render Dashboard](https://dashboard.render.com), click **New +** → **PostgreSQL** (free tier).
   - Name: `ops-dashboard-db`
   - Database: `ops_dashboard`
3. Copy the **Internal Database URL** from the database settings.
4. Click **New +** → **Web Service** and connect your GitHub repository.
5. Configure the Web Service:
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node src/db/migrate.js && node src/server.js`
   - *(Running `node src/db/migrate.js` in the start command automatically applies schema migrations on each deploy).*
6. Add Environment Variables:
   - `DATABASE_URL`: *(paste the Internal Database URL from Step 3)*
   - `GITHUB_TOKEN`: *(your GitHub PAT)*
   - `REPOS`: `facebook/react,vercel/next.js,nodejs/node,vitejs/vite,sveltejs/svelte`
   - `NODE_ENV`: `production`
7. Click **Deploy Web Service**.
8. Navigate to your live URL: `https://<your-app>.onrender.com/dashboard`.

---

## Configuration Reference

| Variable | Description | Default |
|---|---|---|
| `PORT` | HTTP port the Express server listens on | `3000` |
| `NODE_ENV` | Application environment (`development` or `production`) | `development` |
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://postgres:postgres@localhost:5432/ops_dashboard` |
| `GITHUB_TOKEN` | GitHub Personal Access Token for API requests | `""` (unauthenticated) |
| `REPOS` | Comma-separated list of `owner/repo` to monitor | `facebook/react,vercel/next.js,nodejs/node,vitejs/vite,sveltejs/svelte` |
| `CRON_SCHEDULE` | 5-field cron expression for automated sync | `0 * * * *` (hourly) |

---

## License

This project is licensed under the [MIT License](LICENSE).
