import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';

const database = resolve(process.env.DATABASE_PATH || '.');
const base = process.env.QA_URL || 'http://127.0.0.1:5188';
if (
  process.env.RUN_LOCAL_TESTS !== '1' ||
  !database.startsWith('/private/tmp/gushi-access-qa/') ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error('仅允许隔离的本机业务测试数据库');
const passed = [],
  failed = [];
function check(value, label) {
  (value ? passed : failed).push(label);
  console.log((value ? 'PASS ' : 'FAIL ') + label);
}
const db = openSqlite(database),
  now = new Date().toISOString(),
  day = now.slice(0, 10);
const workspace = 'business-' + randomUUID(),
  password = 'BusinessQA!' + randomUUID(),
  hash = await hashPassword(password),
  users = {};
for (const [name, role, region, desks] of [
  ['owner', 'owner', '全部分部'],
  ['manager', 'management', '全部分部'],
  ['sales', 'sales', '广州总部'],
  ['sales2', 'sales', '广州总部'],
  ['finance', 'finance', '全部分部', ['finance', 'operations']],
  ['ops', 'operations', '广州总部'],
  ['ops2', 'operations', '广州总部'],
  ['after', 'aftersales', '广州总部'],
  ['branch', 'management', '湖南分部'],
  ['outside', 'sales', '广州总部'],
]) {
  const id = workspace + '-' + name,
    email = id + '@example.invalid';
  db.prepare(
    "INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,'active',1,?,?,?,?,?)",
  ).run(
    id,
    name === 'outside' ? workspace + '-other' : workspace,
    email,
    name,
    role,
    region,
    now,
    now,
    now,
    desks ? JSON.stringify(desks) : null,
    desks?.[0] || null,
  );
  db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id, hash, now);
  users[name] = { id, email };
}
// Login rate limits are scoped to these synthetic identifiers; never touch real accounts.
db.close();
async function request(user, path = '/api/workspace', body, desk) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(user ? { Cookie: users[user].cookie } : {}),
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
      ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const data = await r.json().catch(() => ({}));
  return {
    status: r.status,
    body: data,
    cookie: r.headers.get('set-cookie')?.split(';')[0],
  };
}
async function ok(user, path, body, desk) {
  const r = await request(user, path, body, desk);
  if (r.status !== 200)
    throw Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function denied(user, path, body, status, label, desk) {
  const r = await request(user, path, body, desk);
  check(r.status === status, `${label} (${r.status})`);
}
for (const user of Object.values(users)) {
  const r = await request(null, '/api/auth', {
    action: 'login',
    identifier: user.email,
    password,
  });
  if (r.status !== 200) throw Error('Fixture login: ' + JSON.stringify(r));
  user.cookie = r.cookie;
}
const config = {
  company: '验收测试公司',
  owners: ['销售验收'],
  staleDays: 7,
  products: [
    {
      id: 'product-qa',
      brand: '测试品牌',
      category: '设备',
      area: '广州',
      name: '验收产品',
    },
  ],
};
await ok('owner', '/api/workspace', { action: 'config', data: config });
check(
  JSON.stringify((await ok('sales', '/api/workspace')).config) ===
    JSON.stringify(config),
  '公司配置和产品目录持久化并同步',
);
await denied(
  'manager',
  '/api/workspace',
  { action: 'config', data: config },
  403,
  '普通管理不能修改系统配置',
);
await denied(
  'owner',
  '/api/workspace',
  { action: 'config', data: { ...config, staleDays: 0 } },
  400,
  '风险天数不能为零',
);
const blank = {
  name: '部署验收项目',
  location: '广州',
  type: '工业厂房',
  source: '老客户',
  owner: '占位',
  stage: '商务谈判',
  amount: 25,
  customer: '验收客户',
  designer: '',
  contractor: '',
  contact: '联系人',
  phone: '',
  nextAction: '确认合同',
  nextDate: '2026-12-01',
  notes: '',
  opportunities: [
    {
      id: 'opportunity-qa',
      productId: 'product-qa',
      drawing: '推进中',
      tender: '未开始',
      filing: '未报备',
      note: '',
    },
  ],
  workflow: {
    region: '广州总部',
    assignments: {},
    assignmentMembers: {},
    tasks: [],
    checklist: {},
    facts: {},
    milestones: {},
  },
};
await denied(
  'sales',
  '/api/workspace',
  { action: 'create', data: { ...blank, nextDate: '2026-02-30' } },
  400,
  '不存在的日历日期被拒绝',
);
const draftProject = (
  await ok('sales', '/api/workspace', {
    action: 'create',
    data: { ...blank, name: '待安排下一步项目', nextAction: '', nextDate: '' },
  })
).project;
check(
  draftProject.nextAction === '' && draftProject.nextDate === '',
  'V2 轻量创建允许尚未安排下一步',
);
await denied(
  'ops',
  '/api/workspace',
  { action: 'create', data: blank },
  403,
  '运营不能创建销售项目',
);
let project = (
  await ok('sales', '/api/workspace', { action: 'create', data: blank })
).project;
check(
  project.ownerMemberId === users.sales.id && project.owner === 'sales',
  '项目创建绑定本人并保存姓名',
);
const projectId = project.id;
const projectFor = async (user, desk) =>
  (await ok(user, '/api/workspace', undefined, desk)).projects.find(
    (p) => p.id === projectId,
  );
async function save(user, action, data, note = '验收记录', desk) {
  return (
    await ok(
      user,
      '/api/workspace',
      { action, id: data.id, version: data.version, data, note },
      desk,
    )
  ).project;
}
check(
  !(await projectFor('sales2')) && !(await projectFor('outside')),
  '非主跟及其他公司项目隔离',
);
check(
  (await projectFor('branch'))?.id === projectId,
  'V2 公司范围：管理岗位统一查看公司项目',
);
await denied(
  'outside',
  '/api/workspace',
  { action: 'update', id: project.id, version: project.version, data: project },
  404,
  '其他公司不能按项目 ID 写入',
);
const original = structuredClone(project);
project = await save('sales', 'update', {
  ...project,
  name: '部署验收项目·完整链路',
});
await denied(
  'sales',
  '/api/workspace',
  {
    action: 'update',
    id: original.id,
    version: original.version,
    data: original,
  },
  409,
  '项目旧版本不能覆盖新编辑',
);
// Quick follow-ups are append-only: action=followup with content + requestId.
const followupDate = '2026-12-02';
await ok('sales', '/api/workspace', {
  action: 'followup',
  id: project.id,
  version: project.version,
  content: '已与客户确认需求',
  nextDate: followupDate,
  requestId: randomUUID(),
});
project = await projectFor('sales');
check(
  (await ok('sales', '/api/workspace')).events.some(
    (e) =>
      e.projectId === project.id &&
      e.kind === '跟进记录' &&
      e.note === '已与客户确认需求',
  ) &&
    project.nextDate === followupDate,
  '跟进记录和下一步计划可追溯',
);
project.workflow.assignmentMembers = {
  operations: users.ops.id,
  aftersales: users.after.id,
  finance: users.finance.id,
};
project = await save('manager', 'workflow', project);
check(
  !(await projectFor('ops')) && !(await projectFor('after')),
  '部门对接人分配不向运营/售后开放项目主档（V2 边界）',
);
const wrong = structuredClone(project);
wrong.workflow.assignmentMembers.operations = users.sales.id;
await denied(
  'manager',
  '/api/workspace',
  {
    action: 'workflow',
    id: wrong.id,
    version: wrong.version,
    data: wrong,
    note: '错配',
  },
  400,
  '部门对接人岗位必须匹配',
);
// Ops/aftersales cannot read the project record, so every project-scoped write
// is rejected at the record boundary. Positive filing/stage flows move to the
// project owner (sales) / management.
await denied(
  'ops',
  '/api/workspace',
  {
    action: 'workflow',
    id: project.id,
    version: project.version,
    data: project,
    note: '越权',
  },
  404,
  '运营不能通过项目接口写入（项目主档不可读）',
);
await denied(
  'after',
  '/api/workspace',
  {
    action: 'filing',
    id: project.id,
    version: project.version,
    data: project,
    note: '越权',
  },
  404,
  '售后不能通过报备接口写入（项目主档不可读）',
);
let op = await projectFor('sales');
op.opportunities[0] = {
  ...op.opportunities[0],
  filing: '已确认',
  filingDate: day,
  filingContact: '厂家联系人',
  filingReference: 'QA-FILING',
};
op = await save('sales', 'filing', op, '厂家确认报备');
check(op.opportunities[0].filing === '已确认', '销售主跟可更新厂家报备和回执');
op.workflow.facts['technical-needs'] = '现场已核对';
op.workflow.milestones.design = '2026-12-01';
op.workflow.checklist['deal-credit'] = true;
op.workflow.facts['check:deal-credit'] = '已核实采购主体授权与信用';
op = await save('sales', 'workflow', op);
check(
  op.workflow.facts['technical-needs'] === '现场已核对' &&
    op.workflow.milestones.design === '2026-12-01',
  '主跟可维护本岗位阶段信息和时间节点',
);
const forbidden = structuredClone(op);
forbidden.workflow.facts['payment-record'] = '越权金额';
await denied(
  'sales',
  '/api/workspace',
  {
    action: 'workflow',
    id: op.id,
    version: op.version,
    data: forbidden,
    note: '尝试',
  },
  403,
  '非财务岗位仍不能写财务核对记录',
);

// Standalone tasks: sales dispatch, recipients, management review and isolation.
const standaloneInput = {
  title: '独立任务：核对产品参数',
  request: '整理厂家参数表并反馈核对结果',
  desk: 'operations',
  dueDate: '2026-12-02',
  region: '广州总部',
  projectId: '',
  assigneeId: users.ops.id,
};
const projectsBefore = (await ok('sales', '/api/workspace')).projects.length;
let standalone = (
  await ok('sales', '/api/tasks', { action: 'create', data: standaloneInput })
).task;
check(
  !standalone.projectId &&
    !standalone.projectName &&
    standalone.createdBy === users.sales.id,
  '销售可独立下发任务，无需项目',
);
check(
  (await ok('sales', '/api/workspace')).projects.length === projectsBefore,
  '下发独立任务不会创建空项目',
);
check(
  (await ok('sales', '/api/tasks')).tasks.some((t) => t.id === standalone.id),
  '销售跨台下发的任务仍可跟踪',
);
check(
  (await ok('ops', '/api/tasks')).tasks.some((t) => t.id === standalone.id),
  '承办台自动收到独立任务',
);
check(
  (await ok('manager', '/api/tasks')).tasks.some((t) => t.id === standalone.id),
  '管理可督办销售下发的独立任务',
);
for (const user of ['sales2', 'finance', 'after', 'outside']) {
  check(
    !(await ok(user, '/api/tasks')).tasks.some((t) => t.id === standalone.id),
    user + ' 不可读取无关独立任务',
  );
}
check(
  (await ok('branch', '/api/tasks')).tasks.some((t) => t.id === standalone.id),
  'V2 公司管理可查看全部独立任务',
);
await denied(
  'sales2',
  '/api/tasks',
  {
    action: 'edit',
    id: standalone.id,
    version: standalone.version,
    data: standaloneInput,
  },
  404,
  '其他销售不能修改下发人的跨台任务',
);
const crossRegion = (
  await ok('sales', '/api/tasks', {
    action: 'create',
    data: { ...standaloneInput, region: '湖南分部' },
  })
).task;
check(
  crossRegion.region === '湖南分部' && crossRegion.desk === 'operations',
  'V2 不再按旧分部字段限制销售派单',
);
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'create',
    data: { ...standaloneInput, assigneeId: users.sales2.id },
  },
  400,
  '承办人必须拥有目标工作台权限',
);
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'create',
    data: { ...standaloneInput, assigneeId: users.outside.id },
  },
  400,
  '不能指定其他公司成员',
);
await denied(
  'sales',
  '/api/tasks',
  { action: 'create', data: { ...standaloneInput, dueDate: '' } },
  400,
  '独立任务必须明确完成日期',
);
await denied(
  'sales',
  '/api/tasks',
  { action: 'create', data: { ...standaloneInput, dueDate: '2026-02-30' } },
  400,
  '拒绝不存在的日期',
);
const previousVersion = standalone.version;
standalone = (
  await ok('sales', '/api/tasks', {
    action: 'edit',
    id: standalone.id,
    version: standalone.version,
    data: { ...standaloneInput, dueDate: '2026-12-03' },
  })
).task;
check(standalone.dueDate === '2026-12-03', '下发人可调整任务期限');
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'edit',
    id: standalone.id,
    version: previousVersion,
    data: standaloneInput,
  },
  409,
  '独立任务不能覆盖较新的调整',
);
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'feedback',
    id: standalone.id,
    version: standalone.version,
    status: '处理中',
    result: '代填',
  },
  403,
  '下发人不能越台替承办人填写结果',
);
standalone = (
  await ok('ops', '/api/tasks', {
    action: 'feedback',
    id: standalone.id,
    version: standalone.version,
    status: '待验收',
    result: '已完成参数核对，记录已附于反馈',
  })
).task;
check(
  (await ok('sales', '/api/tasks')).tasks.find((t) => t.id === standalone.id)
    ?.result === standalone.result,
  '处理结果同步下发人',
);
await denied(
  'sales',
  '/api/tasks',
  { action: 'accept', id: standalone.id, version: standalone.version },
  403,
  '销售下发的任务仍须管理验收',
);
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'edit',
    id: standalone.id,
    version: standalone.version,
    data: standaloneInput,
  },
  400,
  '待验收时不能更改任务要求',
);
standalone = (
  await ok('manager', '/api/tasks', {
    action: 'accept',
    id: standalone.id,
    version: standalone.version,
    note: '核验通过',
  })
).task;
check(
  standalone.status === '已完成' && standalone.history.length === 4,
  '独立任务完成下发、调整、反馈、验收闭环',
);
let poolSales = (
  await ok('sales', '/api/tasks', {
    action: 'create',
    data: { ...standaloneInput, assigneeId: '' },
  })
).task;
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'feedback',
    id: poolSales.id,
    version: poolSales.version,
    status: '处理中',
    result: '',
  },
  403,
  '下发人不能抢领其他台的待认领任务',
);
await denied(
  'ops2',
  '/api/tasks',
  {
    action: 'feedback',
    id: poolSales.id,
    version: poolSales.version,
    status: '处理中',
    result: '我来处理',
  },
  404,
  '未指定承办人的任务不能被同台成员直接认领（V2 inTaskScope 边界）',
);
poolSales = (
  await ok('manager', '/api/tasks', {
    action: 'edit',
    id: poolSales.id,
    version: poolSales.version,
    data: { ...standaloneInput, assigneeId: users.ops2.id },
  })
).task;
check(
  poolSales.assigneeId === users.ops2.id,
  '管理可将待认领任务指派给承办成员',
);
await denied(
  'sales',
  '/api/tasks',
  { action: 'cancel', id: poolSales.id, version: poolSales.version, note: '' },
  400,
  '下发人取消也必须说明原因',
);
poolSales = (
  await ok('sales', '/api/tasks', {
    action: 'cancel',
    id: poolSales.id,
    version: poolSales.version,
    note: '需求已撤回',
  })
).task;
check(poolSales.status === '已取消', '销售可取消自己下发的任务');
const received = (
  await ok('manager', '/api/tasks', {
    action: 'create',
    data: { ...standaloneInput, desk: 'sales', assigneeId: users.sales.id },
  })
).task;
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'edit',
    id: received.id,
    version: received.version,
    data: { ...standaloneInput, desk: 'sales', assigneeId: users.sales.id },
  },
  403,
  '销售不能调整管理下发的任务',
);
await denied(
  'sales',
  '/api/tasks',
  {
    action: 'cancel',
    id: received.id,
    version: received.version,
    note: '擅自取消',
  },
  403,
  '销售不能取消别人下发的任务',
);

