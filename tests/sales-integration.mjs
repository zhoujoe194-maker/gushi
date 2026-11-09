import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';
import { localDate } from '../app/sales/model.ts';
import { blankReport } from '../app/sales/report-model.ts';
const database = resolve(process.env.DATABASE_PATH || '.'),
  base = process.env.QA_URL || 'http://127.0.0.1:5197';
if (
  process.env.RUN_LOCAL_TESTS !== '1' ||
  !database.startsWith('/private/tmp/gushi-sales-qa/') ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error('仅允许隔离的销售考核测试数据库');
const db = openSqlite(database),
  now = new Date().toISOString(),
  today = localDate(),
  month = today.slice(0, 7),
  ws = 'sales-qa-' + randomUUID(),
  password = 'SalesQA!' + randomUUID(),
  hash = await hashPassword(password),
  users = {},
  passed = [];
function check(v, label) {
  if (!v) throw Error('FAIL ' + label);
  passed.push(label);
  console.log('PASS ' + label);
}
for (const [key, role, region, desks] of [
  ['owner', 'owner', '全部分部'],
  ['manager', 'management', '全部分部'],
  ['branch', 'management', '广州总部'],
  ['hn', 'management', '湖南分部'],
  ['sales', 'sales', '广州总部'],
  ['sales2', 'sales', '广州总部'],
  ['dual', 'sales', '广州总部', ['sales', 'management', 'operations']],
  ['ops', 'operations', '广州总部'],
  ['finance', 'finance', '全部分部'],
  ['outside', 'sales', '广州总部'],
]) {
  const id = ws + '-' + key,
    email = id + '@example.invalid';
  db.prepare(
    "INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,'active',1,?,?,?,?,?)",
  ).run(
    id,
    key === 'outside' ? ws + '-other' : ws,
    email,
    key,
    role,
    region,
    now,
    now,
    now,
    desks ? JSON.stringify(desks) : null,
    desks?.[0] || null,
  );
  db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id, hash, now);
  users[key] = { id, email };
}
async function request(
  user,
  path = '/api/sales?month=2026-09',
  body,
  desk,
  origin = base,
) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(user ? { Cookie: users[user].cookie } : {}),
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
      ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  return {
    status: r.status,
    body: await r.json(),
    cookie: r.headers.get('set-cookie')?.split(';')[0],
  };
}
async function ok(user, body, desk) {
  const r = await request(user, '/api/sales', body, desk);
  if (r.status !== 200) throw Error(JSON.stringify(r));
  return r.body.record;
}
async function denied(user, body, code, label, desk) {
  check((await request(user, '/api/sales', body, desk)).status === code, label);
}
const get = async (user, period = '2026-09', target) => {
  const r = await request(
    user,
    '/api/sales?' +
      new URLSearchParams({
        month: period,
        ...(target ? { memberId: target } : {}),
      }),
  );
  if (r.status !== 200) throw Error(JSON.stringify(r));
  return r.body;
};
for (const user of Object.values(users)) {
  const r = await request(null, '/api/auth', {
    action: 'login',
    identifier: user.email,
    password,
  });
  if (r.status !== 200) throw Error('Fixture login');
  user.cookie = r.cookie;
}
check((await request(null)).status === 401, '匿名不能查看考核资料');
for (const user of ['ops', 'finance'])
  check((await request(user)).status === 403, user + ' 不能访问销售考核');
