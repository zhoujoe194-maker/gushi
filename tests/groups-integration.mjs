import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';
import { randomUUID } from 'node:crypto';
if (
  process.env.RUN_LOCAL_TESTS !== '1' ||
  !process.env.DATABASE_PATH?.match(/^\/private\/tmp\/gushi-message-qa\//)
)
  throw Error('仅允许隔离的本机群聊测试数据库');
const base = process.env.QA_URL || 'http://127.0.0.1:5187';
if (!/^http:\/\/127\.0\.0\.1:\d+$/.test(base)) throw Error('仅支持本机测试');
const db = openSqlite(process.env.DATABASE_PATH),
  now = new Date().toISOString(),
  password = 'GroupQA!' + randomUUID(),
  hash = await hashPassword(password),
  workspace = 'groups-qa-' + Date.now(),
  users = {};
for (const [name, role, region] of [
  ['sales', 'sales', '广州总部'],
  ['sales2', 'sales', '湖南分部'],
  ['finance', 'finance', '全部分部'],
  ['ops', 'operations', '广州总部'],
  ['manager', 'management', '全部分部'],
  ['owner', 'owner', '全部分部'],
  ['branch', 'branch_manager', '湖南分部'],
  ['multi', 'sales', '广州总部'],
  ['external', 'sales', '广州总部'],
  ['disabled', 'finance', '全部分部'],
]) {
  const id = workspace + '-' + name,
    email = id + '@example.invalid';
  db.prepare(
    'INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,?,1,?,?,?,?,?)',
  ).run(
    id,
    name === 'external' ? workspace + '-other' : workspace,
    email,
    name,
    role,
    region,
    name === 'disabled' ? 'disabled' : 'active',
    now,
    now,
    now,
    name === 'multi' ? JSON.stringify(['sales', 'operations']) : null,
    name === 'multi' ? 'sales' : null,
  );
  db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id, hash, now);
  users[name] = { id, email };
}
db.close();
const passed = [];
function check(value, label) {
  if (!value) throw Error(label);
  passed.push(label);
  console.log('PASS ' + label);
}
async function req(user, body, path = '/api/messages', desk, origin = base) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(user ? { Cookie: users[user].cookie } : {}),
      ...(body ? { Origin: origin, 'Content-Type': 'application/json' } : {}),
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: r.status, data: await r.json() };
}
async function ok(user, body, path = '/api/messages', desk) {
  const result = await req(user, body, path, desk);
  if (result.status !== 200)
    throw Error(result.status + ' ' + JSON.stringify(result.data));
  return result.data;
}
for (const [name, u] of Object.entries(users)) {
  if (name === 'disabled') continue;
  const r = await fetch(base + '/api/auth', {
    method: 'POST',
    headers: { Origin: base, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'login', identifier: u.email, password }),
  });
  if (!r.ok) throw Error('login ' + name + ' ' + r.status);
  u.cookie = r.headers.get('set-cookie').split(';')[0];
}
const ids = (...names) => names.map((n) => users[n].id),
  key = (n) => 'person:' + users[n].id;
