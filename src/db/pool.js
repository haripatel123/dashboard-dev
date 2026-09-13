import pg from 'pg';
import { config } from '../config.js';

const { Pool } = pg;

const poolConfig = {
  connectionString: config.databaseUrl
};

// Render and cloud Postgres providers require SSL
if (config.isProduction || (config.databaseUrl && config.databaseUrl.includes('render.com'))) {
  poolConfig.ssl = {
    rejectUnauthorized: false
  };
}

export const pool = new Pool(poolConfig);

pool.on('error', (err) => {
  console.error('[DB] Unexpected error on idle client:', err.message);
});

export async function query(text, params) {
  return await pool.query(text, params);
}

export async function getClient() {
  return await pool.connect();
}

export default pool;
