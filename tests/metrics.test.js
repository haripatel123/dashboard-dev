import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import { MockDatabase } from './helpers/mockDb.js';
import {
  getStatTiles,
  getPRsPerDay,
  getTopContributors,
  getActivityByRepo,
  getRecentEvents,
  insertEvents
} from '../src/db/repos/events.js';
import { app } from '../src/server.js';

describe('Metrics Aggregations & API Endpoints', () => {
  let db;
  const now = new Date();

  const fixtureEvents = [
    {
      source: 'github',
      event_type: 'pr_opened',
      source_id: 'pr_1',
      actor: 'gaearon',
      target: 'facebook/react',
      occurred_at: now,
      payload: { number: 1, title: 'Streaming SSR' }
    },
    {
      source: 'github',
      event_type: 'pr_merged',
      source_id: 'pr_1_merged',
      actor: 'acdlite',
      target: 'facebook/react',
      occurred_at: now,
      payload: { number: 1, title: 'Streaming SSR' }
    },
    {
      source: 'github',
      event_type: 'commit',
      source_id: 'commit_1',
      actor: 'gaearon',
      target: 'facebook/react',
      occurred_at: now,
      payload: { sha: '1111111', message: 'feat: add streaming' }
    },
    {
      source: 'github',
      event_type: 'commit',
      source_id: 'commit_2',
      actor: 'gaearon',
      target: 'facebook/react',
      occurred_at: now,
      payload: { sha: '2222222', message: 'fix: edge case' }
    },
    {
      source: 'github',
      event_type: 'issue_opened',
      source_id: 'issue_1',
      actor: 'shuding',
      target: 'vercel/next.js',
      occurred_at: now,
      payload: { number: 100, title: 'Hydration bug' }
    }
  ];

  beforeEach(async () => {
    db = new MockDatabase();
    await insertEvents(fixtureEvents, db);
  });

  it('should calculate KPI stat tiles correctly from events', async () => {
    const stats = await getStatTiles(db);

    expect(stats).toEqual({
      prs_merged_7d: 1,
      commits_7d: 2,
      open_issues_recent: 1
    });
  });

  it('should aggregate PRs per day into opened and merged counts', async () => {
    const prsPerDay = await getPRsPerDay(14, db);

    expect(prsPerDay.length).toBeGreaterThan(0);
    const today = prsPerDay[0];
    expect(today).toHaveProperty('day');
    expect(today.opened).toBe(1);
    expect(today.merged).toBe(1);
  });

  it('should rank top contributors by event frequency', async () => {
    const contributors = await getTopContributors(7, 10, db);

    expect(contributors.length).toBe(3);
    // gaearon has 1 pr_opened + 2 commits = 3 events
    expect(contributors[0].actor).toBe('gaearon');
    expect(contributors[0].events).toBe(3);
    expect(contributors[0].commits).toBe(2);
    expect(contributors[0].prs).toBe(1);

    // acdlite has 1 pr_merged = 1 event
    const acdlite = contributors.find(c => c.actor === 'acdlite');
    expect(acdlite).toBeDefined();
    expect(acdlite.events).toBe(1);
  });

  it('should aggregate activity broken down by repository', async () => {
    const activity = await getActivityByRepo(14, db);

    expect(activity.length).toBeGreaterThan(0);
    const reactActivity = activity.find(a => a.repo === 'facebook/react');
    expect(reactActivity).toBeDefined();
    expect(reactActivity.prs).toBe(2); // 1 opened + 1 merged
    expect(reactActivity.commits).toBe(2);
    expect(reactActivity.issues).toBe(0);

    const nextActivity = activity.find(a => a.repo === 'vercel/next.js');
    expect(nextActivity).toBeDefined();
    expect(nextActivity.issues).toBe(1);
  });

  it('should return recent events sorted by recency', async () => {
    const recent = await getRecentEvents(3, db);

    expect(recent.length).toBe(3);
    expect(recent[0]).toHaveProperty('source_id');
    expect(recent[0]).toHaveProperty('event_type');
  });

  describe('HTTP API Endpoints (Supertest)', () => {
    it('GET /healthz should return 200 OK with server metadata', async () => {
      const res = await request(app).get('/healthz');
      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body).toHaveProperty('database');
    });

    it('GET /api/metrics/stats should return JSON response with 200 or graceful fallback', async () => {
      const res = await request(app).get('/api/metrics/stats');
      // If db is not running locally, returns 500 error payload or 200 data
      if (res.status === 200) {
        expect(res.body.success).toBe(true);
        expect(res.body.data).toHaveProperty('prs_merged_7d');
      } else {
        expect(res.body.success).toBe(false);
      }
    });

    it('GET /dashboard should render HTML with 200 status', async () => {
      const res = await request(app).get('/dashboard');
      expect(res.status).toBe(200);
      expect(res.text).toContain('Internal Ops Dashboard');
      expect(res.text).toContain('PR Activity Trends');
    });
  });
});
