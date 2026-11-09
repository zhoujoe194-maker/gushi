import { spawn } from 'node:child_process';
const child = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'build', '--webpack'],
  {
    stdio: 'inherit',
    env: {
      ...process.env,
      APP_BUILD_DIR: '.next-production',
      NEXT_TELEMETRY_DISABLED: '1',
    },
  },
);
child.on('error', (error) => {
  console.error(error.message);
  process.exit(1);
});
child.on('exit', (code, signal) =>
  process.exit(
    code ?? (signal === 'SIGTERM' ? 143 : signal === 'SIGINT' ? 130 : 1),
  ),
);
