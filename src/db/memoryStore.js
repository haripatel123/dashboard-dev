import { MockDatabase } from '../../tests/helpers/mockDb.js';

export const memoryStore = new MockDatabase();

// Pre-populate with realistic seed data so dashboard is immediately rich and interactive
const repos = [
  'facebook/react',
  'vercel/next.js',
  'nodejs/node',
  'vitejs/vite',
  'sveltejs/svelte'
];

const authors = [
  'gaearon', 'acdlite', 'sophiebits', 'sebmarkbage',
  'timneutkens', 'shuding', 'styfle', 'ijjk',
  'Rich-Harris', 'dummdidumm', 'benmccann',
  'yyx990803', 'patak-dev', 'antfu', 'bluwy',
  'mhdawson', 'bnoordhuis', 'BridgeAR', 'targos'
];

const prTitles = [
  'fix: prevent race condition in concurrent mode scheduler',
  'feat: support incremental streaming SSR hydration',
  'perf: optimize AST compilation pass for dynamic imports',
  'refactor: unify error telemetry middleware across nodes',
  'docs: update migration guide for v19 architecture',
  'chore: update internal rust compiler bindings',
  'fix: handle socket hangup on keep-alive timeouts',
  'feat: implement zero-copy buffer transfer for worker threads'
];

const commitMessages = [
  'chore: bump toolchain dependencies',
  'fix(core): memoize computed signal derivations',
  'perf: avoid redundant V8 hidden class transitions',
  'test: add unit coverage for edge-case headers',
  'feat(router): support nested parallel route interceptors',
  'ci: optimize GitHub Actions matrix cache'
];

const issueTitles = [
  'Memory leak observed under sustained HTTP/2 pipelining',
  'Hot Module Replacement hangs on Windows path separators',
  'TypeScript error when importing ESM subpath exports',
  'Hydration mismatch with custom web components in shadow DOM',
  'DevServer crashes on rapid successive file saves'
];

const now = Date.now();
const dayMs = 24 * 60 * 60 * 1000;

for (let day = 14; day >= 0; day--) {
  const dayTimestamp = now - day * dayMs;
  const eventsForDay = Math.floor(10 + Math.random() * 12);

  for (let i = 0; i < eventsForDay; i++) {
    const repo = repos[Math.floor(Math.random() * repos.length)];
    const author = authors[Math.floor(Math.random() * authors.length)];
    const occurredAt = new Date(dayTimestamp + Math.floor(Math.random() * dayMs));
    const randType = Math.random();

    if (randType < 0.35) {
      const prNumber = 1000 + Math.floor(Math.random() * 9000);
      const title = prTitles[Math.floor(Math.random() * prTitles.length)];
      memoryStore.events.push({
        id: memoryStore.nextEventId++,
        source: 'github',
        event_type: 'pr_opened',
        source_id: `seed_pr_${repo.replace('/', '_')}_${prNumber}_opened`,
        actor: author,
        target: repo,
        occurred_at: occurredAt,
        payload: {
          number: prNumber,
          title,
          html_url: `https://github.com/${repo}/pull/${prNumber}`,
          state: 'open'
        },
        fetched_at: new Date()
      });

      if (Math.random() < 0.6) {
        const mergedAt = new Date(occurredAt.getTime() + Math.floor(Math.random() * 8 * 60 * 60 * 1000));
        memoryStore.events.push({
          id: memoryStore.nextEventId++,
          source: 'github',
          event_type: 'pr_merged',
          source_id: `seed_pr_${repo.replace('/', '_')}_${prNumber}_merged`,
          actor: author,
          target: repo,
          occurred_at: mergedAt,
          payload: {
            number: prNumber,
            title,
            html_url: `https://github.com/${repo}/pull/${prNumber}`,
            state: 'merged'
          },
          fetched_at: new Date()
        });
      }
    } else if (randType < 0.75) {
      const sha = Math.random().toString(16).substring(2, 9);
      const message = commitMessages[Math.floor(Math.random() * commitMessages.length)];
      memoryStore.events.push({
        id: memoryStore.nextEventId++,
        source: 'github',
        event_type: 'commit',
        source_id: `seed_commit_${repo.replace('/', '_')}_${sha}`,
        actor: author,
        target: repo,
        occurred_at: occurredAt,
        payload: {
          sha,
          message,
          html_url: `https://github.com/${repo}/commit/${sha}`
        },
        fetched_at: new Date()
      });
    } else {
      const issueNumber = 500 + Math.floor(Math.random() * 4000);
      const title = issueTitles[Math.floor(Math.random() * issueTitles.length)];
      memoryStore.events.push({
        id: memoryStore.nextEventId++,
        source: 'github',
        event_type: 'issue_opened',
        source_id: `seed_issue_${repo.replace('/', '_')}_${issueNumber}_opened`,
        actor: author,
        target: repo,
        occurred_at: occurredAt,
        payload: {
          number: issueNumber,
          title,
          html_url: `https://github.com/${repo}/issues/${issueNumber}`,
          state: 'open'
        },
        fetched_at: new Date()
      });
    }
  }
}

// Initial sync run record
memoryStore.syncRuns.push({
  id: memoryStore.nextRunId++,
  source: 'github',
  started_at: new Date(now - 12 * 60 * 1000), // 12 mins ago
  finished_at: new Date(now - 12 * 60 * 1000 + 420),
  status: 'success',
  events_ingested: 38,
  error_message: null
});