const project = (
  await ok(
    'sales',
    {
      action: 'create',
      data: {
        name: '群聊权限测试项目',
        location: '广州',
        type: '工业厂房',
        source: '老客户',
        owner: 'sales',
        stage: '商务谈判',
        amount: 20,
        customer: 'QA客户',
        designer: '',
        contractor: '',
        contact: '',
        phone: '',
        nextAction: '确认参数',
        nextDate: '2026-12-01',
        notes: '',
        opportunities: [],
        workflow: {
          region: '广州总部',
          assignments: {},
          assignmentMembers: {},
          tasks: [],
          checklist: {},
          facts: {},
          milestones: {},
        },
      },
    },
    '/api/workspace',
  )
).project;
const creation = {
  action: 'group-create',
  name: '测试协作群',
  projectId: project.id,
  memberIds: ids('sales', 'ops', 'finance', 'manager', 'multi', 'sales2'),
  clientId: randomUUID(),
};
check((await req(null, creation)).status === 401, '匿名用户不能建群');
check(
  (await req('ops', { ...creation, memberIds: ids('ops', 'sales') })).status ===
    403,
  '运营不能建群',
);
check(
  (await req('finance', { ...creation, memberIds: ids('finance', 'sales') }))
    .status === 403,
  '财务不能建群',
);
check(
  (await req('sales2', { ...creation, memberIds: ids('sales2', 'finance') }))
    .status === 404,
  '销售不能用不可见的项目建群',
);
check(
  (await req('branch', {
    ...creation,
    clientId: randomUUID(),
    memberIds: ids('branch', 'finance'),
  })).status === 200,
  'V2 公司管理可在公司项目内建群',
);
check(
  (await req('sales', { ...creation, memberIds: ids('sales', 'external') }))
    .status === 400,
  '不能加入其他公司成员',
);
check(
  (await req('sales', { ...creation, memberIds: ids('sales', 'disabled') }))
    .status === 400,
  '不能加入停用成员',
);
check(
  (await req('sales', { ...creation, memberIds: ids('ops', 'finance') }))
    .status === 400,
  '创建者自动入群规则由服务端保护',
);
check(
  (await req('sales', { ...creation, memberIds: ids('sales') })).status === 400,
  '群至少需要两位成员',
);
check(
  (await req('sales', { ...creation, memberIds: ids('sales', 'sales') }))
    .status === 400,
  '拒绝重复成员',
);
check(
  (await req('sales', { ...creation, name: '  ' })).status === 400,
  '群名称不能为空',
);
check(
  (
    await req(
      'sales',
      creation,
      '/api/messages',
      undefined,
      'https://evil.invalid',
    )
  ).status === 403,
  '跨站建群被拒绝',
);
const { threadId } = await ok('sales', creation);
check(threadId === creation.clientId, '销售可创建项目群');
check(
  (await ok('sales', creation)).threadId === threadId,
  '建群网络重试不会产生重复群',
);
check(
  (await req('sales', { ...creation, name: '冲突名称' })).status === 409,
  '建群标识冲突被拒绝',
);
let inbox = await ok('sales');
let group = inbox.threads.find((t) => t.id === threadId);
check(
  group.group.members.length === 6 &&
    group.group.canManage &&
    group.group.projectName === project.name,
  '创建者看到完整成员和项目关联',
);
check(group.lastMessage.kind === 'system', '创建群留下系统记录');
check(
  group.group.members.every((p) => !('email' in p) && !('phone' in p)),
  '群成员资料不暴露账号联系方式',
);
for (const outsider of ['owner', 'branch', 'external']) {
  check(
    !(await ok(outsider)).threads.some((t) => t.id === threadId),
    '非成员 ' + outsider + ' 不自动看到项目群',
  );
  check(
    (await req(outsider, undefined, '/api/messages?threadId=' + threadId))
      .status === 404,
    '非成员 ' + outsider + ' 不能读取群记录',
  );
  check(
    (
      await req(outsider, {
        action: 'read',
        threadId,
        upTo: group.lastMessage.seq,
      })
    ).status === 404,
    '非成员 ' + outsider + ' 不能标记群已读',
  );
}
check(
  !(await ok('ops')).threads.some((t) => t.id === threadId) &&
    (await req('ops', undefined, '/api/messages?threadId=' + threadId))
      .status === 404,
  '入群不扩大项目资料权限（V2 边界：无权项目群不可见不可读）',
);
check(
  (await req('ops', undefined, '/api/workspace')).data.projects.every(
    (p) => p.id !== project.id,
  ),
  '入群后项目主档权限保持原状',
);
check(
  !(await ok('multi')).threads.some((t) => t.id === threadId),
  '群聊可见性仍受项目主档权限限制（V2 边界）',
);
const sendInput = {
  action: 'send',
  threadId,
  fromKey: key('finance'),
  body: '财务已加入，开始核对交期',
  clientId: randomUUID(),
};
const sent = await ok('finance', sendInput);
check(sent.message.actorId === users.finance.id, '群成员可用本人身份发言');
check(
  (await ok('finance', sendInput)).message.seq === sent.message.seq,
  '群消息网络重试保持幂等',
);
check(
  (await req('finance', { ...sendInput, body: '另一个内容' })).status === 409,
  '群消息标识冲突被拒绝',
);
check(
  (
    await req('finance', {
      ...sendInput,
      clientId: randomUUID(),
      fromKey: 'desk:operations',
    })
  ).status === 403,
  '群内不能冒充整个工作台',
);
check(
  (
    await req('owner', {
      ...sendInput,
      clientId: randomUUID(),
      fromKey: key('owner'),
    })
  ).status === 404,
  '管理员未入群不能发言',
);
check(
  (
    await req('sales2', {
      action: 'send',
      threadId,
      fromKey: key('sales2'),
      body: '越权关联项目消息',
      projectId: project.id,
      clientId: randomUUID(),
    })
  ).status === 404,
  '无权查看项目的群成员不能附加项目（V2 边界）',
);
check(
  (await ok('finance')).threads.find((t) => t.id === threadId).unread === 1,
  '每人分别累计群消息未读',
);
await ok('finance', { action: 'read', threadId, upTo: sent.message.seq });
check(
  (await ok('finance')).threads.find((t) => t.id === threadId).unread === 0 &&
    (await ok('manager')).threads.find((t) => t.id === threadId).unread === 2,
  '群已读回执只影响本人',
);
const update = {
  action: 'group-update',
  threadId,
  name: '交付协作群',
  memberIds: ids('sales', 'finance', 'manager', 'multi', 'sales2'),
  version: 1,
};
check((await req('finance', update)).status === 403, '普通群成员不能修改成员');
check(
  (await req('sales2', update)).status === 404,
  '无权项目成员不能管理项目群（V2 边界）',
);
check((await req('owner', update)).status === 404, '未入群管理员不能修改群');
check(
  (await req('manager', { ...update, memberIds: ids('manager', 'finance') }))
    .status === 400,
  '群管理不能移除群主',
);
await ok('manager', update);
check(
  (await ok('sales')).threads.find((t) => t.id === threadId).group.name ===
    '交付协作群',
  '群内管理人员可改名并移出成员',
);
check(
  !(await ok('ops')).threads.some((t) => t.id === threadId),
  '移出后会话和未读立即不可见',
);
check(
  (await req('ops', undefined, '/api/messages?threadId=' + threadId)).status ===
    404,
  '移出后无法读取历史',
);
check(
  (
    await req('ops', {
      action: 'send',
      threadId,
      fromKey: key('ops'),
      body: '移出后尝试发言',
      clientId: randomUUID(),
    })
  ).status === 404,
  '移出后无法继续发言',
);
check(
  (await req('ops', { action: 'read', threadId, upTo: sent.message.seq }))
    .status === 404,
  '移出后不能写已读回执',
);
check(
  (await req('sales', update)).status === 409,
  '旧版本群设置不能覆盖新版本',
);
await ok('sales', {
  ...update,
  name: '交付协作群',
  memberIds: ids('sales', 'finance', 'manager', 'multi', 'sales2', 'branch'),
  version: 2,
});
check(
  (
    await ok('branch', undefined, '/api/messages?threadId=' + threadId)
  ).messages.some((m) => m.id === sent.message.id),
  '新加入且有项目权限的成员可以看到此前历史',
);
check(
  (await req('ops', undefined, '/api/messages?threadId=' + threadId))
    .status === 404,
  '无项目权限的成员即使被加入群也不能读取历史（V2 边界）',
);
const races = await Promise.all([
  req('sales', { ...update, name: '并发A', version: 3 }),
  req('manager', {
    ...update,
    name: '并发B',
    memberIds: ids('sales', 'manager', 'ops'),
    version: 3,
  }),
]);
check(
  races.filter((r) => r.status === 200).length === 1 &&
    races.filter((r) => r.status === 409).length === 1,
  '并发修改只有一个版本成功',
);
const winner =
  races[0].status === 200
    ? {
        name: '并发A',
        ids: ids('sales', 'finance', 'manager', 'multi', 'sales2'),
      }
    : { name: '并发B', ids: ids('sales', 'manager', 'ops') };
group = (await ok('sales')).threads.find((t) => t.id === threadId);
check(
  group.group.name === winner.name &&
    JSON.stringify(group.group.members.map((m) => m.id).sort()) ===
      JSON.stringify(winner.ids.sort()),
  '失败的并发修改没有污染成员名单',
);
const managerCreation = {
  ...creation,
  clientId: randomUUID(),
  memberIds: ids('manager', 'sales'),
};
check(
  !!(await ok('manager', managerCreation)).threadId,
  '管理人员也能为可见项目建群',
);
const audit = openSqlite(process.env.DATABASE_PATH);
audit
  .prepare("UPDATE members SET status='disabled',version=version+1 WHERE id=?")
  .run(users.manager.id);
audit.close();
check(
  (await req('manager', undefined, '/api/messages?threadId=' + threadId))
    .status === 403,
  '停用账号无法读取其群聊',
);
console.log(JSON.stringify({ passed: passed.length, workspace, threadId }));
