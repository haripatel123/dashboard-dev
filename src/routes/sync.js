import express from 'express';
import { runSync, isSyncInProgress } from '../sync/worker.js';
import { getLastSyncRun } from '../db/repos/syncRuns.js';

const router = express.Router();

/**
 * POST /api/sync or POST /sync
 * Triggers a manual sync across all configured repositories.
 */
router.post(['/', '/sync'], async (req, res, next) => {
  try {
    if (isSyncInProgress()) {
      return res.status(409).json({
        success: false,
        status: 'in_progress',
        message: 'A sync run is already in progress. Please wait for it to complete.'
      });
    }

    const result = await runSync();
    if (!result.success && result.status !== 'skipped') {
      return res.status(500).json({
        success: false,
        error: result.error || 'Sync run encountered an unexpected failure.'
      });
    }

    res.json({
      success: true,
      message: 'Sync completed successfully.',
      data: result
    });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/sync/status
 * Returns the status of the most recent sync run.
 */
router.get('/status', async (req, res, next) => {
  try {
    const lastRun = await getLastSyncRun('github');
    res.json({
      success: true,
      data: {
        isSyncing: isSyncInProgress(),
        lastRun
      }
    });
  } catch (err) {
    next(err);
  }
});

export default router;
