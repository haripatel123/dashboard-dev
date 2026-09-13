import express from 'express';
import { getStatTiles, getRecentEvents } from '../db/repos/events.js';
import { getLastSyncRun } from '../db/repos/syncRuns.js';
import { config } from '../config.js';

const router = express.Router();

router.get('/', async (req, res) => {
  try {
    let stats = { prs_merged_7d: 0, commits_7d: 0, open_issues_recent: 0 };
    let recentEvents = [];
    let lastSync = null;

    try {
      [stats, recentEvents, lastSync] = await Promise.all([
        getStatTiles(),
        getRecentEvents(15),
        getLastSyncRun('github')
      ]);
    } catch (dbErr) {
      console.warn('[Dashboard Route] DB query failed during render (DB might be empty or unmigrated):', dbErr.message);
    }

    res.render('dashboard', {
      title: 'Internal Ops Dashboard',
      repos: config.repos,
      stats,
      recentEvents,
      lastSync,
      cronSchedule: config.cronSchedule
    });
  } catch (err) {
    res.status(500).send(`Internal Server Error: ${err.message}`);
  }
});

export default router;
