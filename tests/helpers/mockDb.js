/**
 * In-memory PostgreSQL mock database client for deterministic, zero-dependency unit & integration testing.
 * Accurately implements UNIQUE (source, source_id) constraint and SQL metrics aggregation logic.
 */
export class MockDatabase {
  constructor() {
    this.events = [];
    this.syncRuns = [];
    this.nextEventId = 1;
    this.nextRunId = 1;
  }

  async connect() {
    return this;
  }

  release() {}

  async query(text, params = []) {
    const trimmed = text.trim();

    // Transactions
    if (trimmed.startsWith('BEGIN') || trimmed.startsWith('COMMIT') || trimmed.startsWith('ROLLBACK')) {
      return { rowCount: 0, rows: [] };
    }

    // INSERT INTO events ... ON CONFLICT (source, source_id) DO NOTHING
    if (trimmed.includes('INSERT INTO events')) {
      const [source, event_type, source_id, actor, target, occurred_at, payload] = params;
      const key = `${source}:${source_id}`;
      const exists = this.events.some(e => `${e.source}:${e.source_id}` === key);

      if (exists) {
        // ON CONFLICT DO NOTHING: 0 rows inserted
        return { rowCount: 0, rows: [] };
      }

      const newRow = {
        id: this.nextEventId++,
        source,
        event_type,
        source_id,
        actor: actor || null,
        target: target || null,
        occurred_at: new Date(occurred_at),
        payload: payload || {},
        fetched_at: new Date()
      };
      this.events.push(newRow);
      return { rowCount: 1, rows: [newRow] };
    }

    // INSERT INTO sync_runs
    if (trimmed.includes('INSERT INTO sync_runs')) {
      const [source] = params;
      const newRun = {
        id: this.nextRunId++,
        source,
        started_at: new Date(),
        finished_at: null,
        status: 'running',
        events_ingested: 0,
        error_message: null
      };
      this.syncRuns.push(newRun);
      return { rowCount: 1, rows: [newRun] };
    }

    // UPDATE sync_runs
    if (trimmed.includes('UPDATE sync_runs')) {
      const runId = params[0];
      const run = this.syncRuns.find(r => r.id === runId);
      if (!run) return { rowCount: 0, rows: [] };

      if (trimmed.includes("status = 'success'")) {
        run.status = 'success';
        run.finished_at = new Date();
        run.events_ingested = params[1] || 0;
      } else if (trimmed.includes("status = 'failed'")) {
        run.status = 'failed';
        run.finished_at = new Date();
        run.error_message = params[1] || '';
      }
      return { rowCount: 1, rows: [run] };
    }

    // SELECT FROM sync_runs
    if (trimmed.includes('FROM sync_runs')) {
      const source = params[0] || 'github';
      const runs = this.syncRuns
        .filter(r => r.source === source)
        .sort((a, b) => b.started_at - a.started_at);
      return { rowCount: runs.length, rows: runs.slice(0, 1) };
    }

    // Metrics: getStatTiles
    if (trimmed.includes('prs_merged_7d')) {
      const now = Date.now();
      const d7 = 7 * 24 * 60 * 60 * 1000;
      const d14 = 14 * 24 * 60 * 60 * 1000;

      const prsMerged = this.events.filter(e =>
        e.source === 'github' &&
        e.event_type === 'pr_merged' &&
        (now - e.occurred_at.getTime()) < d7
      ).length;

      const commits = this.events.filter(e =>
        e.source === 'github' &&
        e.event_type === 'commit' &&
        (now - e.occurred_at.getTime()) < d7
      ).length;

      const openIssues = this.events.filter(e =>
        e.source === 'github' &&
        e.event_type === 'issue_opened' &&
        (now - e.occurred_at.getTime()) < d14
      ).length;

      return {
        rowCount: 1,
        rows: [{
          prs_merged_7d: prsMerged,
          commits_7d: commits,
          open_issues_recent: openIssues
        }]
      };
    }

    // Metrics: getPRsPerDay
    if (trimmed.includes('AS opened')) {
      const dayMap = new Map();
      for (const e of this.events) {
        if (e.source !== 'github') continue;
        const dayStr = e.occurred_at.toISOString().slice(0, 10);
        if (!dayMap.has(dayStr)) {
          dayMap.set(dayStr, { day: dayStr, opened: 0, merged: 0 });
        }
        const rec = dayMap.get(dayStr);
        if (e.event_type === 'pr_opened') rec.opened++;
        if (e.event_type === 'pr_merged') rec.merged++;
      }
      const rows = Array.from(dayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
      return { rowCount: rows.length, rows };
    }

    // Metrics: getTopContributors
    if (trimmed.includes('GROUP BY actor')) {
      const actorMap = new Map();
      for (const e of this.events) {
        if (e.source !== 'github' || !e.actor) continue;
        if (!actorMap.has(e.actor)) {
          actorMap.set(e.actor, { actor: e.actor, events: 0, prs: 0, commits: 0, issues: 0 });
        }
        const rec = actorMap.get(e.actor);
        rec.events++;
        if (['pr_opened', 'pr_merged', 'pr_closed'].includes(e.event_type)) rec.prs++;
        if (e.event_type === 'commit') rec.commits++;
        if (['issue_opened', 'issue_closed'].includes(e.event_type)) rec.issues++;
      }
      const limit = params[1] || 10;
      const rows = Array.from(actorMap.values())
        .sort((a, b) => b.events - a.events)
        .slice(0, limit);
      return { rowCount: rows.length, rows };
    }

    // Metrics: getActivityByRepo
    if (trimmed.includes('GROUP BY target')) {
      const repoDayMap = new Map();
      for (const e of this.events) {
        if (e.source !== 'github') continue;
        const dayStr = e.occurred_at.toISOString().slice(0, 10);
        const key = `${e.target}_${dayStr}`;
        if (!repoDayMap.has(key)) {
          repoDayMap.set(key, { repo: e.target, day: dayStr, prs: 0, commits: 0, issues: 0 });
        }
        const rec = repoDayMap.get(key);
        if (['pr_opened', 'pr_merged', 'pr_closed'].includes(e.event_type)) rec.prs++;
        if (e.event_type === 'commit') rec.commits++;
        if (['issue_opened', 'issue_closed'].includes(e.event_type)) rec.issues++;
      }
      const rows = Array.from(repoDayMap.values()).sort((a, b) => a.day.localeCompare(b.day));
      return { rowCount: rows.length, rows };
    }

    // Recent events: getRecentEvents
    if (trimmed.includes('ORDER BY occurred_at DESC')) {
      const limit = params[0] || 15;
      const rows = [...this.events]
        .sort((a, b) => b.occurred_at - a.occurred_at)
        .slice(0, limit);
      return { rowCount: rows.length, rows };
    }

    return { rowCount: 0, rows: [] };
  }
}
