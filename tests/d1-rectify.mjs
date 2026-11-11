// D1-RECTIFY isolated compatibility + migration suite.
//
// Covers the acceptance items that are not about a single workbench screen:
// 1. repeated migration of a legacy database is idempotent and rewrites no
//    account role / desks / default_desk (no silent privilege change),
// 2. legacy five-desk accounts keep their original task and message access,
// 3. retired operations/aftersales workbench links and scope headers are safely
//    handled without expanding authority.
//
// Self-bootstraps a disposable SQLite database under /private/tmp and never
// opens a company database. Run with the ad-hoc signed Node 24 binary:
//   RUN_LOCAL_TESTS=1 /private/tmp/node-d1 tests/d1-rectify.mjs
import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { spawn, spawnSync } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomBytes, createHash, randomUUID } from 'node:crypto';
import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';

if (process.env.RUN_LOCAL_TESTS !== '1')
  throw Error('请设置 RUN_LOCAL_TESTS=1，仅使用自动创建的隔离数据库');
const root = fileURLToPath(new URL('..', import.meta.url));
mkdirSync('/private/tmp/gushi-d1-rectify', { recursive: true });
const dir = mkdtempSync('/private/tmp/gushi-d1-rectify/run-');
const database = join(dir, 'company.sqlite');
if (!database.startsWith('/private/tmp/gushi-d1-rectify/'))
  throw Error('拒绝在隔离目录之外创建测试数据库');
const port = Number(process.env.QA_RECTIFY_PORT || 5540);
if (!Number.isInteger(port) || port < 1024 || port > 65000)
  throw Error('无效的测试端口');
const base = `http://127.0.0.1:${port}`,
  origin = base;
try {
  await fetch(base, { signal: AbortSignal.timeout(400) });
  throw Error('测试端口已占用：' + port);
} catch (e) {
  if (String(e.message).startsWith('测试端口')) throw e;
}
const env = {
  ...process.env,
  DATABASE_PATH: database,
  APP_ORIGIN: base,
  APP_BUILD_DIR: '.next-production',
  NODE_ENV: 'production',
};
const migrate = () =>
  spawnSync(process.execPath, ['scripts/selfhost-migrate.mjs'], {
    cwd: root,
    env,
    encoding: 'utf8',
  });
const first = migrate();
if (first.status) throw Error(first.stderr || first.stdout);

// ------------------------------------------------------- legacy fixtures ---
const workspace = 'rectify-' + randomUUID(),
  now = new Date().toISOString(),
  qaPassword = 'RectifyQA!' + randomUUID(),
  passwordHash = await hashPassword(qaPassword),
  rows = {},
  cookies = {};
