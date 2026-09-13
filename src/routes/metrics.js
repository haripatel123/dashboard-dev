import express from 'express';
import {
  getStatTiles,
  getPRsPerDay,
  getTopContributors,
  getActivityByRepo,
  getRecentEvents
} from '../db/repos/events.js';

const router = express.Router();

// GET /api/metrics/stats - 3 headline KPI stat tiles
router.get('/stats', async (req, res, next) => {
  try {
    const stats = await getStatTiles();
    res.json({
      success: true,
      data: stats
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/metrics/prs-per-day - opened vs merged per day (last 14 days)
router.get('/prs-per-day', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '14', 10);
    const data = await getPRsPerDay(days);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/metrics/top-contributors - top 10 contributors (last 7 days)
router.get('/top-contributors', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '7', 10);
    const limit = parseInt(req.query.limit || '10', 10);
    const data = await getTopContributors(days, limit);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/metrics/activity-by-repo - PRs, commits, issues per repo (last 14 days)
router.get('/activity-by-repo', async (req, res, next) => {
  try {
    const days = parseInt(req.query.days || '14', 10);
    const data = await getActivityByRepo(days);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

// GET /api/metrics/recent-events - last 15 events
router.get('/recent-events', async (req, res, next) => {
  try {
    const limit = parseInt(req.query.limit || '15', 10);
    const data = await getRecentEvents(limit);
    res.json({
      success: true,
      data
    });
  } catch (err) {
    next(err);
  }
});

export default router;
