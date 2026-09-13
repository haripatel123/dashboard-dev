import dotenv from 'dotenv';
dotenv.config();

const DEFAULT_REPOS = [
  'facebook/react',
  'vercel/next.js',
  'nodejs/node',
  'vitejs/vite',
  'sveltejs/svelte'
];

export const config = {
  port: parseInt(process.env.PORT || '3000', 10),
  nodeEnv: process.env.NODE_ENV || 'development',
  isProduction: process.env.NODE_ENV === 'production',
  databaseUrl: process.env.DATABASE_URL || 'postgresql://postgres:postgres@localhost:5432/ops_dashboard',
  githubToken: process.env.GITHUB_TOKEN || '',
  repos: process.env.REPOS
    ? process.env.REPOS.split(',').map(r => r.trim()).filter(Boolean)
    : DEFAULT_REPOS,
  cronSchedule: process.env.CRON_SCHEDULE || '0 * * * *'
};

export default config;
