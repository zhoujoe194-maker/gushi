import { existsSync, cpSync, mkdirSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { databasePath } from '../runtime/sqlite.mjs';
import { migrate } from './selfhost-migrate.mjs';
import { requireProductionOrigin } from './selfhost-config.mjs';
requireProductionOrigin();
if (!existsSync('.next-production/standalone/server.js'))
  throw Error('请先运行 npm run build');
migrate();
mkdirSync('.next-production/standalone/.next-production', { recursive: true });
cpSync(
  '.next-production/static',
  '.next-production/standalone/.next-production/static',
  { recursive: true },
);
cpSync('public', '.next-production/standalone/public', { recursive: true });
const child = spawn(
  process.execPath,
  ['.next-production/standalone/server.js'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      DATABASE_PATH: databasePath(),
      HOSTNAME: process.env.LISTEN_HOST || '127.0.0.1',
      PORT: process.env.PORT || '3000',
    },
  },
);
for (const signal of ['SIGTERM', 'SIGINT'])
  process.on(signal, () => child.kill(signal));
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) =>
  process.exit(
    code ?? (signal === 'SIGTERM' ? 143 : signal === 'SIGINT' ? 130 : 1),
  ),
);