const fixtures = [
  // key, role, desks (null = legacy pre-desks row), raw default_desk
  ['owner', 'owner', null, null],
  ['operations', 'operations', null, 'operations'],
  ['aftersales', 'aftersales', null, 'aftersales'],
  ['multi', 'sales', ['sales', 'management', 'finance', 'operations', 'aftersales'], 'sales'],
  ['sales', 'sales', null, null],
];
const db = openSqlite(database);
for (const [key, role, desks, def] of fixtures) {
  const id = workspace + '-' + key;
  rows[key] = { id, email: id + '@example.invalid' };
  db.prepare(
    'INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?)',
  ).run(
    id,
    workspace,
    rows[key].email,
    'Rectify-' + key,
    role,
    '全部分部',
    'active',
    now,
    now,
    now,
    desks ? JSON.stringify(desks) : null,
    def,
  );
  db.prepare(
    'INSERT INTO credentials(member_id,password_hash,must_change,version,updated_at) VALUES(?,?,0,1,?)',
  ).run(id, passwordHash, now);
  const token = randomBytes(32).toString('hex');
  cookies[key] = 'gushi_session=' + token;
  db.prepare(
    'INSERT INTO auth_sessions(token_hash,member_id,credential_version,expires_at,created_at) VALUES(?,?,1,?,?)',
  ).run(
    createHash('sha256').update(token).digest('hex'),
    id,
    '2099-01-01T00:00:00.000Z',
    now,
  );
}
function insertTask(id, desk, assigneeId, title) {
  const data = {
    id,
    version: 1,
    desk,
    region: '广州总部',
    title,
    request: title + '的处理要求',
    dueDate: '2026-12-01',
    projectId: '',
    projectName: '',
    assigneeId,
    assigneeName: '',
    status: '待处理',
    result: '',
    images: [],
    reviewNote: '',
    createdBy: rows.owner.id,
    createdByName: 'Rectify-owner',
    createdAt: now,
    updatedAt: now,
    history: [],
  };
  db.prepare('INSERT INTO desk_tasks VALUES(?,?,?,?,?,?,?,?)').run(
    id,
    workspace,
    desk,
    '广州总部',
    null,
    JSON.stringify(data),
    1,
    now,
  );
}
insertTask('rectify-task-operations', 'operations', rows.operations.id, '历史运营任务');
insertTask('rectify-task-aftersales', 'aftersales', rows.aftersales.id, '历史售后任务');
insertTask('rectify-task-multi-operations', 'operations', rows.multi.id, '兼岗运营历史任务');
insertTask('rectify-task-multi-aftersales', 'aftersales', rows.multi.id, '兼岗售后历史任务');
function insertThread(id, a, b, body, actorKey = 'owner') {
  db.prepare(
    'INSERT INTO message_threads(id,workspace_id,endpoint_a,endpoint_b,created_at) VALUES(?,?,?,?,?)',
  ).run(id, workspace, a, b, now);
  db.prepare(
    'INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,body,project_id,created_at) VALUES(?,?,?,?,?,?,?,?,?)',
  ).run(
    randomUUID(),
    id,
    workspace,
    rows[actorKey].id,
    '历史成员',
    a,
    body,
    '',
    now,
  );
}
// Historical shared-desk conversation and a genuinely private conversation.
insertThread('rectify-desk-ops-after', 'desk:operations', 'desk:aftersales', '历史运营售后协作消息', 'operations');
insertThread('rectify-private-owner-ops', 'person:' + rows.owner.id, 'person:' + rows.operations.id, '私人消息-仅双方可见', 'owner');
// Split legacy defaults/desks snapshot exactly as stored before any migration.
const snapshot = () =>
  JSON.stringify(
    db
      .prepare(
        'SELECT id,role,desks,default_desk,profile_completed_at,version,status,region FROM members ORDER BY id',
      )
      .all(),
  );
const beforeMigration = snapshot();
db.close();

// Two extra migration runs must not rewrite legacy accounts or duplicate data.
for (let i = 0; i < 2; i++) {
  const rerun = migrate();
  if (rerun.status)
    throw Error('重复迁移失败：' + (rerun.stderr || rerun.stdout));
}
const migrated = openSqlite(database);
const afterMigration = JSON.stringify(
  migrated
    .prepare(
      'SELECT id,role,desks,default_desk,profile_completed_at,version,status,region FROM members ORDER BY id',
    )
    .all(),
);
const counts = {
  members: migrated.prepare('SELECT count(*) n FROM members').get().n,
  tasks: migrated.prepare('SELECT count(*) n FROM desk_tasks').get().n,
  threads: migrated.prepare('SELECT count(*) n FROM message_threads').get().n,
  items: migrated.prepare('SELECT count(*) n FROM message_items').get().n,
};
migrated.close();
let passed = 0;
function check(value, label) {
  if (!value) throw Error('FAIL ' + label);
  passed++;
  console.log('PASS ' + label);
}
check(
  beforeMigration === afterMigration,
  '重复执行迁移不重写旧成员角色/desks/default_desk，不提权',
);
check(
  counts.members === fixtures.length &&
    counts.tasks === 4 &&
    counts.threads === 2 &&
    counts.items === 2,
  '重复迁移不重复插入历史任务与消息',
);

