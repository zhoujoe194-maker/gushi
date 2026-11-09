import { spawn, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID, randomBytes } from 'node:crypto';
import { openSqlite } from '../runtime/sqlite.mjs';

if (process.env.RUN_LOCAL_TESTS !== '1') throw Error('仅限隔离的本机启用验收');
const root = fileURLToPath(new URL('..', import.meta.url));
const build = process.env.QA_BUILD_DIR || '.next-production';
if (!['.next-production', '.next-setup-qa'].includes(build))
  throw Error('Invalid build directory');
mkdirSync('/private/tmp/gushi-setup-qa', { recursive: true });
const folder = mkdtempSync('/private/tmp/gushi-setup-qa/run-');
const port = process.env.QA_SETUP_PORT || '5194';
if (!/^\d{4,5}$/.test(port)) throw Error('Invalid port');
const base = 'http://127.0.0.1:' + port,
  origin = 'https://setup-qa.invalid';
const token = randomBytes(32).toString('base64url'),
  email = 'first-admin@example.invalid';
const password = 'PersonalQA!' + randomUUID(),
  passed = [];
const valid = {
  token,
  name: '张明',
  confirmName: true,
  password,
  confirmPassword: password,
};
function check(value, label) {
  if (!value) throw Error(label);
  passed.push(label);
  console.log('PASS ' + label);
}
const standalone = resolve(root, build, 'standalone');
mkdirSync(join(standalone, build), { recursive: true });
cpSync(resolve(root, build, 'static'), join(standalone, build, 'static'), {
  recursive: true,
});
cpSync(resolve(root, 'public'), join(standalone, 'public'), {
  recursive: true,
});

