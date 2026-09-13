import { describe, it, expect, jest } from '@jest/globals';
import {
  fetchRecentPRs,
  fetchRecentCommits,
  fetchRecentIssues,
  fetchAllRepoEvents
} from '../src/integrations/github.js';

describe('GitHub Integrations & Normalization', () => {
  it('should consume paginated PRs and produce normalized pr_opened and pr_merged events', async () => {
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    const mockOctokit = {
      paginate: {
        iterator: jest.fn().mockReturnValue((async function* () {
          // Page 1
          yield {
            data: [
              {
                id: 101,
                number: 1,
                title: 'Add streaming SSR',
                html_url: 'https://github.com/facebook/react/pull/1',
                state: 'closed',
                created_at: nowIso,
                updated_at: nowIso,
                merged_at: nowIso,
                user: { login: 'gaearon' },
                merged_by: { login: 'acdlite' }
              }
            ]
          };
          // Page 2
          yield {
            data: [
              {
                id: 102,
                number: 2,
                title: 'Fix hydration mismatch',
                html_url: 'https://github.com/facebook/react/pull/2',
                state: 'open',
                created_at: nowIso,
                updated_at: nowIso,
                merged_at: null,
                user: { login: 'sophiebits' }
              }
            ]
          };
        })())
      },
      rest: { pulls: { list: jest.fn() } }
    };

    const events = await fetchRecentPRs('facebook', 'react', sinceDate, mockOctokit);

    expect(events.length).toBe(3); // 1 opened + 1 merged for PR #1, and 1 opened for PR #2

    const pr1Opened = events.find(e => e.source_id === 'github_pr_101_opened');
    expect(pr1Opened).toBeDefined();
    expect(pr1Opened.actor).toBe('gaearon');
    expect(pr1Opened.event_type).toBe('pr_opened');

    const pr1Merged = events.find(e => e.source_id === 'github_pr_101_merged');
    expect(pr1Merged).toBeDefined();
    expect(pr1Merged.actor).toBe('acdlite');
    expect(pr1Merged.event_type).toBe('pr_merged');

    const pr2Opened = events.find(e => e.source_id === 'github_pr_102_opened');
    expect(pr2Opened).toBeDefined();
    expect(pr2Opened.actor).toBe('sophiebits');
    expect(pr2Opened.event_type).toBe('pr_opened');
  });

  it('should consume paginated commits and normalize into commit events', async () => {
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    const mockOctokit = {
      paginate: {
        iterator: jest.fn().mockReturnValue((async function* () {
          yield {
            data: [
              {
                sha: 'abc1234567890',
                html_url: 'https://github.com/facebook/react/commit/abc1234',
                commit: {
                  message: 'fix: concurrent scheduler bug\n\nExtended explanation',
                  author: { name: 'Dan', date: nowIso }
                },
                author: { login: 'gaearon' }
              }
            ]
          };
        })())
      },
      rest: { repos: { listCommits: jest.fn() } }
    };

    const events = await fetchRecentCommits('facebook', 'react', sinceDate, mockOctokit);

    expect(events.length).toBe(1);
    expect(events[0]).toEqual(expect.objectContaining({
      source: 'github',
      event_type: 'commit',
      source_id: 'github_commit_abc1234567890',
      actor: 'gaearon',
      target: 'facebook/react'
    }));
    expect(events[0].payload.sha).toBe('abc1234');
    expect(events[0].payload.message).toBe('fix: concurrent scheduler bug');
  });

  it('should consume issues and filter out PR objects from issues endpoint', async () => {
    const sinceDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const nowIso = new Date().toISOString();

    const mockOctokit = {
      paginate: {
        iterator: jest.fn().mockReturnValue((async function* () {
          yield {
            data: [
              // Pure issue
              {
                id: 501,
                number: 10,
                title: 'Memory leak in node stream',
                html_url: 'https://github.com/facebook/react/issues/10',
                state: 'open',
                created_at: nowIso,
                user: { login: 'reporter1' }
              },
              // Pull Request returned in issues endpoint -> should be excluded
              {
                id: 502,
                number: 11,
                title: 'PR masked as issue',
                pull_request: { url: 'https://api.github.com/repos/facebook/react/pulls/11' },
                created_at: nowIso,
                user: { login: 'pr_author' }
              }
            ]
          };
        })())
      },
      rest: { issues: { listForRepo: jest.fn() } }
    };

    const events = await fetchRecentIssues('facebook', 'react', sinceDate, mockOctokit);

    expect(events.length).toBe(1);
    expect(events[0].source_id).toBe('github_issue_501_opened');
    expect(events[0].event_type).toBe('issue_opened');
    expect(events[0].actor).toBe('reporter1');
  });

  it('should fail cleanly if repository format is invalid', async () => {
    await expect(fetchAllRepoEvents('invalid-repo-format'))
      .rejects.toThrow('Invalid repository format');
  });
});
