import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';
import sharp from 'sharp';
import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';
const database = resolve(process.env.DATABASE_PATH || '.'),
  base = process.env.QA_URL || 'http://127.0.0.1:5199';
if (
  process.env.RUN_LOCAL_TESTS !== '1' ||
  !database.startsWith('/private/tmp/gushi-access-qa/') ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error('仅允许隔离测试环境');
const db = openSqlite(database),
  ws = 'images-' + randomUUID(),
  now = new Date().toISOString(),
  password = 'ImagesQA!' + randomUUID(),
  hash = await hashPassword(password),
  users = {},
  passed = [];
const check = (v, label) => {
  if (!v) throw Error('FAIL ' + label);
  passed.push(label);
  console.log('PASS ' + label);
};
for (const [key, role, region, desks] of [
  ['manager', 'management', '全部分部'],
  ['sales', 'sales', '广州总部'],
  ['ops', 'operations', '广州总部'],
  ['ops2', 'operations', '广州总部'],
  ['hn', 'management', '湖南分部'],
  ['finance', 'finance', '全部分部'],
  ['dual', 'finance', '广州总部', ['finance', 'operations']],
  ['outside', 'management', '全部分部'],
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
async function request(key, path, body, files, desk, origin = base) {
  const multipart = files !== undefined;
  let content;
  if (multipart) {
    content = new FormData();
    content.set('payload', JSON.stringify(body));
    for (const f of files)
      content.append('images', new Blob([f.bytes], { type: f.type }), f.name);
  } else if (body) content = JSON.stringify(body);
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(key ? { Cookie: users[key].cookie } : {}),
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
      ...(body
        ? {
            Origin: origin,
            ...(multipart ? {} : { 'Content-Type': 'application/json' }),
          }
        : {}),
    },
    body: content,
    redirect: 'manual',
  });
  return {
    status: r.status,
    headers: r.headers,
    data: r.headers.get('content-type')?.startsWith('image/')
      ? Buffer.from(await r.arrayBuffer())
      : await r.json(),
  };
}
for (const u of Object.values(users)) {
  const r = await request(null, '/api/auth', {
    action: 'login',
    identifier: u.email,
    password,
  });
  if (r.status !== 200) throw Error('login');
  u.cookie = r.headers.get('set-cookie').split(';')[0];
}
const png = {
  name: '现场记录.png',
  type: 'image/png',
  bytes: await sharp({
    create: { width: 160, height: 100, channels: 3, background: '#176452' },
  })
    .png()
    .toBuffer(),
};
const jpeg = {
  name: '验收照片.jpg',
  type: 'image/jpeg',
  bytes: await sharp({
    create: { width: 120, height: 80, channels: 3, background: '#dfad61' },
  })
    .withMetadata({ orientation: 6 })
    .jpeg()
    .toBuffer(),
};
const webp = {
  name: '补充图片.webp',
  type: 'image/webp',
  bytes: await sharp(png.bytes).webp().toBuffer(),
};
let r = await request('sales', '/api/tasks', {
  action: 'create',
  data: {
    title: '现场处理图片验收',
    request: '请完成处理并附图片',
    desk: 'operations',
    region: '广州总部',
    dueDate: now.slice(0, 10),
    assigneeId: users.ops.id,
  },
});
check(r.status === 200, '销售创建可附图任务');
let task = r.data.task;
const feedback = (t = task, extra = {}) => ({
  action: 'feedback',
  id: t.id,
  version: t.version,
  status: '处理中',
  result: '现场工作已处理，详见图片',
  ...extra,
});
const denied = async (key, body, files, status, label, desk) =>
  check(
    (await request(key, '/api/tasks', body, files, desk)).status === status,
    label,
  );
await denied(null, feedback(), [png], 401, '未登录不能上传');
await denied('ops2', feedback(), [png], 404, '同台非承办人不能上传（V2 inTaskScope 边界）');
await denied('sales', feedback(), [png], 403, '销售下发人不能代替承办台上传');
await denied('dual', feedback(), [png], 404, '非承办岗位不能上传');
await denied('outside', feedback(), [png], 404, '跨公司不能上传');
check(
  (
    await request(
      'ops',
      '/api/tasks',
      feedback(),
      [png],
      undefined,
      'https://evil.invalid',
    )
  ).status === 403,
  '跨站上传被拒绝',
);
await denied(
  'ops',
  feedback(),
  [{ name: 'x.svg', type: 'image/svg+xml', bytes: Buffer.from('<svg/>') }],
  400,
  '拒绝SVG上传',
);
await denied(
  'ops',
  feedback(),
  [{ ...png, bytes: Buffer.from('<svg/>') }],
  400,
  '拒绝伪装图片',
);
await denied(
  'ops',
  feedback(),
  [{ ...png, bytes: png.bytes.subarray(0, 20) }],
  400,
  '拒绝损坏图片',
);
await denied(
  'ops',
  feedback(),
  [{ ...png, bytes: Buffer.alloc(5 * 1024 * 1024 + 1) }],
  413,
  '每张超过5MB被拒绝',
);
await denied('ops', feedback(), Array(7).fill(png), 400, '超过六张被拒绝');
await denied(
  'ops',
  feedback(task, { status: '待验收', result: '' }),
  [png],
  400,
  '附图也需填写文字结果后提交验收',
);
r = await request('ops', '/api/tasks', feedback(), [png, jpeg]);
check(r.status === 200, '两张图片随保存进展成功');
task = r.data.task;
check(
  task.images.length === 2 && task.history.at(-1).images.length === 2,
  '当前结果与历史均保存图片元数据',
);
check(
  task.images[1].width === 80 && task.images[1].height === 120,
  '照片按EXIF方向自动旋转',
);
const url = '/api/tasks/images/' + task.images[0].id;
r = await request('manager', url);
check(
  r.status === 200 && r.headers.get('content-type') === 'image/webp',
  '管理可查看重新编码的图片',
);
const meta = await sharp(r.data).metadata();
check(
  !meta.exif && meta.format === 'webp',
  '已去除EXIF且不是直接返回原始上传内容',
);
check(
  r.headers.get('cache-control').includes('no-store') &&
    r.headers.get('x-content-type-options') === 'nosniff',
  '私有图片不缓存且禁MIME猜测',
);
check((await request('sales', url)).status === 200, '下发人可查看任务图片');
check(
  (await request('ops2', url)).status === 404,
  '同台非承办人不能查看任务图片（V2 边界）',
);
check(
  (await request('hn', url)).status === 200,
  '管理岗位可查看任务图片（V2 公司范围）',
);
for (const key of ['finance', 'outside'])
  check((await request(key, url)).status === 404, key + '不能越权读取图片');