// Management dispatch, return, reassignment, cancellation, and optimistic concurrency.
const taskInput = {
  title: '运营验收任务',
  request: '核对厂家交期',
  desk: 'operations',
  dueDate: '2026-12-01',
  region: '广州总部',
  projectId: '',
  assigneeId: users.ops.id,
};
await denied(
  'ops',
  '/api/tasks',
  { action: 'create', data: taskInput },
  403,
  '运营不能自行下达任务',
);
const branchDispatch = (
  await ok('branch', '/api/tasks', {
    action: 'create',
    data: { ...taskInput, title: '跨旧分部派发任务' },
  })
).task;
check(
  branchDispatch.status === '待处理' && branchDispatch.region === '广州总部',
  'V2 公司管理可跨旧分部派发任务',
);
let task = (
  await ok('manager', '/api/tasks', { action: 'create', data: taskInput })
).task;
check(
  task.status === '待处理' && task.dueDate === '2026-12-01',
  '管理下达负责人和期限明确的任务',
);
await denied(
  'ops2',
  '/api/tasks',
  {
    action: 'feedback',
    id: task.id,
    version: task.version,
    status: '处理中',
    result: '抢改',
  },
  404,
  '同台非承办人不能反馈指定任务',
);
await denied(
  'manager',
  '/api/tasks',
  { action: 'accept', id: task.id, version: task.version },
  400,
  '未提交结果不能验收',
);
await denied(
  'ops',
  '/api/tasks',
  {
    action: 'feedback',
    id: task.id,
    version: task.version,
    status: '待验收',
    result: '',
  },
  400,
  '提交验收必须填写结果',
);
task = (
  await ok('ops', '/api/tasks', {
    action: 'feedback',
    id: task.id,
    version: task.version,
    status: '处理中',
    result: '已联系厂家',
  })
).task;
const staleTask = structuredClone(task);
task = (
  await ok('manager', '/api/tasks', {
    action: 'edit',
    id: task.id,
    version: task.version,
    data: { ...taskInput, assigneeId: users.ops2.id, dueDate: '2026-12-03' },
  })
).task;
check(
  task.status === '待处理' &&
    task.result === '' &&
    task.assigneeId === users.ops2.id,
  '改派任务清除旧办理状态，历史仍保留',
);
await denied(
  'manager',
  '/api/tasks',
  { action: 'edit', id: task.id, version: staleTask.version, data: taskInput },
  409,
  '旧任务版本不能覆盖改派',
);
task = (
  await ok('ops2', '/api/tasks', {
    action: 'feedback',
    id: task.id,
    version: task.version,
    status: '待验收',
    result: '交期已核对',
  })
).task;
await denied(
  'manager',
  '/api/tasks',
  { action: 'return', id: task.id, version: task.version, note: '' },
  400,
  '退回任务必须说明原因',
);
task = (
  await ok('manager', '/api/tasks', {
    action: 'return',
    id: task.id,
    version: task.version,
    note: '补充回执编号',
  })
).task;
check(
  task.status === '处理中' && task.reviewNote === '补充回执编号',
  '退回原因到达承办台',
);
task = (
  await ok('ops2', '/api/tasks', {
    action: 'feedback',
    id: task.id,
    version: task.version,
    status: '待验收',
    result: '回执 QA-001',
  })
).task;
task = (
  await ok('manager', '/api/tasks', {
    action: 'accept',
    id: task.id,
    version: task.version,
    note: '核验通过',
  })
).task;
check(
  task.status === '已完成' && task.history.length === 7,
  '完整任务流转历史保留',
);
await denied(
  'manager',
  '/api/tasks',
  { action: 'cancel', id: task.id, version: task.version, note: '取消' },
  400,
  '已完成任务不能继续改写',
);
let pool = (
  await ok('manager', '/api/tasks', {
    action: 'create',
    data: { ...taskInput, assigneeId: '' },
  })
).task;
await denied(
  'ops',
  '/api/tasks',
  {
    action: 'feedback',
    id: pool.id,
    version: pool.version,
    status: '处理中',
    result: '',
  },
  404,
  '未指定承办人的任务需先由管理指派（V2 inTaskScope 边界）',
);
pool = (
  await ok('manager', '/api/tasks', {
    action: 'edit',
    id: pool.id,
    version: pool.version,
    data: { ...taskInput, assigneeId: users.ops.id },
  })
).task;
check(pool.assigneeId === users.ops.id, '管理可把待认领任务指派给承办成员');
await denied(
  'manager',
  '/api/tasks',
  { action: 'cancel', id: pool.id, version: pool.version, note: '' },
  400,
  '取消任务必须填写原因',
);
pool = (
  await ok('manager', '/api/tasks', {
    action: 'cancel',
    id: pool.id,
    version: pool.version,
    note: '客户取消需求',
  })
).task;
check(pool.status === '已取消', '管理可取消未完成任务');
for (const [desk, assignee] of [
  ['sales', 'sales'],
  ['finance', 'finance'],
  ['aftersales', 'after'],
  ['management', 'manager'],
]) {
  const t = (
    await ok('manager', '/api/tasks', {
      action: 'create',
      data: {
        ...taskInput,
        title: desk + '验收任务',
        desk,
        assigneeId: users[assignee].id,
      },
    })
  ).task;
  check(
    (await ok(assignee, '/api/tasks')).tasks.some((row) => row.id === t.id),
    `${desk} 台能接收派发任务`,
  );
}
const link = (await ok('sales', '/api/workspace')).linkages.find(
  (l) => l.projectId === projectId,
);
check(
  !JSON.stringify(link).includes('回执 QA-001') &&
    !JSON.stringify(link).includes('核对厂家交期'),
  '跨台交接摘要不泄漏任务内容',
);

