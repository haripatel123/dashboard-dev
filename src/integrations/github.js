import { Octokit } from '@octokit/rest';
import { config } from '../config.js';
import { withRetry } from '../sync/retry.js';

/**
 * Creates an Octokit instance configured with optional auth token and user agent.
 */
export function createOctokitClient(token = config.githubToken) {
  const options = {
    userAgent: 'ops-dashboard-v1'
  };
  if (token) {
    options.auth = token;
  }
  return new Octokit(options);
}

export const defaultOctokit = createOctokitClient();

/**
 * Normalizes Pull Requests into unified event records.
 * Emits distinct events for opening and merging/closing with deterministic source_ids.
 */
export async function fetchRecentPRs(owner, repo, sinceDate, octokit = defaultOctokit) {
  const events = [];
  const target = `${owner}/${repo}`;

  const iterator = octokit.paginate.iterator(octokit.rest.pulls.list, {
    owner,
    repo,
    state: 'all',
    sort: 'updated',
    direction: 'desc',
    per_page: 100
  });

  for await (const response of iterator) {
    for (const pr of response.data) {
      const updatedAt = new Date(pr.updated_at);
      if (updatedAt < sinceDate) {
        // Since results are sorted by updated_at descending, once we see an older PR we can stop paginating
        return events;
      }

      const createdAt = new Date(pr.created_at);
      if (createdAt >= sinceDate) {
        events.push({
          source: 'github',
          event_type: 'pr_opened',
          source_id: `github_pr_${pr.id}_opened`,
          actor: pr.user?.login || 'unknown',
          target,
          occurred_at: createdAt,
          payload: {
            number: pr.number,
            title: pr.title,
            html_url: pr.html_url,
            state: pr.state
          }
        });
      }

      if (pr.merged_at) {
        const mergedAt = new Date(pr.merged_at);
        if (mergedAt >= sinceDate) {
          events.push({
            source: 'github',
            event_type: 'pr_merged',
            source_id: `github_pr_${pr.id}_merged`,
            actor: pr.merged_by?.login || pr.user?.login || 'unknown',
            target,
            occurred_at: mergedAt,
            payload: {
              number: pr.number,
              title: pr.title,
              html_url: pr.html_url,
              state: 'merged'
            }
          });
        }
      } else if (pr.state === 'closed' && pr.closed_at) {
        const closedAt = new Date(pr.closed_at);
        if (closedAt >= sinceDate) {
          events.push({
            source: 'github',
            event_type: 'pr_closed',
            source_id: `github_pr_${pr.id}_closed`,
            actor: pr.user?.login || 'unknown',
            target,
            occurred_at: closedAt,
            payload: {
              number: pr.number,
              title: pr.title,
              html_url: pr.html_url,
              state: 'closed'
            }
          });
        }
      }
    }
  }

  return events;
}

/**
 * Normalizes Commits into unified event records.
 */
export async function fetchRecentCommits(owner, repo, sinceDate, octokit = defaultOctokit) {
  const events = [];
  const target = `${owner}/${repo}`;

  const iterator = octokit.paginate.iterator(octokit.rest.repos.listCommits, {
    owner,
    repo,
    since: sinceDate.toISOString(),
    per_page: 100
  });

  for await (const response of iterator) {
    for (const c of response.data) {
      const commitDate = new Date(c.commit?.author?.date || c.commit?.committer?.date || Date.now());
      events.push({
        source: 'github',
        event_type: 'commit',
        source_id: `github_commit_${c.sha}`,
        actor: c.author?.login || c.commit?.author?.name || 'unknown',
        target,
        occurred_at: commitDate,
        payload: {
          sha: c.sha.substring(0, 7),
          message: c.commit?.message?.split('\n')[0] || '',
          html_url: c.html_url
        }
      });
    }
  }

  return events;
}

/**
 * Normalizes Issues (excluding PRs) into unified event records.
 */
export async function fetchRecentIssues(owner, repo, sinceDate, octokit = defaultOctokit) {
  const events = [];
  const target = `${owner}/${repo}`;

  const iterator = octokit.paginate.iterator(octokit.rest.issues.listForRepo, {
    owner,
    repo,
    state: 'all',
    since: sinceDate.toISOString(),
    per_page: 100
  });

  for await (const response of iterator) {
    for (const issue of response.data) {
      // Filter out pull requests, which GitHub includes in issues endpoint
      if (issue.pull_request) continue;

      const createdAt = new Date(issue.created_at);
      if (createdAt >= sinceDate) {
        events.push({
          source: 'github',
          event_type: 'issue_opened',
          source_id: `github_issue_${issue.id}_opened`,
          actor: issue.user?.login || 'unknown',
          target,
          occurred_at: createdAt,
          payload: {
            number: issue.number,
            title: issue.title,
            html_url: issue.html_url,
            state: issue.state
          }
        });
      }

      if (issue.state === 'closed' && issue.closed_at) {
        const closedAt = new Date(issue.closed_at);
        if (closedAt >= sinceDate) {
          events.push({
            source: 'github',
            event_type: 'issue_closed',
            source_id: `github_issue_${issue.id}_closed`,
            actor: issue.closed_by?.login || issue.user?.login || 'unknown',
            target,
            occurred_at: closedAt,
            payload: {
              number: issue.number,
              title: issue.title,
              html_url: issue.html_url,
              state: 'closed'
            }
          });
        }
      }
    }
  }

  return events;
}

/**
 * Pulls all recent events across PRs, Commits, and Issues for a given repository with retry handling.
 */
export async function fetchAllRepoEvents(repoFullName, sinceHours = 24, octokit = defaultOctokit) {
  const [owner, repo] = repoFullName.split('/');
  if (!owner || !repo) {
    throw new Error(`Invalid repository format "${repoFullName}". Expected "owner/repo".`);
  }

  const sinceDate = new Date(Date.now() - sinceHours * 60 * 60 * 1000);

  const [prs, commits, issues] = await Promise.all([
    withRetry(() => fetchRecentPRs(owner, repo, sinceDate, octokit)),
    withRetry(() => fetchRecentCommits(owner, repo, sinceDate, octokit)),
    withRetry(() => fetchRecentIssues(owner, repo, sinceDate, octokit))
  ]);

  return [...prs, ...commits, ...issues];
}
