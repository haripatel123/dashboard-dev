import { pool } from '../pool.js';

/**
 * Inserts an event idempotently into PostgreSQL.
 * If an event with the same (source, source_id) already exists, it is silently ignored.
 * Returns true if a new row was inserted, false if it conflicted and was skipped.
 */
export async function insertEvent(event, db = pool) {
  const queryText = `
    INSERT INTO events (source, event_type, source_id, actor, target, occurred_at, payload)
    VALUES ($1, $2, $3, $4, $5, $6, $7)
    ON CONFLICT (source, source_id) DO NOTHING
    RETURNING id;
  `;
  const values = [
    event.source,
    event.event_type,
    event.source_id,
    event.actor || null,
    event.target || null,
    event.occurred_at,
    event.payload || {}
  ];

  const res = await db.query(queryText, values);
  return (res.rowCount || 0) > 0;
}

/**
 * Inserts a list of events inside a single transaction.
 * Returns count of newly inserted events.
 */
export async function insertEvents(events, db = pool) {
  if (!events || events.length === 0) {
    return { inserted: 0, total: 0 };
  }

  let inserted = 0;
  const client = typeof db.connect === 'function' ? await db.connect() : db;
  const isDedicatedClient = typeof db.connect === 'function';

  try {
    if (isDedicatedClient) await client.query('BEGIN');

    for (const event of events) {
      const wasInserted = await insertEvent(event, client);
      if (wasInserted) inserted++;
    }

    if (isDedicatedClient) await client.query('COMMIT');
    return { inserted, total: events.length };
  } catch (err) {
    if (isDedicatedClient) await client.query('ROLLBACK');
    throw err;
  } finally {
    if (isDedicatedClient) client.release();
  }
}

/**
 * Retrieves the 3 headline KPI stat tiles:
 * - PRs merged in the last 7 days
 * - Commits pushed in the last 7 days
 * - Open issues currently tracked
 */
export async function getStatTiles(db = pool) {
  const sql = `
    SELECT
      COUNT(*) FILTER (WHERE event_type = 'pr_merged' AND occurred_at > NOW() - INTERVAL '7 days')::int AS prs_merged_7d,
      COUNT(*) FILTER (WHERE event_type = 'commit' AND occurred_at > NOW() - INTERVAL '7 days')::int AS commits_7d,
      COUNT(*) FILTER (WHERE event_type = 'issue_opened' AND occurred_at > NOW() - INTERVAL '14 days')::int AS open_issues_recent
    FROM events
    WHERE source = 'github';
  `;
  const res = await db.query(sql);
  return res.rows[0] || { prs_merged_7d: 0, commits_7d: 0, open_issues_recent: 0 };
}

/**
 * Aggregates PRs opened vs merged per day for the last N days.
 */
export async function getPRsPerDay(days = 14, db = pool) {
  const sql = `
    SELECT
      to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE event_type = 'pr_opened')::int AS opened,
      COUNT(*) FILTER (WHERE event_type = 'pr_merged')::int AS merged
    FROM events
    WHERE source = 'github'
      AND occurred_at > NOW() - ($1 || ' days')::interval
    GROUP BY date_trunc('day', occurred_at)
    ORDER BY date_trunc('day', occurred_at) ASC;
  `;
  const res = await db.query(sql, [days]);
  return res.rows;
}

/**
 * Aggregates top contributors by combined activity over the last N days.
 */
export async function getTopContributors(days = 7, limit = 10, db = pool) {
  const sql = `
    SELECT
      actor,
      COUNT(*)::int AS events,
      COUNT(*) FILTER (WHERE event_type IN ('pr_opened', 'pr_merged', 'pr_closed'))::int AS prs,
      COUNT(*) FILTER (WHERE event_type = 'commit')::int AS commits,
      COUNT(*) FILTER (WHERE event_type IN ('issue_opened', 'issue_closed'))::int AS issues
    FROM events
    WHERE source = 'github'
      AND actor IS NOT NULL
      AND occurred_at > NOW() - ($1 || ' days')::interval
    GROUP BY actor
    ORDER BY events DESC
    LIMIT $2;
  `;
  const res = await db.query(sql, [days, limit]);
  return res.rows;
}

/**
 * Aggregates activity per repository over the last N days (PRs, commits, issues).
 */
export async function getActivityByRepo(days = 14, db = pool) {
  const sql = `
    SELECT
      target AS repo,
      to_char(date_trunc('day', occurred_at), 'YYYY-MM-DD') AS day,
      COUNT(*) FILTER (WHERE event_type IN ('pr_opened', 'pr_merged', 'pr_closed'))::int AS prs,
      COUNT(*) FILTER (WHERE event_type = 'commit')::int AS commits,
      COUNT(*) FILTER (WHERE event_type IN ('issue_opened', 'issue_closed'))::int AS issues
    FROM events
    WHERE source = 'github'
      AND occurred_at > NOW() - ($1 || ' days')::interval
    GROUP BY target, date_trunc('day', occurred_at)
    ORDER BY date_trunc('day', occurred_at) ASC, target ASC;
  `;
  const res = await db.query(sql, [days]);
  return res.rows;
}

/**
 * Returns the latest N events for the activity feed.
 */
export async function getRecentEvents(limit = 15, db = pool) {
  const sql = `
    SELECT
      id,
      source,
      event_type,
      source_id,
      actor,
      target,
      occurred_at,
      payload,
      fetched_at
    FROM events
    ORDER BY occurred_at DESC
    LIMIT $1;
  `;
  const res = await db.query(sql, [limit]);
  return res.rows;
}