// Contract → review/return → receipts/void → invoice return/issue.
let book;
const finance = async (user, action, fields = {}, desk) => {
  book = (
    await ok(
      user,
      '/api/finance',
      { action, projectId, version: book?.version || 0, ...fields },
      desk,
    )
  ).book;
  return book;
};
const finDenied = (user, action, fields, status, label, desk) =>
  denied(
    user,
    '/api/finance',
    { action, projectId, version: book?.version || 0, ...fields },
    status,
    label,
    desk,
  );
const contract = {
  contractNo: 'QA-CONTRACT-SECRET',
  contractAmountCents: 1234567,
  paymentTerms: '分两期付款',
};
await finance('sales', 'submit_contract', contract);
check(
  book.reviewStatus === '待审核' && book.contractAmountCents === 1234567,
  '合同以整数分保存准确金额并进入审核',
);
await finDenied(
  'ops',
  'review_contract',
  { decision: 'approved' },
  404,
  '运营不能读取项目票款台账（项目主档不可读，V2 边界）',
);
await finDenied(
  'manager',
  'review_contract',
  { decision: 'approved' },
  403,
  '普通管理不能代替财务审核',
);
await finDenied(
  'sales',
  'record_receipt',
  { amountCents: 1 },
  403,
  '销售不能登记实收',
);
await finDenied(
  'finance',
  'review_contract',
  { decision: 'returned', note: '' },
  400,
  '合同退回必须填写原因',
);
await finance('finance', 'review_contract', {
  decision: 'returned',
  note: '补充付款约定',
});
check(
  book.reviewStatus === '退回修改' && book.reviewNote === '补充付款约定',
  '合同退回原因可供销售查看',
);
await finance('sales', 'submit_contract', contract);
const plans = [
  { id: 'deposit', label: '首款', amountCents: 234567, dueDate: '2026-10-01' },
  { id: 'balance', label: '尾款', amountCents: 1000000, dueDate: '2026-12-01' },
];
await finDenied(
  'finance',
  'review_contract',
  { decision: 'approved', plans: [plans[0]] },
  400,
  '收款计划合计必须等于合同金额',
);
await finDenied(
  'finance',
  'review_contract',
  { decision: 'approved', plans: [plans[0], { ...plans[1], id: 'deposit' }] },
  400,
  '收款节点不允许重复编号',
);
await finance('finance', 'review_contract', {
  decision: 'approved',
  plans,
  note: '核验完成',
});
check(
  book.reviewStatus === '已审核' && book.plans.length === 2,
  '财务审核形成分期收款计划',
);
await finDenied(
  'sales',
  'submit_contract',
  contract,
  400,
  '已审核合同不能直接改写',
);
await finDenied(
  'finance',
  'record_receipt',
  { planId: 'deposit', amountCents: 234568, date: day, reference: 'BANK-' + randomUUID() },
  400,
  '实收不能超出节点余额',
);
await finDenied(
  'finance',
  'record_receipt',
  { planId: 'deposit', amountCents: 1.1, date: day, reference: 'BANK-' + randomUUID() },
  400,
  '金额必须为整数分',
);
await finDenied(
  'finance',
  'record_receipt',
  { planId: 'deposit', amountCents: 1, date: '2099-01-01', reference: 'BANK-' + randomUUID() },
  400,
  '收款日期不能在未来',
);
await finance('finance', 'record_receipt', {
  planId: 'deposit',
  amountCents: 34567,
  date: day,
  reference: 'QA-RECEIPT-SECRET',
});
const receiptId = book.receipts[0].id,
  receiptVersion = book.version;
