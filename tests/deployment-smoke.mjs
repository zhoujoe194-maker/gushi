import { spawn, spawnSync } from 'node:child_process';
import {
  mkdtempSync,
  mkdirSync,
  symlinkSync,
  readdirSync,
  statSync,
  copyFileSync,
  cpSync,
  existsSync,
} from 'node:fs';
import { resolve, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { openSqlite } from '../runtime/sqlite.mjs';

if (process.env.RUN_LOCAL_TESTS !== '1') throw Error('仅限隔离的本机部署验收');
const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync('/private/tmp/gushi-deploy-qa', { recursive: true });
const cwd = mkdtempSync('/private/tmp/gushi-deploy-qa/smoke-'),
  database = join(cwd, 'company.sqlite');
symlinkSync(resolve(root, 'drizzle'), join(cwd, 'drizzle'));
const port = process.env.QA_DEPLOY_PORT || '5189';
if (!/^\d{4,5}$/.test(port)) throw Error('Invalid test port');
const base = `http://127.0.0.1:${port}`,
  origin = 'https://deploy-qa.invalid';
const env = {
  ...process.env,
  DATABASE_PATH: database,
  APP_ORIGIN: origin,
  NODE_ENV: 'production',
  HOSTNAME: '127.0.0.1',
  PORT: port,
};
const passed = [];
function check(value, label) {
  if (!value) throw Error(label);
  passed.push(label);
  console.log('PASS ' + label);
}
function run(script, overrides = {}) {
  const r = spawnSync(process.execPath, [resolve(root, script)], {
    cwd,
    env: { ...env, ...overrides },
    encoding: 'utf8',
  });
  if (r.error) throw r.error;
  return r;
}
const migrated = run('scripts/selfhost-migrate.mjs');
check(migrated.status === 0, '空数据库迁移成功');
let db = openSqlite(database);
const migrations = db
  .prepare('SELECT COUNT(*) AS n FROM __app_migrations')
  .get().n;
db.close();
check(migrations === readdirSync(join(root,'drizzle')).filter(n => /^\d+.*\.sql$/.test(n)).length, '完整应用全部版本迁移');
check(run('scripts/selfhost-migrate.mjs').status === 0, '重复迁移幂等');
for (const script of [
  'scripts/selfhost-start.mjs',
  'scripts/container-start.mjs',
]) {
  for (const APP_ORIGIN of [
    '',
    'http://crm.example.com',
    'https://crm.example.com/path',
    'https://crm.example.com?query=1',
    'https://crm.example.com#fragment',
    'https://user:secret@crm.example.com',
    'https://bad host',
  ])
    check(
      run(script, { APP_ORIGIN }).status !== 0,
      `${script} 拒绝不合格域名 ${APP_ORIGIN || '(缺失)'}`,
    );
}
const unopened = join(cwd, 'unopened.sqlite');
for (const script of [
  'scripts/selfhost-start.mjs',
  'scripts/container-start.mjs',
]) {
  check(
    run(script, { DATABASE_PATH: unopened }).status !== 0 &&
      !existsSync(unopened),
    `${script} 缺少构建时不创建或迁移数据库`,
  );
}
let server;
try {
  const standalone = resolve(root, '.next-production/standalone');
  mkdirSync(join(standalone, '.next-production'), { recursive: true });
  cpSync(
    resolve(root, '.next-production/static'),
    join(standalone, '.next-production/static'),
    { recursive: true },
  );
  cpSync(resolve(root, 'public'), join(standalone, 'public'), {
    recursive: true,
  });
  symlinkSync(resolve(root, '.next-production'), join(cwd, '.next-production'));
  cpSync(resolve(root, 'public'), join(cwd, 'public'), { recursive: true });
  server = spawn(
    process.execPath,
    [resolve(root, 'scripts/selfhost-start.mjs')],
    { cwd, env, stdio: ['ignore', 'pipe', 'pipe'] },
  );
  let output = '';
  server.stderr.on('data', (b) => {
    output += b;
  });
  server.stdout.on('data', (b) => {
    output += b;
  });
  for (let i = 0; i < 80; i++) {
    try {
      if ((await fetch(base)).ok) break;
    } catch {}
    if (server.exitCode !== null) throw Error(output);
    await new Promise((r) => setTimeout(r, 100));
  }
  check(
    (await (await fetch(base)).text()).includes('公司工作区尚未初始化'),
    '全新部署显示管理员初始化说明',
  );
  const health = await fetch(base + '/api/health');
  check(
    health.status === 200 &&
      JSON.stringify(await health.json()) === '{"status":"ok"}',
    '健康检查只返回就绪状态，不泄露公司信息',
  );
  check(health.headers.get('cache-control') === 'no-store', '健康检查禁用缓存');
  check(
    run('scripts/selfhost-healthcheck.mjs').status === 0,
    '本机健康探针成功',
  );
  db = openSqlite(database);
  const latest = db
    .prepare('SELECT * FROM __app_migrations WHERE name=?')
    .get('0011_management_meetings.sql');
  // Fault injection only in this disposable test database; restore even on failure.
  db.prepare('DELETE FROM __app_migrations WHERE name=?').run(latest.name);
  try {
    const unavailable = await fetch(base + '/api/health');
    check(
      unavailable.status === 503 &&
        JSON.stringify(await unavailable.json()) === '{"status":"unavailable"}',
      '数据库未完成迁移时返回 503，不暴露内部异常',
    );
    check(
      run('scripts/selfhost-healthcheck.mjs').status !== 0,
      '数据库异常时健康探针失败',
    );
  } finally {
    db.prepare('INSERT INTO __app_migrations VALUES(?,?,?)').run(
      latest.name,
      latest.digest,
      latest.applied_at,
    );
    db.close();
  }
  check(
    (await fetch(base + '/api/health')).status === 200,
    '数据库恢复后健康状态恢复',
  );
  const email = 'deployment-admin@example.invalid',
    initial = 'InitialQA!' + randomUUID(),
    updated = 'UpdatedQA!' + randomUUID();
  async function admin(password) {
    const child = spawn(
      process.execPath,
      [resolve(root, 'scripts/selfhost-admin.mjs')],
      {
        cwd,
        env: { ...env, INITIAL_ADMIN_EMAIL: email },
        stdio: ['pipe', 'pipe', 'pipe'],
      },
    );
    const prompts = [
      '管理员邮箱',
      '管理员手机号',
      '设置管理员临时密码',
      '再输入一次临时密码',
    ];
    const answers = ['', '', password, password];
    let index = 0,
      pending = '',
      text = '';
    child.stdout.on('data', (chunk) => {
      const value = chunk.toString();
      pending += value;
      text += value;
      if (index < prompts.length && pending.includes(prompts[index])) {
        child.stdin.write(answers[index] + '\n');
        index++;
        pending = '';
      }
    });
    child.stderr.on('data', (chunk) => {
      text += chunk;
    });
    const timer = setTimeout(() => child.kill(), 15000);
    const code = await new Promise((resolve, reject) => {
      child.on('error', reject);
      child.on('exit', resolve);
    });
    clearTimeout(timer);
    check(
      code === 0 && text.includes('管理员已配置'),
      '交互式管理员工具成功执行',
    );
  }
  async function api(cookie, path, body) {
    const r = await fetch(base + path, {
      method: body ? 'POST' : 'GET',
      headers: {
        ...(cookie ? { Cookie: cookie } : {}),
        ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      redirect: 'manual',
    });
    return {
      status: r.status,
      body: await r.json().catch(() => ({})),
      headers: r.headers,
      cookie: r.headers.get('set-cookie')?.split(';')[0],
    };
  }
  await admin(initial);
  const login = await api(null, '/api/auth', {
    action: 'login',
    identifier: email,
    password: initial,
  });
  check(
    login.status === 200 && login.body.redirectTo === '/account/security',
    'CLI 创建的管理员首次登录进入实名改密',
  );
  check(
    login.headers.get('set-cookie').includes('; Secure') &&
      login.headers.get('set-cookie').includes('HttpOnly'),
    'HTTPS 配置生成 Secure / HttpOnly 会话',
  );
  check(
    (await api(login.cookie, '/api/workspace')).status === 423,
    '首次设置前业务接口锁定',
  );
  const completed = await api(login.cookie, '/api/auth', {
    action: 'complete_profile',
    name: '周明',
    confirmName: true,
    oldPassword: initial,
    password: updated,
  });
  check(
    completed.status === 200 && completed.body.redirectTo === '/workspaces',
    '初始管理员完成实名改密后可选三个工作台',
  );
  const live = await api(completed.cookie, '/api/workspace');
  check(
    live.status === 200 && live.headers.get('cache-control') === 'no-store',
    '真实生产服务读取运行时数据库且业务响应禁止缓存',
  );
  check(
    live.body.member.assignedDesks.length === 5 &&
      ['sales', 'management', 'finance', 'operations', 'aftersales'].every(
        (desk) => live.body.member.assignedDesks.includes(desk),
      ),
    '首位管理员获得五个岗位粒度授权（对应三个工作台）',
  );
  for (const [portal, label] of [
    ['sales', '销售工作台'],
    ['management', '管理工作台'],
    ['finance', '财务工作台'],
  ]) {
    const page = await fetch(base + '/work/' + portal, {
      headers: { Cookie: completed.cookie },
      redirect: 'manual',
    });
    check(
      page.status === 200 && (await page.text()).includes(label),
      `独立部署包含并可访问 ${portal} 工作台路由`,
    );
  }
  for (const [legacy, target] of [
    ['operations', 'management'],
    ['aftersales', 'management'],
  ]) {
    const page = await fetch(base + '/work/' + legacy, {
      headers: { Cookie: completed.cookie },
      redirect: 'manual',
    });
    const location = page.headers.get('location') || '';
    check(
      [301, 302, 303, 307, 308].includes(page.status) &&
        new URL(location, base).pathname === '/work/' + target,
      `旧 ${legacy} 工作台路由重定向到 ${target} 工作台`,
    );
  }
  check(
    (
      await fetch(base + '/work/not-a-workbench', {
        headers: { Cookie: completed.cookie },
        redirect: 'manual',
      })
    ).status === 404,
    '未知工作台路由返回 404',
  );
  const workspacesPage = await fetch(base + '/workspaces', {
    headers: { Cookie: completed.cookie },
    redirect: 'manual',
  });
  const workspacesHtml = await workspacesPage.text();
  check(
    workspacesPage.status === 200 &&
      ['/work/sales', '/work/management', '/work/finance'].every((href) =>
        workspacesHtml.includes('href="' + href + '"'),
      ) &&
      !workspacesHtml.includes('/work/operations'),
    '/workspaces 只展示三个工作台入口',
  );
  const project = {
    name: '备份恢复验收项目',
    location: '',
    type: '',
    source: '',
    owner: '周明',
    stage: '项目筛选',
    amount: 1,
    customer: '',
    designer: '',
    contractor: '',
    contact: '',
    phone: '',
    nextAction: '',
    nextDate: '',
    notes: '',
    opportunities: [],
  };
  check(
    (
      await api(completed.cookie, '/api/workspace', {
        action: 'create',
        data: project,
      })
    ).status === 200,
    '生产管理员可以创建项目',
  );
  const backup = run('scripts/selfhost-backup.mjs');
  check(backup.status === 0, '生产服务运行中可完成在线备份');
  const backupPath = join(
    cwd,
    'backups',
    readdirSync(join(cwd, 'backups')).find((n) => n.endsWith('.sqlite')),
  );
  check(
    (statSync(backupPath).mode & 0o777) === 0o600,
    '备份文件仅所属用户可读写',
  );
  const restored = join(cwd, 'restored.sqlite');
  copyFileSync(backupPath, restored);
  db = openSqlite(restored);
  check(
    db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok',
    '恢复副本完整性检查通过',
  );
  check(
    db.prepare('SELECT COUNT(*) AS n FROM projects').get().n === 1 &&
      db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 1,
    '备份恢复包含最新项目与管理员',
  );
  db.close();
  await admin(initial);
  check(
    (await api(completed.cookie, '/api/workspace')).status === 401,
    '管理员恢复工具撤销旧会话',
  );
  const recovered = await api(null, '/api/auth', {
    action: 'login',
    identifier: email,
    password: initial,
  });
  check(
    recovered.status === 200 &&
      recovered.body.redirectTo === '/account/security',
    '管理员恢复后强制再次改密',
  );
  db = openSqlite(database);
  check(
    db.prepare('SELECT COUNT(*) AS n FROM projects').get().n === 1,
    '管理员恢复不删除业务数据',
  );
  db.close();
  const html = await (await fetch(base)).text();
  const paths = [
    ...new Set(
      [
        ...html.matchAll(
          /(?:src|href)="([^\"]+\/_next\/static[^\"]+|\/_next\/static[^\"]+)"/g,
        ),
      ].map((m) => m[1]),
    ),
  ];
  check(
    paths.length > 0 &&
      (
        await Promise.all(
          paths.map(async (path) => (await fetch(new URL(path, base))).status),
        )
      ).every((s) => s === 200),
    '生产页面引用的脚本与样式均可加载',
  );
} finally {
  if (server && server.exitCode === null) {
    server.kill('SIGTERM');
    await new Promise((r) => server.once('exit', r));
  }
}
check(
  run('scripts/selfhost-healthcheck.mjs').status !== 0,
  '服务停止后健康探针失败',
);

console.log(
  JSON.stringify({ passed: passed.length, migrations, backupRestored: true }),
);
