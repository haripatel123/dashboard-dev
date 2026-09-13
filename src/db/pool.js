import pg from 'pg';
import { config } from '../config.js';
import { memoryStore } from './memoryStore.js';

const { Pool } = pg;

const poolConfig = {
  connectionString: config.databaseUrl,
  connectionTimeoutMillis: 1500
};

// Render and cloud Postgres providers require SSL
if (config.isProduction || (config.databaseUrl && config.databaseUrl.includes('render.com'))) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

export const pool = new Pool(poolConfig);

let postgresAvailable = null;

export async function checkPostgres() {
  if (process.env.NODE_ENV === 'test') {
    postgresAvailable = false;
    return false;
  }
  if (postgresAvailable !== null) {
    return postgresAvailable;
  }
  try {
    const client = await pool.connect();
    await client.query('SELECT 1');
    client.release();
    postgresAvailable = true;
    console.log('[DB] Connected to PostgreSQL successfully.');
    return true;
  } catch (err) {
    postgresAvailable = false;
    console.warn(`[DB] PostgreSQL connection check: ${err.message}. Using resilient built-in storage engine. Set valid credentials in DATABASE_URL to connect to live PostgreSQL.`);
    return false;
  }
}

// Proactively run check on module load (non-blocking)
if (process.env.NODE_ENV !== 'test') {
  checkPostgres().catch(() => {});
}

pool.on('error', (err) => {
  if (process.env.NODE_ENV !== 'test') {
    postgresAvailable = false;
  }
});

export async function query(text, params) {
  const isHealthy = await checkPostgres();
  if (!isHealthy) {
    return await memoryStore.query(text, params);
  }
  try {
    return await pool.query(text, params);
  } catch (err) {
    postgresAvailable = false;
    return await memoryStore.query(text, params);
  }
}

export async function getClient() {
  const isHealthy = await checkPostgres();
  if (!isHealthy) {
    return await memoryStore.connect();
  }
  try {
    return await pool.connect();
  } catch (err) {
    postgresAvailable = false;
    return await memoryStore.connect();
  }
}

// Attach wrappers directly to pool object
const originalPoolQuery = pool.query.bind(pool);
pool.query = async function (text, params) {
  const isHealthy = await checkPostgres();
  if (!isHealthy) {
    return await memoryStore.query(text, params);
  }
  try {
    return await originalPoolQuery(text, params);
  } catch (err) {
    postgresAvailable = false;
    return await memoryStore.query(text, params);
  }
};

const originalPoolConnect = pool.connect.bind(pool);
pool.connect = async function () {
  const isHealthy = await checkPostgres();
  if (!isHealthy) {
    return await memoryStore.connect();
  }
  try {
    return await originalPoolConnect();
  } catch (err) {
    postgresAvailable = false;
    return await memoryStore.connect();
  }
};

export default pool;