await finance('finance', 'record_receipt', {
  planId: 'deposit',
  amountCents: 200000,
  date: day,
  reference: 'BANK-' + randomUUID(),
});
check(
  book.receipts.reduce((sum, r) => sum + r.amountCents, 0) === 234567,
  '分次收款精确累加到节点金额',
);
await denied(
  'finance',
  '/api/finance',
  {
    action: 'record_receipt',
    projectId,
    version: receiptVersion,
    planId: 'balance',
    amountCents: 1,
    date: day,
  },
  409,
  '旧票款版本不能重复入账',
);
const receiptBankId = book.receipts.find((r) => r.id === receiptId).bankId;
await denied(
  'finance',
  '/api/cashflow',
  { action: 'void_bank', id: receiptBankId, reason: '', requestId: randomUUID() },
  400,
  '冲销必须提供原因',
);
await ok('finance', '/api/cashflow', {
  action: 'void_bank',
  id: receiptBankId,
  reason: '流水录入错误',
  requestId: randomUUID(),
});
book = (await ok('finance', '/api/workspace')).finances[projectId];
check(
  book.receipts.length === 2 &&
    !!book.receipts.find((r) => r.id === receiptId).voidAt,
  '冲销保留原记录和原因',
);
await denied(
  'finance',
  '/api/cashflow',
  {
    action: 'void_bank',
    id: receiptBankId,
    reason: '重复冲销',
    requestId: randomUUID(),
  },
  400,
  '不能重复冲销',
);
await finance('finance', 'record_receipt', {
  planId: 'deposit',
  amountCents: 34567,
  date: day,
  reference: 'BANK-' + randomUUID(),
});
await finance('sales', 'request_invoice', {
  amountCents: 1234567,
  title: '验收客户',
  taxNo: 'QA-TAX-SECRET',
  remark: '完整金额',
});
let invoiceId = book.invoices.at(-1).id;
await finDenied(
  'sales',
  'request_invoice',
  { amountCents: 1, title: '验收客户', taxNo: 'QA' },
  400,
  '待处理申请占用可开票余额，不能超开',
);
await finDenied(
  'finance',
  'process_invoice',
  { invoiceId, decision: 'returned', reply: '' },
  400,
  '开票退回必须说明原因',
);
await finance('finance', 'process_invoice', {
  invoiceId,
  decision: 'returned',
  reply: '抬头需要更正',
});
check(book.invoices.at(-1).status === '已退回', '退回开票申请释放额度');
await finance('sales', 'request_invoice', {
  amountCents: 1234567,
  title: '验收客户有限公司',
  taxNo: 'QA-TAX-CORRECTED',
});
invoiceId = book.invoices.at(-1).id;
await finDenied(
  'finance',
  'process_invoice',
  {
    invoiceId,
    decision: 'issued',
    number: 'QA-INVOICE-SECRET',
    issuedDate: '2099-01-01',
  },
  400,
  '发票日期不能在未来',
);
await finance('finance', 'process_invoice', {
  invoiceId,
  decision: 'issued',
  number: 'QA-INVOICE-SECRET',
  issuedDate: day,
});
check(
  book.invoices.at(-1).status === '已开票' &&
    book.invoices.at(-1).amountCents === 1234567,
  '财务登记发票号码、日期和准确金额',
);
await finDenied(
  'finance',
  'process_invoice',
  { invoiceId, decision: 'returned', reply: '重复处理' },
  400,
  '已处理开票申请不能二次处理',
);
await finance('finance', 'finance_memo', { memo: 'QA-FINANCE-MEMO-SECRET' });
check(
  (await ok('finance', '/api/workspace')).finances[projectId].financeMemo ===
    'QA-FINANCE-MEMO-SECRET',
  '财务内部备注保存',
);
for (const role of ['sales', 'manager'])
  check(
    !JSON.stringify((await ok(role, '/api/workspace')).finances).includes(
      'QA-FINANCE-MEMO-SECRET',
    ),
    `${role} 不返回财务内部备注`,
  );