check((await request(null, url)).status === 401, '未登录不能读取图片');
check(
  (await request('dual', url)).status === 404,
  '兼岗默认财务台不可读取运营任务图片',
);
check(
  (await request('dual', url + '?desk=operations')).status === 404,
  '兼岗但非承办人不能查看任务图片（V2 边界）',
);
check(
  (await request('finance', url + '?desk=operations')).status === 403,
  '伪造工作台参数不能扩大授权',
);
await denied(
  'ops',
  feedback(task, { retainedImageIds: [randomUUID()] }),
  [],
  400,
  '不能引用不属于结果的图片',
);
await denied(
  'ops',
  feedback(task, { retainedImageIds: [task.images[0].id, task.images[0].id] }),
  [],
  400,
  '重复引用图片被拒绝',
);
const previous = task;
r = await request(
  'ops',
  '/api/tasks',
  feedback(task, { retainedImageIds: [task.images[1].id] }),
  [webp],
);
check(r.status === 200, '可移除当前图片并补充新图');
task = r.data.task;
check(
  task.images.length === 2 &&
    task.history[1].images[0].id === previous.images[0].id,
  '移除当前结果图片不抹去原提交历史',
);
check((await request('manager', url)).status === 200, '历史图片仍可核查');
await denied('ops', feedback(previous), [png], 409, '过期版本上传被拒绝');
const before = db
  .prepare('SELECT COUNT(*) n FROM task_images WHERE workspace_id=?')
  .get(ws).n;
const race = await Promise.all([
  request('ops', '/api/tasks', feedback(), [png]),
  request('ops', '/api/tasks', feedback(), [webp]),
]);
check(
  race.filter((r) => r.status === 200).length === 1 &&
    race.some((r) => r.status === 409),
  '并发保存只有一次成功',
);
task = race.find((r) => r.status === 200).data.task;
check(
  db.prepare('SELECT COUNT(*) n FROM task_images WHERE workspace_id=?').get(ws)
    .n ===
    before + 1,
  '失败的并发请求没有孤立图片',
);
const count = db
  .prepare('SELECT COUNT(*) n FROM task_images WHERE workspace_id=?')
  .get(ws).n;
db.exec(
  "CREATE TRIGGER qa_image_fail BEFORE INSERT ON task_images BEGIN SELECT RAISE(ABORT,'qa_image_write_fail'); END;",
);
await denied('ops', feedback(), [png], 503, '图片写入故障返回失败');
check(
  db.prepare('SELECT version FROM desk_tasks WHERE id=?').get(task.id)
    .version === task.version &&
    db
      .prepare('SELECT COUNT(*) n FROM task_images WHERE workspace_id=?')
      .get(ws).n === count,
  '图片故障原子回滚任务与附件',
);
db.exec('DROP TRIGGER qa_image_fail');
r = await request('ops', '/api/tasks', feedback(task, { status: '待验收' }), [
  png,
]);
check(r.status === 200, '恢复后带图提交验收');
task = r.data.task;
await denied('ops', feedback(), [png], 400, '待验收结果不能继续追加图片');
r = await request('manager', '/api/tasks', {
  action: 'return',
  id: task.id,
  version: task.version,
  note: '补充照片说明',
});
check(
  r.status === 200 && r.data.task.images.length === task.images.length,
  '退回保留图片',
);
task = r.data.task;
r = await request('ops', '/api/tasks', feedback(task, { status: '待验收' }));
check(
  r.status === 200 && r.data.task.images.length === task.images.length,
  '旧JSON反馈客户端不传图片时保留已有图片',
);
task = r.data.task;
r = await request('manager', '/api/tasks', {
  action: 'accept',
  id: task.id,
  version: task.version,
  note: '图文核实完成',
});
check(r.status === 200, '管理可验收带图任务');
task = r.data.task;
await denied('ops', feedback(), [png], 400, '已完成任务不能追加图片');
db.prepare("UPDATE members SET status='disabled' WHERE id=?").run(
  users.ops2.id,
);
check((await request('ops2', url)).status === 403, '停用成员立即失去图片权限');
check(
  !JSON.stringify((await request('manager', '/api/tasks')).data).includes(
    'content_base64',
  ),
  '任务列表不夹带图片二进制',
);
writeFileSync(
  '/private/tmp/gushi-access-qa/task-images-browser.json',
  JSON.stringify({ base, password, users, taskId: task.id }),
  { mode: 0o600 },
);
writeFileSync('/private/tmp/gushi-access-qa/现场测试图片.png', png.bytes);
db.close();
console.log(JSON.stringify({ passed: passed.length }));
