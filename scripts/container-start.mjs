import { existsSync } from 'node:fs';
import { requireProductionOrigin } from './selfhost-config.mjs';
import { spawn } from 'node:child_process';
import { migrate } from './selfhost-migrate.mjs';
requireProductionOrigin();
if (!existsSync('server.js')) throw Error('未找到生产构建 server.js');
migrate();
const child = spawn(process.execPath, ['server.js'], {
  stdio: 'inherit',
  env: { ...process.env, HOSTNAME: '0.0.0.0', PORT: '3000' },
});
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
