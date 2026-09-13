-- Migration 001: Initial schema for events and sync audit runs

CREATE TABLE IF NOT EXISTS events (
  id             BIGSERIAL PRIMARY KEY,
  source         TEXT NOT NULL,          -- e.g. 'github'
  event_type     TEXT NOT NULL,          -- 'pr_opened' | 'pr_merged' | 'pr_closed' | 'commit' | 'issue_opened' | 'issue_closed'
  source_id      TEXT NOT NULL,          -- external id for idempotency
  actor          TEXT,                   -- GitHub username
  target         TEXT,                   -- repo name, e.g. 'facebook/react'
  occurred_at    TIMESTAMPTZ NOT NULL,
  payload        JSONB NOT NULL,         -- raw for future use
  fetched_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  UNIQUE (source, source_id)             -- idempotency guarantee
);

CREATE INDEX IF NOT EXISTS idx_events_occurred_at ON events (occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_events_source_target ON events (source, target);
CREATE INDEX IF NOT EXISTS idx_events_event_type ON events (event_type);

CREATE TABLE IF NOT EXISTS sync_runs (
  id              BIGSERIAL PRIMARY KEY,
  source          TEXT NOT NULL,
  started_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  finished_at     TIMESTAMPTZ,
  status          TEXT NOT NULL,         -- 'running' | 'success' | 'failed'
  events_ingested INT DEFAULT 0,
  error_message   TEXT
);

CREATE INDEX IF NOT EXISTS idx_sync_runs_started_at ON sync_runs (started_at DESC);