async function scenario(name, extra, run) {
  const database = join(folder, name + '.sqlite');
  const env = {
    ...process.env,
    DATABASE_PATH: database,
    NODE_ENV: 'production',
    APP_ORIGIN: origin,
    PORT: port,
    HOSTNAME: '127.0.0.1',
    INITIAL_ADMIN_EMAIL: email,
    INITIAL_SETUP_TOKEN: token,
    ...extra,
  };
  const migration = spawnSync(
    process.execPath,
    [resolve(root, 'scripts/selfhost-migrate.mjs')],
    { cwd: root, env, encoding: 'utf8' },
  );
  if (migration.status !== 0) throw Error(migration.stderr);
  const child = spawn(process.execPath, [join(standalone, 'server.js')], {
    cwd: root,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  child.stderr.on('data', (b) => {
    output += b;
  });
  child.stdout.on('data', (b) => {
    output += b;
  });
  const db = openSqlite(database);
  try {
    let started = false;
    for (let i = 0; i < 80; i++) {
      try {
        if ((await fetch(base + '/setup')).status === 200) {
          started = true;
          break;
        }
      } catch {}
      if (child.exitCode !== null) throw Error(output);
      await new Promise((r) => setTimeout(r, 100));
    }
    if (!started) throw Error('Setup server not ready');
    await run(db);
  } finally {
    db.close();
    if (child.exitCode === null) {
      child.kill('SIGTERM');
      await new Promise((r) => child.once('exit', r));
    }
  }
}
async function request(
  body,
  cookie,
  path = '/api/setup',
  requestOrigin = origin,
) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(body
        ? { Origin: requestOrigin, 'Content-Type': 'application/json' }
        : {}),
      ...(cookie ? { Cookie: cookie } : {}),
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

await scenario('missing-token', { INITIAL_SETUP_TOKEN: '' }, async (db) => {
  check(
    (await (await fetch(base + '/setup')).text()).includes('等待启用配置'),
    '未配置启用码时显示配置提示',
  );
  check((await request(valid)).status === 503, '缺少启用码不能初始化');
  check(
    db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 0,
    '缺配置不创建账号',
  );
});
await scenario(
  'weak-token',
  { INITIAL_SETUP_TOKEN: 'a'.repeat(32) },
  async () => {
    check((await request(valid)).status === 503, '拒绝重复字符的弱启用码配置');
  },
);
await scenario('missing-email', { INITIAL_ADMIN_EMAIL: '' }, async () => {
  check((await request(valid)).status === 503, '未预设管理员邮箱时不能初始化');
});
await scenario('limits', {}, async (db) => {
  const html = await (await fetch(base + '/setup')).text();
  check(
    html.includes('设置首位管理员') && html.includes('f***@example.invalid'),
    '启用页面显示预设账号提示',
  );
  check(
    !html.includes(token) && !html.includes(email),
    '页面不暴露启用码或完整预设邮箱',
  );
  const home = await fetch(base, { redirect: 'manual' });
  check(
    home.status === 307 && home.headers.get('location') === '/setup',
    '全新网站首页自动进入启用向导',
  );
  check(
    (await request(valid, undefined, '/api/setup', 'https://evil.invalid'))
      .status === 403,
    '跨站初始化被拒绝',
  );
  const wrong = await request({ ...valid, token: 'incorrect-code' });
  check(
    wrong.status === 403 && !JSON.stringify(wrong.body).includes(token),
    '错误启用码被拒绝且不回显秘密',
  );
  for (let i = 0; i < 9; i++)
    await request({ ...valid, token: 'incorrect-code' });
  check((await request(valid)).status === 429, '重复尝试触发 15 分钟限制');
  check(
    db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 0,
    '限流及失败请求没有创建账号',
  );
});
await scenario('validation', {}, async () => {
  check(
    (await request({ ...valid, name: '管理员' })).status === 400,
    '启用需要本人真实姓名',
  );
  check(
    (await request({ ...valid, confirmName: false })).status === 400,
    '启用需要确认真实姓名',
  );
  check(
    (await request({ ...valid, password: 'short', confirmPassword: 'short' }))
      .status === 400,
    '个人密码至少 12 位',
  );
  check(
    (await request({ ...valid, confirmPassword: 'DifferentPassword!' }))
      .status === 400,
    '两次个人密码必须一致',
  );
  check(
    (await request({ ...valid, password: token, confirmPassword: token }))
      .status === 400,
    '个人密码不能复用启用码',
  );
  const large = await fetch(base + '/api/setup', {
    method: 'POST',
    headers: { Origin: origin },
    body: 'x'.repeat(10001),
  });
  check(large.status === 413, '过大的初始化请求被拒绝');
});
await scenario('atomic', {}, async (db) => {
  db.exec(
    "CREATE TRIGGER qa_fail_credentials BEFORE INSERT ON credentials BEGIN SELECT RAISE(ABORT, 'QA simulated failure'); END",
  );
  check((await request(valid)).status === 503, '中途数据库失败返回错误');
  for (const table of [
    'members',
    'credentials',
    'auth_sessions',
    'member_audit',
  ])
    check(
      db.prepare('SELECT COUNT(*) AS n FROM ' + table).get().n === 0,
      '初始化失败完整回滚 ' + table,
    );
  db.exec('DROP TRIGGER qa_fail_credentials');
  check((await request(valid)).status === 200, '数据库恢复后可以重新启用');
});
await scenario('concurrent', {}, async (db) => {
  const results = await Promise.all([
    request({ ...valid, email: 'attacker@example.invalid', role: 'sales' }),
    request({
      ...valid,
      email: 'second-attacker@example.invalid',
      role: 'management',
    }),
  ]);
  check(
    results
      .map((r) => r.status)
      .sort()
      .join(',') === '200,409',
    '并发启用仅一个成功',
  );
  const result = results.find((r) => r.status === 200);
  check(result.body.redirectTo === '/workspaces', '启用成功直接进入工作台选择');
  check(
    result.headers.get('set-cookie').includes('HttpOnly') &&
      result.headers.get('set-cookie').includes('Secure') &&
      result.headers.get('cache-control') === 'no-store',
    '启用会话安全标记和禁止缓存',
  );
  const owner = db.prepare('SELECT * FROM members').get();
  check(
    owner.email === email && owner.role === 'owner',
    '管理员邮箱和身份由服务端固定',
  );
  check(
    owner.name === '张明' && owner.profile_completed_at,
    '启用时已完成真实姓名确认',
  );
  const credential = db.prepare('SELECT * FROM credentials').get();
  check(
    credential.must_change === 0 &&
      !credential.password_hash.includes(password) &&
      credential.password_hash.startsWith('pbkdf2-sha256$600000$'),
    '个人密码仅保存加盐摘要，免重复改密',
  );
  check(
    db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 1 &&
      db.prepare('SELECT COUNT(*) AS n FROM credentials').get().n === 1 &&
      db.prepare('SELECT COUNT(*) AS n FROM auth_sessions').get().n === 1,
    '只创建一套管理员及会话记录',
  );
  const session = await request(undefined, result.cookie, '/api/session');
  check(
    session.status === 200 && session.body.member.assignedDesks.length === 5,
    '启用会话直接获得五台权限',
  );
  check(
    (await request(undefined, result.cookie, '/api/workspace')).status === 200,
    '无需再次输入初始密码即可进入业务',
  );
  const stored = JSON.stringify(db.prepare('SELECT * FROM member_audit').all());
  check(
    !stored.includes(token) && !stored.includes(password),
    '审计记录不保存启用码或密码',
  );
  const page = await fetch(base + '/setup', { redirect: 'manual' });
  check(
    page.status === 307 && page.headers.get('location') === '/',
    '启用后向导重定向回首页',
  );
  check(
    (
      await request({
        ...valid,
        password: 'ReplacementPassword!',
        confirmPassword: 'ReplacementPassword!',
      })
    ).status === 409,
    '启用码不能再次认领或重置管理员',
  );
  const logged = await request(
    { action: 'login', identifier: email, password },
    undefined,
    '/api/auth',
  );
  check(
    logged.status === 200 && logged.body.redirectTo === '/workspaces',
    '个人密码可以正常登录新管理员',
  );
  db.prepare("UPDATE members SET status='disabled'").run();
  check(
    (await request(valid)).status === 409,
    '停用管理员不会重新开放网页认领',
  );
});
await scenario('legacy', {}, async (db) => {
  const now = new Date().toISOString();
  db.prepare(
    "INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at) VALUES('old-member','old-workspace','old@example.invalid','老成员','sales','广州总部','disabled',1,?,?)",
  ).run(now, now);
  check(
    (await request(valid)).status === 409,
    '历史账号即使无管理员也阻止公开重建',
  );
  check(
    db.prepare('SELECT COUNT(*) AS n FROM members').get().n === 1,
    '不会改动已有成员数据',
  );
});
console.log(
  JSON.stringify({ passed: passed.length, temporaryDirectory: folder }),
);