const raceVersion = book.version;
const race = await Promise.all(
  ['并发甲', '并发乙'].map((memo) =>
    request('finance', '/api/finance', {
      action: 'finance_memo',
      projectId,
      version: raceVersion,
      memo,
    }),
  ),
);
check(
  race
    .map((r) => r.status)
    .sort()
    .join(',') === '200,409',
  '并发票款更新仅一个成功',
);

// Confidential financial facts, activity, and cross-desk notifications.
project = await projectFor('finance');
project.workflow.facts['payment-record'] = 'QA-PAYMENT-FACT-SECRET';
project = await save('finance', 'workflow', project);
for (const role of ['ops', 'after']) {
  const payload = await ok(role, '/api/workspace');
  check(!payload.finances[projectId], `${role} 不返回票款账本`);
  check(
    !JSON.stringify(payload.events).includes('QA-CONTRACT-SECRET') &&
      !JSON.stringify(payload.events).includes('QA-INVOICE-SECRET') &&
      !JSON.stringify(payload.events).includes('12,345.67'),
    `${role} 项目动态不泄漏合同、发票和金额`,
  );
  check(
    !JSON.stringify(payload.projects).includes('QA-PAYMENT-FACT-SECRET'),
    `${role} 项目事实不泄漏回款核对内容`,
  );
}
const dualOps = await ok('finance', '/api/workspace', undefined, 'operations');
check(
  !JSON.stringify(dualOps.notifications).includes('QA-CONTRACT-SECRET') &&
    !JSON.stringify(dualOps.notifications).includes('12,345.67'),
  '兼岗成员切到运营台后通知不泄漏票款详情',
);
op = await projectFor('sales');
delete op.workflow.facts['payment-record'];
op.workflow.facts['technical-needs'] = '隔离字段后继续更新技术记录';
const preserved = await request('sales', '/api/workspace', {
  action: 'workflow',
  id: op.id,
  version: op.version,
  data: op,
  note: '技术复核',
});
check(
  preserved.status === 200 &&
    (await projectFor('finance')).workflow.facts['payment-record'] ===
      'QA-PAYMENT-FACT-SECRET',
  '保存可见字段时保留无权查看的财务记录',
);

