import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import cron from 'node-cron';
import { config } from './config.js';
import { pool } from './db/pool.js';
import { runSync } from './sync/worker.js';

import dashboardRouter from './routes/dashboard.js';
import metricsRouter from './routes/metrics.js';
import syncRouter from './routes/sync.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export const app = express();

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// Template engine
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));

// Mount Routes
app.use('/dashboard', dashboardRouter);
app.get('/', (req, res) => res.redirect('/dashboard'));
app.use('/api/metrics', metricsRouter);
app.use('/api/sync', syncRouter);
app.use('/sync', syncRouter);

// Health check endpoint
app.get('/healthz', async (req, res) => {
  let dbStatus = 'disconnected';
  try {
    const result = await pool.query('SELECT 1');
    if (result.rowCount === 1) dbStatus = 'connected';
  } catch (err) {
    dbStatus = `error: ${err.message}`;
  }

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: dbStatus,
    environment: config.nodeEnv
  });
});

// Centralized error handler
app.use((err, req, res, next) => {
  console.error('[Server Error]', err);
  if (req.path.startsWith('/api/')) {
    return res.status(err.status || 500).json({
      success: false,
      error: err.message || 'Internal Server Error'
    });
  }
  res.status(500).render('dashboard', {
    title: 'Error — Internal Ops Dashboard',
    repos: config.repos,
    stats: { prs_merged_7d: 0, commits_7d: 0, open_issues_recent: 0 },
    recentEvents: [],
    lastSync: null,
    cronSchedule: config.cronSchedule,
    errorMessage: err.message
  });
});

let server = null;
let cronJob = null;

export function startServer(port = config.port) {
  server = app.listen(port, () => {
    console.log(`[Server] Ops Dashboard running at http://localhost:${port}/dashboard`);
    console.log(`[Server] Environment: ${config.nodeEnv}`);
    console.log(`[Server] Tracking repositories: ${config.repos.join(', ')}`);

    // Initialize scheduled cron job
    cronJob = cron.schedule(config.cronSchedule, async () => {
      console.log(`[Cron] Triggering scheduled sync (${config.cronSchedule})...`);
      try {
        await runSync();
      } catch (cronErr) {
        console.error('[Cron] Scheduled sync failed:', cronErr.message);
      }
    });
    console.log(`[Cron] Scheduled job initialized with pattern: "${config.cronSchedule}"`);
  });

  return server;
}

export async function stopServer() {
  if (cronJob) {
    cronJob.stop();
  }
  if (server) {
    await new Promise((resolve) => server.close(resolve));
  }
  await pool.end().catch(() => {});
}

// Graceful shutdown handling
process.on('SIGTERM', async () => {
  console.log('[Server] SIGTERM received. Shutting down gracefully...');
  await stopServer();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('[Server] SIGINT received. Shutting down gracefully...');
  await stopServer();
  process.exit(0);
});

// Only start the server when executed directly (not when required in tests)
if (process.argv[1] && process.argv[1].endsWith('server.js')) {
  startServer();
}

export default app;
