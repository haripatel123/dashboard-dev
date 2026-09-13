import { config } from '../config.js';
import { fetchAllRepoEvents } from '../integrations/github.js';
import { insertEvents } from '../db/repos/events.js';
import { startSyncRun, completeSyncRun, failSyncRun } from '../db/repos/syncRuns.js';

let isSyncRunning = false;

/**
 * Orchestrates a complete sync across all configured repositories.
 * Tracks execution state, audits in sync_runs, and enforces idempotency in events.
 *
 * @param {Object} [options]
 * @param {string[]} [options.repos] - Optional list of repositories to sync
 * @param {number} [options.sinceHours=24] - How far back to look for events
 * @param {any} [options.octokit] - Optional Octokit instance for mocking/testing
 * @returns {Promise<Object>} Summary of the sync run
 */
export async function runSync(options = {}) {
  if (isSyncRunning) {
    console.warn('[Sync Worker] Sync already in progress, skipping concurrent run.');
    return {
      status: 'skipped',
      message: 'A sync run is already in progress'
    };
  }

  isSyncRunning = true;
  const startTime = Date.now();
  const repos = options.repos || config.repos;
  const sinceHours = options.sinceHours || 24;
  let syncRunRecord = null;

  try {
    syncRunRecord = await startSyncRun('github');
    console.log(`[Sync Worker] Started sync run #${syncRunRecord.id} for ${repos.length} repositories.`);

    let totalIngested = 0;
    let totalFetched = 0;
    const repoResults = [];

    for (const repo of repos) {
      try {
        console.log(`[Sync Worker] Fetching events for ${repo}...`);
        const events = await fetchAllRepoEvents(repo, sinceHours, options.octokit);
        totalFetched += events.length;

        const { inserted } = await insertEvents(events);
        totalIngested += inserted;

        repoResults.push({
          repo,
          fetched: events.length,
          inserted,
          status: 'success'
        });

        console.log(`[Sync Worker] Completed ${repo}: ${inserted} new / ${events.length} fetched.`);
      } catch (repoErr) {
        console.error(`[Sync Worker] Error processing repo ${repo}:`, repoErr.message);
        repoResults.push({
          repo,
          status: 'error',
          error: repoErr.message
        });
      }
    }

    const durationMs = Date.now() - startTime;
    await completeSyncRun(syncRunRecord.id, totalIngested);
    console.log(`[Sync Worker] Sync run #${syncRunRecord.id} finished successfully in ${durationMs}ms with ${totalIngested} new events ingested.`);

    return {
      success: true,
      runId: syncRunRecord.id,
      durationMs,
      reposProcessed: repos.length,
      eventsIngested: totalIngested,
      totalEventsFetched: totalFetched,
      repoResults
    };
  } catch (err) {
    const durationMs = Date.now() - startTime;
    console.error('[Sync Worker] Critical failure during sync run:', err.message);

    if (syncRunRecord?.id) {
      try {
        await failSyncRun(syncRunRecord.id, err.message);
      } catch (auditErr) {
        console.error('[Sync Worker] Failed to update sync_runs error status:', auditErr.message);
      }
    }

    return {
      success: false,
      runId: syncRunRecord?.id || null,
      durationMs,
      error: err.message
    };
  } finally {
    isSyncRunning = false;
  }
}

export function isSyncInProgress() {
  return isSyncRunning;
}

export default { runSync, isSyncInProgress };