check(
  (await request('dual', '/api/sales', undefined, 'operations')).status === 403,
  '兼岗人员切到运营台不能读取销售考核',
);
check(
  (
    await request(
      'sales',
      '/api/sales?month=2026-09&memberId=' + users.sales2.id,
    )
  ).status === 404,
  '销售不能查看同事的考核',
);
check(
  (await request('hn', '/api/sales?month=2026-09&memberId=' + users.sales.id))
    .status === 404,
  '分部管理不能读取其他分部考核',
);
check(
  (
    await request(
      'manager',
      '/api/sales?month=2026-09&memberId=' + users.outside.id,
    )
  ).status === 404,
  '管理不能读取其他公司记录',
);
check(
  (await request('sales', '/api/sales?month=2026-07')).status === 400,
  '不将新制度套用于生效前月份',
);
check(
  (await request('sales', '/api/sales?month=2026-99')).status === 400,
  '拒绝非法月份',
);
const activity = {
  type: '新增线索',
  title: '新增有效工程线索',
  customer: '验收客户甲',
  contact: '张先生 13900000000',
  progress: '设计阶段',
  result: '已确认选型意向和下次沟通安排',
  evidence: '客户沟通记录 QA-001',
  projectId: '',
};
check(
  (
    await request(
      'sales',
      '/api/sales',
      { action: 'activity', date: '2026-09-07', data: activity },
      undefined,
      'https://evil.invalid',
    )
  ).status === 403,
  '跨站请求不能提交记录',
);
await denied(
  'sales',
  {
    action: 'activity',
    date: '2026-09-07',
    data: { ...activity, contact: '' },
  },
  400,
  '有效线索必须提供联系方式',
);
await denied(
  'sales',
  {
    action: 'activity',
    date: '2026-09-07',
    data: { ...activity, progress: '' },
  },
  400,
  '有效线索必须提供项目进度',
);
await denied(
  'sales',
  {
    action: 'activity',
    date: '2026-09-07',
    data: { ...activity, evidence: '' },
  },
  400,
  '工作记录必须有可核实依据',
);
await denied(
  'sales',
  { action: 'activity', date: '2026-02-30', data: activity },
  400,
  '工作记录日期必须真实存在',
);
await denied(
  'sales',
  { action: 'activity', date: '2099-01-01', data: activity },
  400,
  '不能填未来工作记录',
);
await denied(
  'sales',
  {
    action: 'activity',
    date: '2026-09-07',
    data: { ...activity, projectId: 'unrelated' },
  },
  404,
  '不能关联无权访问的项目',
);
await denied(
  'manager',
  { action: 'activity', date: '2026-09-07', data: activity },
  403,
  '管理不能冒用销售填写记录',
);
let lead = await ok('sales', {
  action: 'activity',
  memberId: users.sales2.id,
  date: '2026-09-07',
  data: { ...activity, status: 'approved', reviewedBy: '伪造' },
});
check(
  lead.memberId === users.sales.id &&
    lead.status === 'submitted' &&
    !lead.data.reviewedBy,
  '身份与待审核状态来自服务端',
);
check(
  (await get('sales')).evidence.counts['新增线索'] === 0,
  '待核实工作不计入有效线索',
);
check(
  (await get('branch', '2026-09', users.sales.id)).records.some(
    (r) => r.id === lead.id,
  ),
  '本分部管理可查看提交记录',
);
check((await get('sales2')).records.length === 0, '其他销售收不到本人记录');
await denied(
  'sales',
  { action: 'review', id: lead.id, version: lead.version, note: '自己核实' },
  403,
  '销售不能自行核实',
);
await denied(
  'manager',
  { action: 'review', id: lead.id, version: lead.version, note: '' },
  400,
  '管理核实必须说明依据',
);
const race = await Promise.all([
  request('manager', '/api/sales', {
    action: 'review',
    id: lead.id,
    version: lead.version,
    note: '已核对凭据',
  }),
  request('branch', '/api/sales', {
    action: 'review',
    id: lead.id,
    version: lead.version,
    note: '同时核对',
  }),
]);
check(
  race
    .map((r) => r.status)
    .sort()
    .join(',') === '200,409',
  '并发复核只有一个成功',
);
lead = race.find((r) => r.status === 200).body.record;
check(
  (await get('sales')).evidence.counts['新增线索'] === 1,
  '核实后有效线索统计更新',
);
await denied(
  'sales',
  {
    action: 'activity',
    id: lead.id,
    version: lead.version,
    date: lead.date,
    data: activity,
  },
  400,
  '已核实记录不能由销售直接改写',
);
lead = await ok('manager', {
  action: 'return',
  id: lead.id,
  version: lead.version,
  note: '补充具体选型信息',
});
check(
  lead.status === 'returned' &&
    (await get('sales')).evidence.counts['新增线索'] === 0,
  '退回记录撤出已核实统计',
);
await denied(
  'sales',
  {
    action: 'activity',
    id: lead.id,
    version: 1,
    date: lead.date,
    data: activity,
  },
  409,
  '旧版本不能覆盖审核反馈',
);
lead = await ok('sales', {
  action: 'activity',
  id: lead.id,
  version: lead.version,
  date: lead.date,
  data: { ...activity, result: '补齐厂家参数，确认二次拜访' },
});
check(
  lead.status === 'submitted' && lead.history.length === 4,
  '重新提交保留完整流转历史',
);
lead = await ok('manager', {
  action: 'review',
  id: lead.id,
  version: lead.version,
  note: '补充信息已核实',
});
for (let i = 0; i < 2; i++) {
  let v = await ok('sales', {
    action: 'activity',
    date: '2026-09-08',
    data: { ...activity, type: '客户拜访', title: '客户甲第 ' + i + ' 次拜访' },
  });
  await ok('manager', {
    action: 'review',
    id: v.id,
    version: v.version,
    note: '拜访记录核实',
  });
}
check(
  (await get('sales')).evidence.customersVisited === 1,
  '同一客户多次拜访按一家统计',
);
let dual = await ok(
  'dual',
  { action: 'activity', date: '2026-09-07', data: activity },
  'sales',
);
await denied(
  'dual',
  { action: 'review', id: dual.id, version: dual.version, note: '自己审核' },
  403,
  '兼岗管理也不能审核自己的记录',
  'management',
);
const weeklyData = {
  summary: '已完成客户拜访并明确产品选型',
  nextPlan: '下周提交报价并安排厂家对接',
  risks: '需协调厂家交期',
  evidence: '周报项目清单及客户沟通记录',
  submittedAt: '2020-01-01',
  late: false,
};
await denied(
  'sales',
  { action: 'weekly', week: '2026-09-08', data: weeklyData },
  400,
  '周报所属周必须规范为周一',
);
await denied(
  'sales',
  {
    action: 'weekly',
    week: '2026-09-07',
    data: { ...weeklyData, nextPlan: '' },
  },
  400,
  '周报必须填写下一周计划',
);
const duplicate = await Promise.all([
  request('sales', '/api/sales', {
    action: 'weekly',
    week: '2026-09-07',
    data: weeklyData,
  }),
  request('sales', '/api/sales', {
    action: 'weekly',
    week: '2026-09-07',
    data: weeklyData,
  }),
]);
check(
  duplicate
    .map((r) => r.status)
    .sort()
    .join(',') === '200,409',
  '同一成员同一周只产生一份周报',
);
let weekly = duplicate.find((r) => r.status === 200).body.record;
check(
  weekly.data.deadline === '2026-09-13T00:00:00+08:00' &&
    weekly.data.late &&
    weekly.data.submittedAt >= '2026-10',
  '周六24点截止，提交时间和迟交由服务器确定',
);
let cross = await ok('sales', {
  action: 'weekly',
  week: '2026-08-31',
  data: weeklyData,
});
check(
  cross.date === '2026-09-05' &&
    (await get('sales')).records.some((r) => r.id === cross.id),
  '跨月周按周六所属月份归档',
);
await denied(
  'sales',
  {
    action: 'weekly',
    id: weekly.id,
    version: weekly.version,
    week: '2026-09-14',
    data: weeklyData,
  },
  400,
  '不能更改已提交周报的归属周',
);
const full = {
  weekly: 5,
  response: 6,
  collaboration: 5,
  manufacturer: 4,
  planning: 5,
  leads: 20,
  maintenance: 10,
  proposal: 10,
  training: 5,
  assigned: 5,
  visits: 10,
  receivables: 10,
  expenses: 5,
};
await denied(
  'sales',
  {
    action: 'self_review',
    month: '2026-09',
    scores: { ...full, leads: 21 },
    note: '工作说明',
  },
  400,
  '分项评分不能超过权重',
);
const missing = { ...full };
delete missing.training;
await denied(
  'sales',
  {
    action: 'self_review',
    month: '2026-09',
    scores: missing,
    note: '工作说明',
  },
  400,
  '月度自评必须填写全部13项',
);
await denied(
  'sales',
  {
    action: 'self_review',
    month: '2026-09',
    scores: { ...full, training: 1.25 },
    note: '工作说明',
  },
  400,
  '评分精度最多一位小数',
);
let perf = await ok('sales', {
  action: 'self_review',
  month: '2026-09',
  scores: full,
  note: '已完成本月销售履职，自评依据见记录',
  managerScores: full,
  total: 100,
});
check(
  !perf.data.managerScores && !perf.data.total && perf.status === 'submitted',
  '自评不能伪造上级评分和最终结果',
);
await denied(
  'sales',
  {
    action: 'publish',
    id: perf.id,
    version: perf.version,
    scores: full,
    note: '发布',
  },
  403,
  '销售不能发布自己的绩效',
);
await denied(
  'manager',
  {
    action: 'publish',
    id: perf.id,
    version: perf.version,
    scores: full,
    note: '已核实',
  },
  400,
  '本月待审核周报阻止提前发布考核',
);
weekly = await ok('manager', {
  action: 'review',
  id: weekly.id,
  version: weekly.version,
  note: '核实周报',
});
cross = await ok('manager', {
  action: 'review',
  id: cross.id,
  version: cross.version,
  note: '跨月周报已核实',
});
const seventyFive = { ...full, weekly: 0, leads: 0 };
await denied(
  'manager',
  {
    action: 'publish',
    id: perf.id,
    version: perf.version,
    scores: seventyFive,
    note: '需改善',
  },
  400,
  '70至79.9分必须有书面改进计划',
);
perf = await ok('manager', {
  action: 'publish',
  id: perf.id,
  version: perf.version,
  scores: seventyFive,
  note: '客户拓展与周报需改善',
  improvement: '下月每周新增至少2条有效线索，周六前完整交周报',
});
check(
  perf.data.total === 75 &&
    perf.data.band.referenceBonus === 100 &&
    perf.data.selfScores.leads === 20 &&
    perf.data.managerScores.leads === 0,
  '分别保存自评与核定得分及参考激励',
);
check(
  perf.data.snapshot.counts['新增线索'] === 1 &&
    perf.data.snapshot.customersVisited === 1 &&
    perf.data.snapshot.weeklyExpected === 4 &&
    perf.data.snapshot.weeklyMissing === 2,
  '发布保存已核实证据统计快照',
);
await denied(
  'sales',
  { action: 'activity', date: '2026-09-22', data: activity },
  409,
  '发布后锁定当月新增记录',
);
await denied(
  'manager',
  {
    action: 'return',
    id: lead.id,
    version: lead.version,
    note: '直接退回工作',
  },
  409,
  '发布后不能单独改写其工作依据',
);
await denied(
  'sales',
  {
    action: 'self_review',
    id: perf.id,
    version: perf.version,
    month: '2026-09',
    scores: full,
    note: '重新自评',
  },
  400,
  '销售不能改写已发布月度结果',
);
perf = await ok('manager', {
  action: 'return',
  id: perf.id,
  version: perf.version,
  note: '允许补充更正本月材料',
});
check(
  perf.data.priorResults.length === 1 && perf.data.priorResults[0].total === 75,
  '退回月度考核保留历史核定结果',
);
let addition = await ok('sales', {
  action: 'activity',
  date: '2026-09-22',
  data: { ...activity, type: '厂家对接' },
});
check(addition.status === 'submitted', '退回月考核后可补充依据');
addition = await ok('manager', {
  action: 'review',
  id: addition.id,
  version: addition.version,
  note: '材料核实',
});
perf = await ok('sales', {
  action: 'self_review',
  id: perf.id,
  version: perf.version,
  month: '2026-09',
  scores: full,
  note: '补充后重新自评',
});
perf = await ok('manager', {
  action: 'publish',
  id: perf.id,
  version: perf.version,
  scores: { ...full, leads: 9.9 },
  note: '补充后再次核定',
});
check(
  perf.data.total === 89.9 &&
    perf.data.band.referenceBonus === 250 &&
    perf.data.priorResults.length === 1,
  '小数分档明确且重新发布保留历史',
);
let current = await ok('sales', {
  action: 'self_review',
  month,
  scores: full,
  note: '本月过程自评',
});
await denied(
  'manager',
  {
    action: 'publish',
    id: current.id,
    version: current.version,
    scores: full,
    note: '提前发布',
  },
  400,
  '尚未结月不能发布最终结果',
);
// A forced audit failure must roll back the record write.
const before = db.prepare('SELECT COUNT(*) AS n FROM sales_records').get().n;
db.exec(
  "CREATE TRIGGER sales_qa_fail BEFORE INSERT ON member_audit WHEN json_extract(NEW.data,'$.action')='sales_record' BEGIN SELECT RAISE(ABORT,'qa_atomic_failure'); END;",
);
await denied(
  'sales2',
  { action: 'activity', date: today, data: activity },
  503,
  '审计写入失败时返回失败',
);
check(
  db.prepare('SELECT COUNT(*) AS n FROM sales_records').get().n === before,
  '审计失败完整回滚工作记录',
);
db.exec('DROP TRIGGER sales_qa_fail');
let restored = await ok('sales2', {
  action: 'activity',
  date: today,
  data: activity,
});
check(restored.status === 'submitted', '数据库恢复后可重试提交');
const raceAssessment = await ok('sales2', {
  action: 'self_review',
  month: '2026-08',
  scores: full,
  note: '并发发布验收自评',
});
const publicationRace = await Promise.all([
  request('manager', '/api/sales', {
    action: 'publish',
    id: raceAssessment.id,
    version: raceAssessment.version,
    scores: full,
    note: '并发月结验收',
  }),
  request('sales2', '/api/sales', {
    action: 'activity',
    date: '2026-08-20',
    data: activity,
  }),
]);
check(
  publicationRace.filter((r) => r.status === 200).length === 1 &&
    publicationRace.every((r) => [200, 400, 409].includes(r.status)),
  '并发月结与补录只有一个成功，避免发布后加入未核实材料',
);
const raceRecords = (await get('sales2', '2026-08')).records;
check(
  !(
    raceRecords.some(
      (r) => r.kind === 'performance' && r.status === 'published',
    ) &&
    raceRecords.some(
      (r) => r.kind !== 'performance' && r.status === 'submitted',
    )
  ),
  '并发后数据库不存在已发布月份与新增待审核依据并存',
);
check(
  (await get('manager', '2026-09', users.sales.id)).people.every(
    (p) => !('email' in p) && !('phone' in p),
  ),
  '考核成员列表不泄露账号联络字段',
);
check(
  db
    .prepare(
      "SELECT COUNT(*) AS n FROM member_audit WHERE workspace_id=? AND json_extract(data,'$.action')='sales_record'",
    )
    .get(ws).n > 20,
  '提交审核变更均记录审计轨迹',
);
const report = blankReport();
Object.assign(report.values, {
  weeklyExpected: 3,
  weeklySubmitted: 3,
  weeklyMissing: 0,
  weeklyLate: 0,
  oldTotal: 8,
  oldPeer: 1,
  oldDesign: 5,
  oldOwner: 1,
  oldPurchase: 1,
  newTotal: 23,
  newPeer: 1,
  newDesign: 1,
  newOwner: 18,
  newPurchase: 3,
  effectiveVisits: 31,
});
report.notes.new = '虚构客户清单；其中电联家数待核实';
const monthlyData = { ...weeklyData, report };
for (const [value, label] of [
  [-1, '负数'],
  [1.5, '小数'],
  ['3', '字符串'],
  [100001, '过大数量'],
]) {
  await denied(
    'sales2',
    {
      action: 'monthly',
      month: '2026-09',
      data: {
        ...monthlyData,
        report: {
          ...report,
          values: { ...report.values, manufacturer: value },
        },
      },
    },
    400,
    '报告拒绝' + label,
  );
}
await denied(
  'sales2',
  { action: 'monthly', month: '2026-09', data: weeklyData },
  400,
  '新月报必须带结构化表格',
);
for (const values of [
  { oldTotal: 9 },
  { oldPeer: 9, oldDesign: null },
  { newPhone: 24 },
  { weeklyLate: 4 },
  { weeklyMissing: 1 },
]) {
  await denied(
    'sales2',
    {
      action: 'monthly',
      month: '2026-09',
      data: {
        ...monthlyData,
        report: { ...report, values: { ...report.values, ...values } },
      },
    },
    400,
    '拒绝分类合计或其中项不一致 ' + JSON.stringify(values),
  );
}
await denied(
  'manager',
  { action: 'monthly', month: '2026-09', data: monthlyData },
  403,
  '管理不能代填销售月报',
);
await denied(
  'sales2',
  { action: 'monthly', month: '2099-01', data: monthlyData },
  400,
  '月报拒绝未来月份',
);
const monthlyRace = await Promise.all([
  request('sales2', '/api/sales', {
    action: 'monthly',
    month: '2026-09',
    data: monthlyData,
  }),
  request('sales2', '/api/sales', {
    action: 'monthly',
    month: '2026-09',
    data: monthlyData,
  }),
]);
check(
  monthlyRace
    .map((r) => r.status)
    .sort()
    .join(',') === '200,409',
  '同成员同月月报并发只生成一份',
);
let monthlyReport = monthlyRace.find((r) => r.status === 200).body.record;
check(
  monthlyReport.data.report.values.newTotal === 23 &&
    monthlyReport.data.report.values.proposals === null &&
    monthlyReport.data.report.values.weeklyMissing === 0,
  '月报分类数量、空白和零分别持久化',
);
check(
  !monthlyReport.data.late &&
    monthlyReport.data.submittedAt !== monthlyData.submittedAt,
  '月报服务端留时且不捏造迟交规则',
);
check(
  (await get('sales2')).evidence.weeklyExpected === 4 &&
    (await get('sales2')).evidence.weeklySubmitted === 0,
  '人工报告应交三份不覆盖系统整月周报统计',
);
await denied(
  'hn',
  {
    action: 'review',
    id: monthlyReport.id,
    version: monthlyReport.version,
    note: '越界审核',
  },
  404,
  '月报沿用分部审核范围',
);
await denied(
  'sales',
  {
    action: 'monthly',
    id: monthlyReport.id,
    version: monthlyReport.version,
    month: '2026-09',
    data: monthlyData,
  },
  404,
  '不能修改其他人的月报',
);
await denied(
  'sales2',
  {
    action: 'monthly',
    id: monthlyReport.id,
    version: monthlyReport.version,
    month: '2026-10',
    data: monthlyData,
  },
  400,
  '不能移动已存月报到其他月份',
);
let reportPerformance = await ok('sales2', {
  action: 'self_review',
  month: '2026-09',
  scores: full,
  note: '月报配套考核',
});
await denied(
  'manager',
  {
    action: 'publish',
    id: reportPerformance.id,
    version: reportPerformance.version,
    scores: full,
    note: '核定',
  },
  400,
  '待审核月报阻止发布绩效',
);
monthlyReport = await ok('manager', {
  action: 'review',
  id: monthlyReport.id,
  version: monthlyReport.version,
  note: '已核对分类客户清单',
});
await denied(
  'sales2',
  {
    action: 'monthly',
    id: monthlyReport.id,
    version: monthlyReport.version,
    month: '2026-09',
    data: monthlyData,
  },
  400,
  '已核实月报必须先退回',
);
monthlyReport = await ok('manager', {
  action: 'return',
  id: monthlyReport.id,
  version: monthlyReport.version,
  note: '补充电联明细',
});
await denied(
  'sales2',
  {
    action: 'monthly',
    id: monthlyReport.id,
    version: 1,
    month: '2026-09',
    data: monthlyData,
  },
  409,
  '过期月报版本不能覆盖审核',
);
monthlyReport = await ok('sales2', {
  action: 'monthly',
  id: monthlyReport.id,
  version: monthlyReport.version,
  month: '2026-09',
  data: monthlyData,
});
check(
  monthlyReport.history.length === 4 &&
    monthlyReport.data.firstSubmittedAt ===
      monthlyRace.find((r) => r.status === 200).body.record.data
        .firstSubmittedAt,
  '月报退回重提保留首次时间及审核历史',
);
monthlyReport = await ok('manager', {
  action: 'review',
  id: monthlyReport.id,
  version: monthlyReport.version,
  note: '再次核实',
});
reportPerformance = await ok('manager', {
  action: 'publish',
  id: reportPerformance.id,
  version: reportPerformance.version,
  scores: full,
  note: '参考已核实月报人工评分',
});
check(
  reportPerformance.data.evidenceVersions.some(
    (r) => r.id === monthlyReport.id && r.version === monthlyReport.version,
  ),
  '绩效发布快照锁定月报版本',
);
await denied(
  'manager',
  {
    action: 'return',
    id: monthlyReport.id,
    version: monthlyReport.version,
    note: '修改已锁依据',
  },
  409,
  '绩效发布后月报被锁定',
);
await denied(
  'sales',
  { action: 'monthly', month: '2026-09', data: monthlyData },
  409,
  '已发布月份不能新增月报',
);
let structuredWeek = await ok('sales2', {
  action: 'weekly',
  week: '2026-10-05',
  data: monthlyData,
});
check(
  structuredWeek.data.report.values.newTotal === 23 && structuredWeek.data.late,
  '结构化周报数量持久化且不改变迟交计算',
);
const visitedBefore = (await get('sales2', month)).evidence.customersVisited;
for (const method of ['电话', '线上', '现场拜访']) {
  let visit = await ok('sales2', {
    action: 'activity',
    date: today,
    data: {
      ...activity,
      type: '客户拜访',
      customer: '沟通方式测试-' + method,
      customerStage: '新客户',
      customerCategory: '业主',
      contactMethod: method,
      focusIndustry: '数据中心',
    },
  });
  check(
    visit.data.contactMethod === method &&
      visit.data.focusIndustry === '数据中心',
    '工作记录保存客户分类与方式 ' + method,
  );
  await ok('manager', {
    action: 'review',
    id: visit.id,
    version: visit.version,
    note: '沟通方式核实',
  });
}
check(
  (await get('sales2', month)).evidence.customersVisited === visitedBefore + 1,
  '电话与线上不自动计作现场拜访家数',
);
if (process.env.QA_BROWSER_FIXTURE) {
  const f = resolve(process.env.QA_BROWSER_FIXTURE);
  if (!f.startsWith('/private/tmp/gushi-sales-qa/'))
    throw Error('Invalid fixture');
  writeFileSync(f, JSON.stringify({ base, password, users, workspace: ws }), {
    mode: 0o600,
  });
}
db.close();
console.log(JSON.stringify({ passed: passed.length, workspace: ws }));