// Archived collaboration tasks are retained while hidden tasks stay inaccessible.
project = await projectFor('manager');
const legacy = (department, assignee, title) => ({
  id: randomUUID(),
  title,
  department,
  assignee,
  assigneeMemberId: users[assignee].id,
  dueDate: '2026-12-01',
  status: '待处理',
  request: '历史协作要求',
  result: '',
  createdAt: now,
  completedAt: '',
});
project.workflow.tasks = [
  legacy('operations', 'ops', '旧版运营协作'),
  legacy('aftersales', 'after', 'QA-HIDDEN-AFTER-TASK'),
  legacy('finance', 'finance', '旧版财务协作'),
];
project = await save('manager', 'workflow', project);
op = await projectFor('finance');
const financeTask = op.workflow.tasks.find((t) => t.department === 'finance');
check(
  !!financeTask &&
    op.workflow.tasks.some((t) => t.department === 'operations') &&
    !op.workflow.tasks.some((t) => t.department === 'aftersales') &&
    !JSON.stringify(op).includes('QA-HIDDEN-AFTER-TASK'),
  '旧版协作按持久岗位能力过滤（V2 无 scope 切换）',
);
financeTask.status = '已完成';
financeTask.result = '已办结';
financeTask.completedAt = now;
op = await save('finance', 'workflow', op, '完成协作');
check(
  (await projectFor('manager')).workflow.tasks.length === 3,
  '反馈本台协作不删除其他台历史',
);
const beforeNotices = (await ok('finance', '/api/workspace')).notifications;
await ok('sales', '/api/workspace', { action: 'read_notifications' });
check(
  (await ok('sales', '/api/workspace')).notifications.every((n) => n.readAt),
  '本人通知可全部标记已读',
);
check(
  (await ok('finance', '/api/workspace')).notifications.filter((n) => !n.readAt)
    .length === beforeNotices.filter((n) => !n.readAt).length,
  '已读操作不影响其他成员',
);
// Status transitions are recorded through the outcome window, then the closed
// project may drop the active follow-up plan.
project = await projectFor('sales');
const closed = await ok('sales', '/api/outcomes', {
  action: 'status',
  projectId,
  version: project.version,
  status: '已成交',
});
project = await save('sales', 'update', {
  ...closed.project,
  nextAction: '',
  nextDate: '',
});
check(
  project.nextAction === '' &&
    project.nextDate === '' &&
    project.businessStatus === '已成交',
  '成交项目允许结束后续跟进安排',
);
check((await projectFor('manager')).id === projectId, '成交后保留业务历史');
// Optional ephemeral fixture for manual browser verification; never ship credentials.
if (process.env.QA_BROWSER_FIXTURE) {
  const file = resolve(process.env.QA_BROWSER_FIXTURE);
  if (!file.startsWith('/private/tmp/gushi-access-qa/'))
    throw Error('Fixture must remain temporary');
  writeFileSync(
    file,
    JSON.stringify({ base, password, users, projectId, workspace }),
    { mode: 0o600 },
  );
}
console.log(JSON.stringify({ passed: passed.length, failed, workspace }));
if (failed.length) process.exitCode = 1;
