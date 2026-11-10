// D1 three-workbench (三工作台) API + page integration suite.
// Self-bootstraps a disposable SQLite database, migrates it, seeds synthetic
// members (including legacy rows without a desks column) and starts the real
// production build. It never opens a company database and never leaves the
// /private/tmp sandbox.
//
// Run with the ad-hoc signed Node 24 binary (sharp/code-signing workaround):
//   RUN_LOCAL_TESTS=1 /private/tmp/node-d1 tests/d1-portals.mjs
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
mkdirSync('/private/tmp/gushi-d1-qa', { recursive: true });
const dir = mkdtempSync('/private/tmp/gushi-d1-qa/run-');
const database = join(dir, 'company.sqlite');
if (!database.startsWith('/private/tmp/gushi-d1-qa/'))
  throw Error('拒绝在隔离目录之外创建测试数据库');
const port = Number(process.env.QA_D1_PORT || 5280);
if (!Number.isInteger(port) || port < 1024 || port > 65000)
  throw Error('无效的测试端口');
const base = `http://127.0.0.1:${port}`,
  origin = base;
// Refuse a busy port before migrating or seeding anything.
try {
  await fetch(base, { signal: AbortSignal.timeout(500) });
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
const migration = spawnSync(process.execPath, ['scripts/selfhost-migrate.mjs'], {
  cwd: root,
  env,
  encoding: 'utf8',
});
if (migration.status) throw Error(migration.stderr || migration.stdout);

// ---------------------------------------------------------------- fixtures ---
// Granular desks remain the authorization unit. Three legacy rows intentionally
// have desks = NULL so the original role has to keep working unchanged.
const members = [
  ['owner', 'owner', null, null],
  ['legacy-manager', 'management', null, null],
  ['legacy-sales', 'sales', null, null],
  ['legacy-operation', 'operations', null, null],
  ['multi', 'sales', ['sales', 'management', 'finance', 'operations', 'aftersales'], 'sales'],
  ['ops', 'operations', ['operations'], 'operations'],
  ['after', 'aftersales', ['aftersales'], 'aftersales'],
  ['sales', 'sales', ['sales'], 'sales'],
  ['ops-after', 'operations', ['operations', 'aftersales'], 'operations'],
  ['manager-finance', 'management', ['management', 'finance'], 'management'],
  ['legacy-sales-operations', 'sales', ['sales', 'operations'], 'sales'],
];
const now = new Date().toISOString(),
  workspace = 'd1-portal-' + randomUUID(),
  qaPassword = 'D1PortalQA!' + randomUUID(),
  passwordHash = await hashPassword(qaPassword),
  rows = {},
  cookies = {};
const db = openSqlite(database);
for (const [key, role, desks, def] of members) {
  const id = workspace + '-' + key,
    email = id + '@example.invalid';
  rows[key] = { id, email };
  db.prepare(
    'INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?)',
  ).run(
    id,
    workspace,
    email,
    'D1-' + key,
    role,
    '全部分部',
    'active',
    now,
    now,
    now,
    desks ? JSON.stringify(desks) : null,
    def || null,
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
const projectId = 'd1-project-sales';
const project = {
  name: '销售专属项目',
  location: '广州',
  type: '工业厂房',
  source: '老客户',
  owner: 'D1-sales',
  ownerMemberId: rows.sales.id,
  stage: '商务谈判',
  amount: 10,
  customer: 'QA客户',
  designer: '',
  contractor: '',
  contact: '',
  phone: '',
  nextAction: '联系',
  nextDate: '2026-12-01',
  notes: '',
  opportunities: [],
  workflow: {
    region: '广州总部',
    assignments: {},
    assignmentMembers: {},
    tasks: [],
    checklist: {},
    facts: { 'payment-record': 'FINANCE-FACT-SECRET' },
    milestones: {},
  },
};
db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(
  projectId,
  workspace,
  JSON.stringify(project),
  1,
  now,
);
const book = {
  projectId,
  version: 0,
  updatedAt: now,
  contractNo: '',
  contractAmountCents: 0,
  paymentTerms: '',
  reviewStatus: '草稿',
  reviewNote: '',
  submittedBy: '',
  submittedAt: '',
  reviewedBy: '',
  reviewedAt: '',
  plans: [],
  receipts: [],
  invoices: [],
  financeMemo: 'FINANCE-MEMO-SECRET',
  suppliers: [
    {
      id: 'd1-supplier',
      supplier: 'SUPPLIER-COST-SECRET',
      batchId: 'd1-batch',
      batchName: '批次一',
      amountCents: 100,
      dueDate: '2026-12-01',
      terms: '款到发货',
      note: '',
      createdBy: rows['legacy-manager'].id,
      history: [],
      payments: [],
    },
  ],
};
db.prepare('INSERT INTO finance_books VALUES(?,?,?,?,?)').run(
  projectId,
  workspace,
  JSON.stringify(book),
  0,
  now,
);
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
    createdBy: rows['legacy-manager'].id,
    createdByName: 'D1-legacy-manager',
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
insertTask('d1-task-ops', 'operations', rows.ops.id, '运营独立任务');
insertTask('d1-task-after', 'aftersales', rows.after.id, '售后独立任务');
insertTask('d1-task-sales', 'sales', rows.sales.id, '销售任务');
// Directly seeded cross-desk assignment (the API would reject it) proves the
// receiving-desk boundary is enforced on read and on write, not just on create.
insertTask('d1-task-sales-for-ops', 'sales', rows.ops.id, '越过岗位派发的销售任务');
// Dual-scope account needs its own tasks on each granted desk: a task is only in
// scope for its assignee (same-desk non-assignees are excluded by canReadProject
// era inTaskScope rules).
insertTask('d1-task-dual-ops', 'operations', rows['ops-after'].id, '兼岗运营任务');
insertTask('d1-task-dual-after', 'aftersales', rows['ops-after'].id, '兼岗售后任务');
db.close();

const server = spawn(
  process.execPath,
  ['node_modules/next/dist/bin/next', 'start', '-p', String(port)],
  { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] },
);
let log = '';
server.stdout.on('data', (d) => (log += d));
server.stderr.on('data', (d) => (log += d));

// ------------------------------------------------------------------ helpers ---
let passed = 0;
function check(value, label) {
  if (!value) throw Error('FAIL ' + label);
  passed++;
  console.log('PASS ' + label);
}
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
    throw Error(
      'FAIL ' + path + ' 期望 200，实际 ' + r.status + ' ' + JSON.stringify(r.data),
    );
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
const isRedirect = (res) => [301, 302, 303, 307, 308].includes(res.status);
// Page-level denial: the UI may redirect to /workspaces or /, or render the
// login/denial entry page. In every case the portal content must not leak.
function deniedPage(res, forbidden) {
  let denied = false;
  if (isRedirect(res)) {
    const target = redirectPath(res);
    denied = target === '/' || target === '/workspaces';
  } else if (res.status === 403) denied = true;
  else if (res.status === 200) denied = res.text.includes('未获授权');
  if (!denied) return false;
  return !forbidden.some((marker) => res.text.includes(marker));
}
async function login(user) {
  const r = await fetch(base + '/api/auth', {
    method: 'POST',
    headers: { Origin: origin, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      action: 'login',
      identifier: rows[user].email,
      password: qaPassword,
    }),
  });
  return { status: r.status, data: await r.json().catch(() => ({})) };
}

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

  // ------------------------------------------------- 1. three workbenches ---
  // 1a. Authorized entries render; legacy granular paths redirect to a portal.
  const ownerSales = await page('owner', '/work/sales');
  check(
    ownerSales.status === 200 && ownerSales.text.includes('销售工作台'),
    '系统管理员可进入 /work/sales 销售工作台',
  );
  const ownerManagement = await page('owner', '/work/management');
  check(
    ownerManagement.status === 200 &&
      ownerManagement.text.includes('管理工作台'),
    '系统管理员可进入 /work/management 管理工作台',
  );
  const ownerFinance = await page('owner', '/work/finance');
  check(
    ownerFinance.status === 200 && ownerFinance.text.includes('财务工作台'),
    '系统管理员可进入 /work/finance 财务工作台',
  );
  const legacyOperationsPage = await page('owner', '/work/operations');
  check(
    isRedirect(legacyOperationsPage) &&
      redirectPath(legacyOperationsPage) === '/work/management',
    '旧 /work/operations 入口重定向到管理工作台',
  );
  const legacyAftersalesPage = await page('owner', '/work/aftersales');
  check(
    isRedirect(legacyAftersalesPage) &&
      redirectPath(legacyAftersalesPage) === '/work/management',
    '旧 /work/aftersales 入口重定向到管理工作台',
  );
  const legacyScopedPage = await page(
    'owner',
    '/work/operations?scope=aftersales',
  );
  check(
    isRedirect(legacyScopedPage) &&
      redirectPath(legacyScopedPage) === '/work/management' &&
      new URL(legacyScopedPage.location, base).searchParams.get('scope') ===
        'aftersales',
    '旧岗位入口重定向时保留 ?scope= 岗位范围',
  );
  const legacyRolePage = await page('owner', '/work/technical');
  check(
    isRedirect(legacyRolePage) &&
      redirectPath(legacyRolePage) === '/work/management',
    '旧岗位身份路径重定向到所属工作台',
  );
  check(
    (await page('owner', '/work/not-a-workbench')).status === 404,
    '未知工作台路径返回 404',
  );

  // 1b. API portal resolution is explicit and scoped.
  for (const [portal, label] of [
    ['sales', '销售'],
    ['management', '管理'],
    ['finance', '财务'],
  ]) {
    const data = await ok('owner', '/api/workspace', { portal });
    check(
      data.member.portal === portal,
      `系统管理员通过 x-workspace-portal: ${portal} 解析到${label}工作台`,
    );
  }
  const ownerManagementCtx = await ok('owner', '/api/workspace', {
    portal: 'management',
  });
  check(
    ownerManagementCtx.member.role === 'owner' &&
      ownerManagementCtx.member.scope === 'management',
    '系统管理员在管理工作台保持 owner 管理权限',
  );
  const ownerFinanceCtx = await ok('owner', '/api/workspace', {
    portal: 'finance',
  });
  check(
    ownerFinanceCtx.member.role === 'finance' &&
      ownerFinanceCtx.member.scope === 'finance',
    '系统管理员在财务工作台的岗位范围解析为财务',
  );
  const ownerSession = await ok('owner', '/api/session');
  check(
    Array.isArray(ownerSession.member.assignedDesks) &&
      ownerSession.member.assignedDesks.length === 5 &&
      ['sales', 'management', 'finance', 'operations', 'aftersales'].every(
        (d) => ownerSession.member.assignedDesks.includes(d),
      ),
    '系统管理员仍保存五个岗位粒度授权（对应三个工作台）',
  );

  // 1c. Login / entry destinations.
  check(
    (await login('owner')).data.redirectTo === '/workspaces',
    '系统管理员登录后进入三工作台选择页',
  );
  check(
    (await login('multi')).data.redirectTo === '/workspaces',
    '三工作台兼岗成员登录后进入选择页',
  );
  check(
    (await login('manager-finance')).data.redirectTo === '/workspaces',
    '管理+财务多工作台成员登录后进入选择页',
  );
  check(
    (await login('legacy-sales-operations')).data.redirectTo === '/workspaces',
    '旧销售+运营兼岗成员登录后进入选择页',
  );
  check(
    (await login('sales')).data.redirectTo === '/work/sales',
    '单销售工作台成员登录后直达 /work/sales',
  );
  check(
    (await login('ops')).data.redirectTo === '/work/management',
    '单运营岗位成员登录后直达 /work/management',
  );
  check(
    (await login('after')).data.redirectTo === '/work/management',
    '单售后岗位成员登录后直达 /work/management',
  );
  check(
    (await login('legacy-manager')).data.redirectTo === '/work/management',
    '旧管理账号（无 desks 列）登录后直达管理工作台',
  );
  check(
    (await login('legacy-sales')).data.redirectTo === '/work/sales',
    '旧销售账号（无 desks 列）登录后直达销售工作台',
  );
  check(
    (await login('legacy-operation')).data.redirectTo === '/work/management',
    '旧运营账号（无 desks 列）登录后直达管理工作台',
  );

  // -------------------------------------------------------- 2. /workspaces ---
  const multiWorkspaces = await page('multi', '/workspaces');
  const portalHrefs = (text) =>
    (text.match(/href="\/work\/(?:sales|management|finance)"/g) || []).length;
  check(
    multiWorkspaces.status === 200 && portalHrefs(multiWorkspaces.text) === 3,
    '/workspaces 为多工作台成员展示三个工作台入口',
  );
  check(
    !multiWorkspaces.text.includes('/work/operations') &&
      !multiWorkspaces.text.includes('/work/aftersales'),
    '/workspaces 不再暴露五个旧工作台入口',
  );
  const ownerWorkspaces = await page('owner', '/workspaces');
  check(
    ownerWorkspaces.status === 200 && portalHrefs(ownerWorkspaces.text) === 3,
    '系统管理员的 /workspaces 也只有三个工作台卡片',
  );
  const opsWorkspaces = await page('ops', '/workspaces');
  check(
    isRedirect(opsWorkspaces) &&
      redirectPath(opsWorkspaces) === '/work/management',
    '单工作台成员访问 /workspaces 重定向到其唯一工作台',
  );
  const managerFinanceWorkspaces = await page('manager-finance', '/workspaces');
  check(
    managerFinanceWorkspaces.status === 200 &&
      portalHrefs(managerFinanceWorkspaces.text) === 2 &&
      managerFinanceWorkspaces.text.includes('/work/management') &&
      managerFinanceWorkspaces.text.includes('/work/finance') &&
      !managerFinanceWorkspaces.text.includes('/work/sales'),
    '管理+财务成员只看到两个已授权工作台',
  );
  const legacySalesOpsWorkspaces = await page(
    'legacy-sales-operations',
    '/workspaces',
  );
  check(
    legacySalesOpsWorkspaces.status === 200 &&
      portalHrefs(legacySalesOpsWorkspaces.text) === 2 &&
      legacySalesOpsWorkspaces.text.includes('/work/sales') &&
      legacySalesOpsWorkspaces.text.includes('/work/management'),
    '旧 sales+operations 兼岗仍得到销售+管理两个工作台',
  );

  // --------------------------------- 3. legacy desks column compatibility ---
  const legacyManagerSession = await ok('legacy-manager', '/api/session');
  check(
    legacyManagerSession.member.assignedDesks.length === 1 &&
      legacyManagerSession.member.assignedDesks[0] === 'management',
    '无 desks 列的旧管理账号按原角色推导管理岗位授权',
  );
  const legacyOperationCtx = await ok('legacy-operation', '/api/workspace', {
    portal: 'management',
  });
  check(
    legacyOperationCtx.member.role === 'operations' &&
      legacyOperationCtx.member.scope === 'operations',
    '无 desks 列的旧运营账号在管理工作台保持运营岗位范围',
  );
  check(
    (await api('legacy-operation', '/api/workspace', { portal: 'finance' }))
      .status === 403,
    '旧运营账号不能进入财务工作台',
  );
  const legacySalesOpsManagement = await ok(
    'legacy-sales-operations',
    '/api/workspace',
    { portal: 'management' },
  );
  check(
    legacySalesOpsManagement.member.role === 'operations' &&
      legacySalesOpsManagement.member.scope === 'operations' &&
      Array.isArray(legacySalesOpsManagement.member.scopes) &&
      legacySalesOpsManagement.member.scopes.includes('operations'),
    '旧 sales+operations 兼岗在管理工作台的默认岗位范围为运营',
  );
  const legacySalesOpsSales = await ok(
    'legacy-sales-operations',
    '/api/workspace',
    { portal: 'sales' },
  );
  check(
    legacySalesOpsSales.member.role === 'sales',
    '旧 sales+operations 兼岗保留销售工作台权限',
  );
  check(
    (await api('legacy-sales-operations', '/api/workspace', { portal: 'finance' }))
      .status === 403,
    '旧 sales+operations 兼岗不能进入未授权财务工作台',
  );

  // ---------------------------------------- 4. operations-only isolation ---
  const opsManagement = await ok('ops', '/api/workspace', {
    portal: 'management',
  });
  check(
    opsManagement.member.role === 'operations' &&
      opsManagement.member.portal === 'management' &&
      opsManagement.member.scope === 'operations',
    '运营账号在管理工作台的有效岗位为运营',
  );
  check(
    Array.isArray(opsManagement.projects) && opsManagement.projects.length === 0,
    '运营账号管理工作台不返回任何项目',
  );
  check(
    Object.keys(opsManagement.finances || {}).length === 0,
    '运营账号管理工作台不返回任何财务账本',
  );
  check(
    (await api('ops', '/api/cashflow', { portal: 'management' })).status === 403,
    '运营账号不能读取公司现金流',
  );
  check(
    (await api('ops', '/api/team', { portal: 'management' })).status === 403,
    '运营账号不能访问人员管理接口',
  );
  check(
    (
      await api('ops', '/api/cashflow', {
        portal: 'management',
        body: {
          action: 'settle',
          requestId: randomUUID(),
          reference: 'D1-' + randomUUID(),
          date: '2026-11-01',
          direction: 'in',
          amountCents: 100,
          allocations: [],
        },
      })
    ).status === 403,
    '运营账号不能执行财务收付款写入',
  );
  const opsFinanceMutation = await api('ops', '/api/finance', {
    portal: 'management',
    body: {
      action: 'submit_contract',
      projectId,
      version: 0,
      contractNo: 'D1-ATTACK',
      contractAmountCents: 100,
      paymentTerms: '款到发货',
    },
  });
  check(
    [403, 404].includes(opsFinanceMutation.status),
    '运营账号不能通过财务接口修改项目票款',
  );
  check(
    (await api('ops', '/api/workspace', { portal: 'finance' })).status === 403,
    '运营账号伪造 x-workspace-portal: finance 被拒绝',
  );
  check(
    (
      await api('ops', '/api/workspace', {
        portal: 'management',
        scope: 'management',
      })
    ).status === 403,
    '运营账号伪造 x-workspace-scope: management 被拒绝',
  );
  check(
    (
      await api('ops', '/api/workspace', {
        portal: 'management',
        scope: 'finance',
      })
    ).status === 403,
    '运营账号伪造 x-workspace-scope: finance 被拒绝',
  );
  check(
    (await api('ops', '/api/workspace', { desk: 'finance' })).status === 403,
    '运营账号伪造旧请求头 x-workspace-desk: finance 被拒绝',
  );
  check(
    (await api('ops', '/api/workspace', { desk: 'management' })).status === 403,
    '旧请求头 x-workspace-desk: management 被拒绝（运营未获管理岗位范围）',
  );
  check(
    (await api('ops', '/api/workspace', { portal: 'bogus-portal' })).status ===
      403,
    '非法 x-workspace-portal 值返回 403',
  );
  check(
    (await api('ops', '/api/workspace', { desk: 'bogus-desk' })).status === 403,
    '非法 x-workspace-desk 值返回 403',
  );
  const opsTasks = await ok('ops', '/api/tasks', { portal: 'management' });
  check(
    opsTasks.tasks.some((t) => t.id === 'd1-task-ops'),
    '运营账号可读取本岗位独立任务',
  );
  check(
    !opsTasks.tasks.some((t) => t.id === 'd1-task-sales') &&
      !opsTasks.tasks.some((t) => t.id === 'd1-task-sales-for-ops'),
    '运营账号不返回销售台任务',
  );
  check(
    !opsTasks.tasks.some((t) => t.id === 'd1-task-after'),
    '运营账号不返回售后台任务',
  );
  const opsFeedback = await api('ops', '/api/tasks', {
    portal: 'management',
    body: {
      action: 'feedback',
      id: 'd1-task-ops',
      version: 1,
      status: '处理中',
      result: '厂家参数已核对',
    },
  });
  check(
    opsFeedback.status === 200 && opsFeedback.data.task.status === '处理中',
    '运营账号可反馈本人独立任务',
  );
  check(
    (
      await api('ops', '/api/tasks', {
        portal: 'management',
        body: {
          action: 'feedback',
          id: 'd1-task-sales-for-ops',
          version: 1,
          status: '处理中',
          result: '越权处理销售任务',
        },
      })
    ).status === 404,
    '运营账号不能处理销售台任务',
  );
  const opsPage = await page('ops', '/work/management');
  check(opsPage.status === 200, '运营账号可进入管理工作台页面');
  check(
    !opsPage.text.includes('人员管理'),
    '运营账号管理工作台页面不渲染人员管理入口',
  );
  check(
    deniedPage(await page('ops', '/work/finance'), ['财务总览', '工资和固定费用']),
    '运营账号不能进入财务工作台页面',
  );
  check(
    deniedPage(await page('ops', '/work/sales'), ['销售考核', '我的项目结果']),
    '运营账号不能进入销售工作台页面',
  );

  // ----------------------------------------- 5. aftersales-only isolation ---
  const afterManagement = await ok('after', '/api/workspace', {
    portal: 'management',
  });
  check(
    afterManagement.member.role === 'aftersales' &&
      afterManagement.member.scope === 'aftersales',
    '售后账号在管理工作台的有效岗位为售后',
  );
  check(
    afterManagement.projects.length === 0,
    '售后账号管理工作台不返回任何项目',
  );
  check(
    Object.keys(afterManagement.finances || {}).length === 0,
    '售后账号管理工作台不返回任何财务账本',
  );
  check(
    (await api('after', '/api/cashflow', { portal: 'management' })).status ===
      403,
    '售后账号不能读取公司现金流',
  );
  check(
    (await api('after', '/api/team', { portal: 'management' })).status === 403,
    '售后账号不能访问人员管理接口',
  );
  check(
    (await api('after', '/api/workspace', { portal: 'finance' })).status === 403,
    '售后账号伪造 x-workspace-portal: finance 被拒绝',
  );
  check(
    (
      await api('after', '/api/workspace', {
        portal: 'management',
        scope: 'management',
      })
    ).status === 403,
    '售后账号伪造 x-workspace-scope: management 被拒绝',
  );
  const afterTasks = await ok('after', '/api/tasks', { portal: 'management' });
  check(
    afterTasks.tasks.some((t) => t.id === 'd1-task-after') &&
      !afterTasks.tasks.some((t) => t.id === 'd1-task-ops') &&
      !afterTasks.tasks.some((t) => t.id === 'd1-task-sales'),
    '售后账号只读取本岗位独立任务',
  );
  const afterFeedback = await api('after', '/api/tasks', {
    portal: 'management',
    body: {
      action: 'feedback',
      id: 'd1-task-after',
      version: 1,
      status: '待验收',
      result: '客户回访完成',
    },
  });
  check(
    afterFeedback.status === 200 && afterFeedback.data.task.status === '待验收',
    '售后账号可反馈本人独立任务',
  );
  check(
    (await page('after', '/work/management')).status === 200,
    '售后账号可进入管理工作台页面',
  );
  check(
    deniedPage(await page('after', '/work/finance'), [
      '财务总览',
      '工资和固定费用',
    ]),
    '售后账号不能进入财务工作台页面',
  );

  // ------------------------------------------------ 6. sales workbench ---
  const salesWorkspace = await ok('sales', '/api/workspace');
  check(
    salesWorkspace.member.role === 'sales' &&
      salesWorkspace.member.portal === 'sales',
    '销售账号默认解析到销售工作台',
  );
  check(
    salesWorkspace.projects.length === 1 &&
      salesWorkspace.projects[0].id === projectId,
    '销售账号只读取本人项目',
  );
  const salesJson = JSON.stringify(salesWorkspace);
  check(
    !salesJson.includes('FINANCE-FACT-SECRET') &&
      !salesJson.includes('FINANCE-MEMO-SECRET') &&
      !salesJson.includes('SUPPLIER-COST-SECRET'),
    '销售工作台不泄露财务事实、财务备注和采购成本',
  );
  check(
    (await api('sales', '/api/cashflow')).status === 403,
    '销售账号不能读取公司现金流',
  );
  check(
    (await api('sales', '/api/team')).status === 403,
    '销售账号不能访问人员管理接口',
  );
  check(
    (await api('sales', '/api/workspace', { portal: 'management' })).status ===
      403,
    '销售账号不能进入未授权管理工作台',
  );
  check(
    (await api('sales', '/api/workspace', { desk: 'management' })).status ===
      403,
    '销售账号伪造旧请求头进入管理工作台被拒绝',
  );
  check(
    deniedPage(await page('sales', '/work/management'), ['人员管理', '经营总览']),
    '销售账号不能进入管理工作台页面',
  );
  check(
    (await page('sales', '/work/sales')).status === 200,
    '销售账号可进入销售工作台页面',
  );

  // ------------------------------- 7. management + finance dual workbench ---
  const mgrFinManagement = await ok('manager-finance', '/api/workspace', {
    portal: 'management',
  });
  check(
    mgrFinManagement.member.role === 'management' &&
      mgrFinManagement.member.scope === 'management',
    '管理+财务兼岗在管理工作台的岗位范围为管理',
  );
  check(
    mgrFinManagement.projects.length === 1,
    '管理工作台可读取公司项目',
  );
  const mgrFinFinance = await ok('manager-finance', '/api/workspace', {
    portal: 'finance',
  });
  check(
    mgrFinFinance.member.role === 'finance' &&
      mgrFinFinance.member.scope === 'finance',
    '管理+财务兼岗在财务工作台的岗位范围为财务',
  );
  // A sales contract enters the review queue first.
  const submitted = await api('sales', '/api/finance', {
    body: {
      action: 'submit_contract',
      projectId,
      version: 0,
      contractNo: 'D1-CONTRACT-1',
      contractAmountCents: 100000,
      paymentTerms: '款到发货',
    },
  });
  check(
    submitted.status === 200 && submitted.data.book.reviewStatus === '待审核',
    '销售工作台可提交合同进入财务审核队列',
  );
  const bookVersion = submitted.data.book.version;
  const managementReview = await api('manager-finance', '/api/finance', {
    portal: 'management',
    body: {
      action: 'review_contract',
      projectId,
      version: bookVersion,
      decision: 'approved',
      note: '',
      plans: [
        {
          id: randomUUID(),
          label: '货款',
          amountCents: 100000,
          dueDate: '2026-12-01',
        },
      ],
    },
  });
  check(
    managementReview.status === 403,
    '管理工作台对财务写操作保持只读（合同审核 403）',
  );
  const managementReceipt = await api('manager-finance', '/api/finance', {
    portal: 'management',
    body: {
      action: 'record_receipt',
      projectId,
      version: bookVersion,
      planId: 'none',
      amountCents: 1,
      date: '2026-11-01',
      reference: 'D1',
      note: '',
    },
  });
  check(
    managementReceipt.status === 403,
    '管理工作台不能确认实际收付款',
  );
  const financeReview = await api('manager-finance', '/api/finance', {
    portal: 'finance',
    body: {
      action: 'review_contract',
      projectId,
      version: bookVersion,
      decision: 'approved',
      note: '',
      plans: [
        {
          id: randomUUID(),
          label: '货款',
          amountCents: 100000,
          dueDate: '2026-12-01',
        },
      ],
    },
  });
  check(
    financeReview.status === 200 &&
      financeReview.data.book.reviewStatus === '已审核',
    '财务工作台可执行 canFinance 合同审核',
  );
  check(
    (await page('manager-finance', '/work/management')).status === 200 &&
      (await page('manager-finance', '/work/finance')).status === 200,
    '管理+财务兼岗可进入两个已授权工作台页面',
  );

  // ------------------------------------- 8. granular scope switching/validation ---
  const opsAfterSession = await ok('ops-after', '/api/session');
  check(
    opsAfterSession.member.portal === 'management' &&
      opsAfterSession.member.scope === 'operations',
    '运营+售后兼岗默认解析到管理工作台运营岗位',
  );
  const opsAfterDefault = await ok('ops-after', '/api/workspace', {
    portal: 'management',
  });
  check(
    opsAfterDefault.member.scope === 'operations' &&
      Array.isArray(opsAfterDefault.member.scopes) &&
      opsAfterDefault.member.scopes.includes('operations') &&
      opsAfterDefault.member.scopes.includes('aftersales'),
    '运营+售后兼岗在管理工作台拥有两个岗位范围',
  );
  const opsAfterScope = await ok('ops-after', '/api/workspace', {
    portal: 'management',
    scope: 'aftersales',
  });
  check(
    opsAfterScope.member.scope === 'aftersales' &&
      opsAfterScope.member.role === 'aftersales',
    '管理工作台可通过 x-workspace-scope 切换到售后岗位',
  );
  check(
    (
      await api('ops-after', '/api/workspace', {
        portal: 'management',
        scope: 'management',
      })
    ).status === 403,
    '运营+售后兼岗不能通过 x-workspace-scope 提升为管理岗位',
  );
  check(
    (
      await api('ops-after', '/api/workspace', {
        portal: 'management',
        scope: 'bogus-scope',
      })
    ).status === 403,
    '非法 x-workspace-scope 值返回 403',
  );
  const opsAfterLegacy = await ok('ops-after', '/api/workspace', {
    desk: 'aftersales',
  });
  check(
    opsAfterLegacy.member.portal === 'management' &&
      opsAfterLegacy.member.scope === 'aftersales',
    '旧请求头 x-workspace-desk: aftersales 映射到管理工作台售后岗位',
  );
  const scopeTasksOps = await ok('ops-after', '/api/tasks', {
    portal: 'management',
    scope: 'operations',
  });
  check(
    scopeTasksOps.tasks.some((t) => t.id === 'd1-task-dual-ops') &&
      !scopeTasksOps.tasks.some((t) => t.id === 'd1-task-dual-after'),
    '管理工作台运营岗位范围只读取运营任务',
  );
  const scopeTasksAfter = await ok('ops-after', '/api/tasks', {
    portal: 'management',
    scope: 'aftersales',
  });
  check(
    scopeTasksAfter.tasks.some((t) => t.id === 'd1-task-dual-after') &&
      !scopeTasksAfter.tasks.some((t) => t.id === 'd1-task-dual-ops'),
    '管理工作台售后岗位范围只读取售后任务',
  );
  check(
    (
      await page('ops-after', '/work/management?scope=aftersales')
    ).status === 200,
    '管理工作台支持 ?scope=aftersales 岗位切换页面',
  );

  // ------------------------------- 9. members.desks schema stays granular ---
  const created = await api('owner', '/api/team', {
    portal: 'management',
    body: {
      email: 'd1-new-' + randomUUID() + '@example.invalid',
      name: '新兼岗成员',
      assignedDesks: ['operations', 'aftersales'],
      defaultDesk: 'aftersales',
      region: '全部分部',
      status: 'active',
      password: 'D1NewMember!' + randomUUID(),
    },
  });
  const newMember = created.data.members?.find(
    (m) => m.name === '新兼岗成员',
  );
  check(
    created.status === 200 &&
      newMember &&
      newMember.assignedDesks.length === 2 &&
      newMember.assignedDesks.includes('operations') &&
      newMember.assignedDesks.includes('aftersales') &&
      newMember.defaultDesk === 'aftersales',
    '/api/team 仍以五个岗位粒度保存运营+售后授权',
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
