import express from 'express';
import rateLimit from 'express-rate-limit';
import { runSync, isSyncInProgress } from '../sync/worker.js';
import { getLastSyncRun } from '../db/repos/syncRuns.js';

const router = express.Router();

// Rate limit: 5 requests per minute per IP
const syncLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: 'Too many sync requests. Please wait a moment before trying again.'
  }
});

/**
 * POST /sync
 * Triggers a manual sync across all configured repositories with rate limiting.
 */
router.post('/', syncLimiter, async (req, res, next) => {
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
 * GET /sync/status
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
