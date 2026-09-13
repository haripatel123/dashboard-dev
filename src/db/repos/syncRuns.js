import { pool } from '../pool.js';

export async function startSyncRun(source = 'github', db = pool) {
  const sql = `
    INSERT INTO sync_runs (source, started_at, status, events_ingested)
    VALUES ($1, NOW(), 'running', 0)
    RETURNING id, source, started_at, status;
  `;
  const res = await db.query(sql, [source]);
  return res.rows[0];
}

export async function completeSyncRun(id, eventsIngested = 0, db = pool) {
  const sql = `
    UPDATE sync_runs
    SET finished_at = NOW(),
        status = 'success',
        events_ingested = $2
    WHERE id = $1
    RETURNING id, source, started_at, finished_at, status, events_ingested;
  `;
  const res = await db.query(sql, [id, eventsIngested]);
  return res.rows[0];
}

export async function failSyncRun(id, errorMessage = '', db = pool) {
  const sql = `
    UPDATE sync_runs
    SET finished_at = NOW(),
        status = 'failed',
        error_message = $2
    WHERE id = $1
    RETURNING id, source, started_at, finished_at, status, error_message;
  `;
  const res = await db.query(sql, [id, errorMessage]);
  return res.rows[0];
}

export async function getLastSyncRun(source = 'github', db = pool) {
  const sql = `
    SELECT id, source, started_at, finished_at, status, events_ingested, error_message
    FROM sync_runs
    WHERE source = $1
    ORDER BY started_at DESC
    LIMIT 1;
  `;
  const res = await db.query(sql, [source]);
  return res.rows[0] || null;
}