// ------------------------------------------------------------- HTTP suite ---
const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));
async function api(user, path, options = {}) {
  const { body, portal, scope, desk } = options;
  const headers = { ...(user ? { Cookie: cookies[user] } : {}) };
  if (portal !== undefined) headers['x-workspace-portal'] = portal;
  if (scope !== undefined) headers['x-workspace-scope'] = scope;
  if (desk !== undefined) headers['x-workspace-desk'] = desk;
  if (body) {
    headers.Origin = origin;
    headers['Content-Type'] = 'application/json';
  }
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers,
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  let data;
  try {
    data = await r.json();
  } catch {
    data = {};
  }
  return { status: r.status, data };
}
async function ok(user, path, options) {
  const r = await api(user, path, options);
  if (r.status !== 200)
    throw Error('FAIL ' + path + ' 期望 200，实际 ' + r.status + ' ' + JSON.stringify(r.data));
  return r.data;
}
async function page(user, path) {
  const r = await fetch(base + path, {
    headers: user ? { Cookie: cookies[user] } : {},
    redirect: 'manual',
  });
  const location = r.headers.get('location') || '';
  const text = r.status >= 300 && r.status < 400 ? '' : await r.text();
  return { status: r.status, location, text };
}
const redirectPath = (res) => {
  try {
    return new URL(res.location, base).pathname;
  } catch {
    return '';
  }
};
try {
  let ready = false;
  for (let i = 0; i < 150; i++) {
    if (server.exitCode !== null) break;
    try {
      await fetch(base, { signal: AbortSignal.timeout(1000) });
      ready = true;
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 100));
    }
  }
  if (!ready) throw Error('服务器启动失败：' + (log || 'no log'));

  // 1. Legacy accounts keep their real identity and gain no manager authority.
  const opsSession = await ok('operations', '/api/session', {
    portal: 'management',
  });
  check(
    opsSession.member.role === 'operations' &&
      opsSession.member.accountRole === 'operations' &&
      !('scope' in opsSession.member),
    '旧运营账号保持真实运营身份且不存在内部 scope 字段',
  );
  const opsWorkspace = await ok('operations', '/api/workspace', {
    portal: 'management',
  });
  check(
    opsWorkspace.member.role === 'operations' &&
      opsWorkspace.member.portal === 'management' &&
      opsWorkspace.member.capability === 'operations',
    '旧运营账号进入管理工作台只获得运营协作能力',
  );
  check(
    opsWorkspace.projects.length === 0 &&
      Object.keys(opsWorkspace.finances || {}).length === 0,
    '旧运营账号不因映射获得公司项目或财务账本',
  );
  check(
    (await api('operations', '/api/team', { portal: 'management' })).status ===
      403,
    '旧运营账号不能管理人员，也不因管理工作台映射成为管理员',
  );
  check(
    (await api('operations', '/api/cashflow', { portal: 'management' }))
      .status === 403,
    '旧运营账号不能读取公司现金流',
  );

  // 2. Historical task and message access stays equivalent.
  const opsTasks = await ok('operations', '/api/tasks', { portal: 'management' });
  check(
    opsTasks.tasks.some((t) => t.id === 'rectify-task-operations') &&
      !opsTasks.tasks.some((t) => t.id === 'rectify-task-aftersales'),
    '旧运营账号只保留本人运营历史任务范围',
  );
  const afterTasks = await ok('aftersales', '/api/tasks', {
    portal: 'management',
  });
  check(
    afterTasks.tasks.some((t) => t.id === 'rectify-task-aftersales') &&
      !afterTasks.tasks.some((t) => t.id === 'rectify-task-operations'),
    '旧售后账号只保留本人售后历史任务范围',
  );
  const multiTasks = await ok('multi', '/api/tasks', { portal: 'management' });
  check(
    multiTasks.tasks.some((t) => t.id === 'rectify-task-multi-operations') &&
      multiTasks.tasks.some((t) => t.id === 'rectify-task-multi-aftersales'),
    '兼岗账号无需 scope 切换即可读取两类历史任务',
  );
  const opsMessages = await ok('operations', '/api/messages', {
    portal: 'management',
  });
  check(
    opsMessages.threads.some((t) => t.id === 'rectify-desk-ops-after') &&
      opsMessages.threads.some((t) => t.id === 'rectify-private-owner-ops'),
    '旧运营账号保留历史运营台协作消息和本人私聊',
  );
  const afterMessages = await ok('aftersales', '/api/messages', {
    portal: 'management',
  });
  check(
    afterMessages.threads.some((t) => t.id === 'rectify-desk-ops-after') &&
      !afterMessages.threads.some((t) => t.id === 'rectify-private-owner-ops'),
    '旧售后账号可读历史台间协作，但看不到他人私聊',
  );
  const multiMessages = await ok('multi', '/api/messages', {
    portal: 'management',
  });
  check(
    multiMessages.threads.some((t) => t.id === 'rectify-desk-ops-after'),
    '兼岗账号保留历史台间消息访问',
  );
  const salesMessages = await ok('sales', '/api/messages');
  check(
    !salesMessages.threads.some((t) => t.id === 'rectify-desk-ops-after') &&
      !salesMessages.threads.some((t) => t.id === 'rectify-private-owner-ops'),
    '纯销售账号不因迁移看到运营/售后历史会话',
  );

  // 3. Retired entrances/headers: safe redirect, explicit rejection, no rise.
  const opsLegacyPage = await page('operations', '/work/operations');
  check(
    [301, 302, 303, 307, 308].includes(opsLegacyPage.status) &&
      redirectPath(opsLegacyPage) === '/work/management',
    '旧 /work/operations 链接安全跳转到管理工作台',
  );
  const afterLegacyPage = await page('aftersales', '/work/aftersales?scope=aftersales');
  check(
    [301, 302, 303, 307, 308].includes(afterLegacyPage.status) &&
      redirectPath(afterLegacyPage) === '/work/management' &&
      !new URL(afterLegacyPage.location, base).searchParams.has('scope'),
    '旧售后工作台与 scope 链接跳转三台且不保留内部范围',
  );
  check(
    (await api('operations', '/api/workspace', { scope: 'management' }))
      .status === 403,
    '已取消的 x-workspace-scope 请求被明确拒绝',
  );
  const oldDeskHeader = await ok('operations', '/api/workspace', {
    desk: 'management',
  });
  check(
    oldDeskHeader.member.role === 'operations' &&
      oldDeskHeader.member.portal === 'management',
    '旧 x-workspace-desk 仅映射工作台，不提升为管理岗位',
  );
  check(
    (await api('operations', '/api/team', { desk: 'management' })).status ===
      403,
    '旧请求头映射后仍不能访问人员管理',
  );
  check(
    (await api('operations', '/api/workspace', { desk: 'finance' })).status ===
      403,
    '旧请求头 finance 对未授权运营账号被拒绝',
  );
  const cleanPage = await page('operations', '/work/management');
  check(
    cleanPage.status === 200 &&
      !cleanPage.text.includes('切换岗位范围') &&
      !cleanPage.text.includes('/work/operations'),
    '管理工作台页面没有岗位范围切换器或旧工作台入口',
  );

  // 4. Three workbench entries only; operations/aftersales are not entrances.
  const workspaces = await page('multi', '/workspaces');
  const hrefs = (workspaces.text.match(/href="\/work\/(?:sales|management|finance)"/g) || []);
  check(
    workspaces.status === 200 &&
      ['sales', 'management', 'finance'].every((p) =>
        hrefs.some((href) => href.includes('/work/' + p)),
      ) &&
      !workspaces.text.includes('/work/operations') &&
      !workspaces.text.includes('/work/aftersales'),
    '/workspaces 仅展示销售/管理/财务三个入口',
  );

  console.log(JSON.stringify({ passed, database, port }));
} catch (error) {
  writeFileSync(join(dir, 'server.log'), log);
  console.error(error.message);
  console.error('server log: ' + join(dir, 'server.log'));
  process.exitCode = 1;
} finally {
  if (server.exitCode === null) {
    const stopped = new Promise((r) => server.once('exit', r));
    server.kill('SIGTERM');
    await stopped;
  }
  writeFileSync(join(dir, 'server.log'), log);
}
