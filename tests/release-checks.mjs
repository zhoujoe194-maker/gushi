// Runs the deployed application against disposable databases, never company data.
import { spawn } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  openSync,
  closeSync,
  readFileSync,
  writeFileSync,
  cpSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
if (process.env.RUN_LOCAL_TESTS !== '1')
  throw Error('请设置 RUN_LOCAL_TESTS=1，仅使用自动创建的隔离数据库');
const root = fileURLToPath(new URL('..', import.meta.url));
const output = resolve(process.env.QA_OUTPUT || 'work/release-checks');
mkdirSync(output, { recursive: true });
const runDir = mkdtempSync(join(output, 'run-'));
const basePort = Number(process.env.QA_BASE_PORT || 5210);
if (!Number.isInteger(basePort) || basePort < 1024 || basePort > 65000)
  throw Error('无效的测试端口');
const standalone = join(root, '.next-production/standalone');
cpSync(
  join(root, '.next-production/static'),
  join(standalone, '.next-production/static'),
  { recursive: true },
);
cpSync(join(root, 'public'), join(standalone, 'public'), { recursive: true });
const results = [];
async function run(name, script, extra = {}) {
  const log = join(runDir, name + '.txt'),
    fd = openSync(log, 'w', 0o600);
  try {
    const child = spawn(process.execPath, [join(root, script)], {
      cwd: root,
      env: { ...process.env, ...extra, RUN_LOCAL_TESTS: '1' },
      stdio: ['ignore', fd, fd],
    });
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    const text = readFileSync(log, 'utf8');
    if (code !== 0 || /^FAIL /m.test(text))
      throw Error(name + ' 未通过，详见 ' + log);
    const count = text
      .split('\n')
      .filter((line) => line.startsWith('PASS ')).length;
    results.push({ name, passed: count, log });
    console.log(name + ': ' + (count ? count + ' 项通过' : '完成'));
  } finally {
    closeSync(fd);
  }
}
async function scenario(name, prefix, offset) {
  mkdirSync('/private/tmp/' + prefix, { recursive: true });
  const database = join(
    mkdtempSync('/private/tmp/' + prefix + '/release-'),
    'company.sqlite',
  );
  const port = basePort + offset,
    base = 'http://127.0.0.1:' + port;
  // Refuse a busy port before touching fixture data or sending requests.
  try {
    await fetch(base, { signal: AbortSignal.timeout(500) });
    throw Error('测试端口已占用：' + port);
  } catch (error) {
    if (error.message.startsWith('测试端口')) throw error;
  }
  const env = {
    DATABASE_PATH: database,
    PORT: String(port),
    HOSTNAME: '127.0.0.1',
    APP_ORIGIN: base,
    NODE_ENV: 'production',
    QA_URL: base,
  };
  await run(name + '-database-setup', 'scripts/selfhost-migrate.mjs', env);
  const fd = openSync(join(runDir, name + '-server.txt'), 'w', 0o600);
  const server = spawn(process.execPath, [join(standalone, 'server.js')], {
    cwd: root,
    env: { ...process.env, ...env },
    stdio: ['ignore', fd, fd],
  });
  let error;
  server.on('error', (e) => {
    error = e;
  });
  try {
    let ready = false;
    for (let i = 0; i < 100; i++) {
      if (error || server.exitCode !== null)
        throw error || Error(name + ' 服务启动失败');
      try {
        if ((await fetch(base, { signal: AbortSignal.timeout(1000) })).ok) {
          ready = true;
          break;
        }
      } catch {}
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    if (!ready) throw Error(name + ' 服务启动超时');
    await run(name, 'tests/' + name + '-integration.mjs', env);
  } finally {
    if (server.exitCode === null) {
      const stopped = new Promise((resolve) => server.once('exit', resolve));
      server.kill('SIGTERM');
      await stopped;
    }
    closeSync(fd);
  }
}
try {
  let offset = 0;
  for (const name of ['access', 'auth', 'business', 'task-images', 'commercial'])
    await scenario(name, 'gushi-access-qa', offset++);
  for (const name of ['messages', 'groups'])
    await scenario(name, 'gushi-message-qa', offset++);
  await scenario('sales', 'gushi-sales-qa', offset++);
  await run('setup', 'tests/setup-integration.mjs', {
    QA_SETUP_PORT: String(basePort + offset++),
  });
  await run('deployment', 'tests/deployment-smoke.mjs', {
    QA_DEPLOY_PORT: String(basePort + offset++),
  });
  await run('d1-portals', 'tests/d1-portals.mjs', {
    QA_D1_PORT: String(basePort + offset++),
  });
  await run('d1-rectify', 'tests/d1-rectify.mjs', {
    QA_RECTIFY_PORT: String(basePort + offset++),
  });
  await run('sales-migration', 'tests/sales-reports-migration.mjs');
  const summary = {
    passed: results.reduce((n, r) => n + r.passed, 0),
    results,
  };
  writeFileSync(
    join(runDir, 'summary.json'),
    JSON.stringify(summary, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      passed: summary.passed,
      report: join(runDir, 'summary.json'),
    }),
  );
} catch (error) {
  writeFileSync(
    join(runDir, 'failure.json'),
    JSON.stringify({ error: error.message, completed: results }, null, 2),
  );
  console.error(error.message);
  process.exitCode = 1;
}
