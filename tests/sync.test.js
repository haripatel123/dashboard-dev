import { describe, it, expect, beforeEach } from '@jest/globals';
import { MockDatabase } from './helpers/mockDb.js';
import { insertEvent, insertEvents, getRecentEvents } from '../src/db/repos/events.js';
import { startSyncRun, completeSyncRun, failSyncRun, getLastSyncRun } from '../src/db/repos/syncRuns.js';

describe('Sync & Idempotency Pipeline', () => {
  let db;

  beforeEach(() => {
    db = new MockDatabase();
  });

  it('should insert an event on first attempt and skip on duplicate (source, source_id)', async () => {
    const event = {
      source: 'github',
      event_type: 'pr_opened',
      source_id: 'github_pr_9999_opened',
      actor: 'gaearon',
      target: 'facebook/react',
      occurred_at: new Date(),
      payload: { number: 9999, title: 'Test PR' }
    };

    // First attempt: should insert successfully
    const firstInsert = await insertEvent(event, db);
    expect(firstInsert).toBe(true);
    expect(db.events.length).toBe(1);

    // Second attempt with the same source and source_id: MUST be ignored
    const secondInsert = await insertEvent(event, db);
    expect(secondInsert).toBe(false);
    expect(db.events.length).toBe(1); // Row count remains 1
  });

  it('should handle batch insertion with partial duplicates idempotently', async () => {
    const eventsBatch1 = [
      {
        source: 'github',
        event_type: 'commit',
        source_id: 'github_commit_aaa111',
        actor: 'acdlite',
        target: 'facebook/react',
        occurred_at: new Date()
      },
      {
        source: 'github',
        event_type: 'commit',
        source_id: 'github_commit_bbb222',
        actor: 'sophiebits',
        target: 'facebook/react',
        occurred_at: new Date()
      }
    ];

    const result1 = await insertEvents(eventsBatch1, db);
    expect(result1).toEqual({ inserted: 2, total: 2 });
    expect(db.events.length).toBe(2);

    // Re-run with 1 duplicate and 1 new event
    const eventsBatch2 = [
      eventsBatch1[0], // Duplicate
      {
        source: 'github',
        event_type: 'commit',
        source_id: 'github_commit_ccc333',
        actor: 'sebmarkbage',
        target: 'facebook/react',
        occurred_at: new Date()
      }
    ];

    const result2 = await insertEvents(eventsBatch2, db);
    expect(result2).toEqual({ inserted: 1, total: 2 }); // Only 1 was new
    expect(db.events.length).toBe(3); // Total unique rows = 3
  });

  it('should track sync audit lifecycle in sync_runs table', async () => {
    // 1. Start sync run
    const run = await startSyncRun('github', db);
    expect(run.id).toBeDefined();
    expect(run.status).toBe('running');

    // 2. Complete sync run with ingested count
    const completed = await completeSyncRun(run.id, 42, db);
    expect(completed.status).toBe('success');
    expect(completed.events_ingested).toBe(42);
    expect(completed.finished_at).toBeDefined();

    // 3. Retrieve latest sync run
    const lastRun = await getLastSyncRun('github', db);
    expect(lastRun).toEqual(expect.objectContaining({
      id: run.id,
      status: 'success',
      events_ingested: 42
    }));
  });

  it('should record failure state and error message in sync_runs when a run fails', async () => {
    const run = await startSyncRun('github', db);
    const failed = await failSyncRun(run.id, 'GitHub API 500: Server Error', db);

    expect(failed.status).toBe('failed');
    expect(failed.error_message).toBe('GitHub API 500: Server Error');

    const lastRun = await getLastSyncRun('github', db);
    expect(lastRun.status).toBe('failed');
    expect(lastRun.error_message).toContain('GitHub API 500');
  });
});
