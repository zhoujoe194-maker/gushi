// D1 browser QA setup: build a disposable copy of the simulation database.
//
// SAFETY: the only database file ever written here is
//   /private/tmp/gushi-d1-browser/company.sqlite
// which is produced by copying the read-only simulation export
//   <workspace>/outputs/gushios-v2-phase3c/trial-before.sqlite
// The source export is never opened for writing. Test-only passwords are
// written only to the temporary copy, and the plaintext test password is
// stored only in /private/tmp/gushi-d1-browser/accounts.json (mode 0600).
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import {
  hashPassword,
  verifyPassword,
  passwordProblem,
} from '../app/server/password.ts';
import { openSqlite } from '../runtime/sqlite.mjs';

const repoRoot = resolve(fileURLToPath(new URL('.', import.meta.url)), '..');
const workspaceRoot = resolve(repoRoot, '..', '..');
const sourceDatabase = resolve(
  workspaceRoot,
  'outputs/gushios-v2-phase3c/trial-before.sqlite',
);
const destinationDirectory = '/private/tmp/gushi-d1-browser';
const database = resolve(destinationDirectory, 'company.sqlite');
const accountsFile = resolve(destinationDirectory, 'accounts.json');
const DEFAULT_PASSWORD = 'GushiD1-QA-2026!';

const passes = [];
function ok(label) {
  passes.push(label);
  console.log('PASS ' + label);
}
function fail(message) {
  console.error('FAIL ' + message);
  process.exit(1);
}
function assert(condition, message) {
  if (!condition) fail(message);
}

// Hard guard: refuse to touch any database path outside the designated
// temporary filename. This keeps real company databases and the simulation
// export itself out of reach even if this script is edited carelessly.
const ALLOWED_DATABASE = '/private/tmp/gushi-d1-browser/company.sqlite';
if (database !== ALLOWED_DATABASE) fail('拒绝写入非临时数据库路径：' + database);
assert(
  !sourceDatabase.startsWith('/private/tmp/gushi-d1-browser'),
  '模拟库源文件路径异常',
);
assert(existsSync(sourceDatabase), '缺少模拟数据库：' + sourceDatabase);
assert(statSync(sourceDatabase).isFile(), '模拟数据库不是普通文件');

const portalsOf = (desks) => [
  ...new Set(
    desks.map((d) =>
      d === 'sales' ? 'sales' : d === 'finance' ? 'finance' : 'management',
    ),
  ),
];
const parseDesks = (row) => {
  try {
    const value = JSON.parse(row.desks || 'null');
    return Array.isArray(value)
      ? value.filter((d) =>
          ['sales', 'management', 'finance', 'operations', 'aftersales'].includes(d),
        )
      : [];
  } catch {
    return [];
  }
};

// 1. Copy the read-only simulation export into the temporary QA database.
rmSync(database, { force: true });
rmSync(database + '-wal', { force: true });
rmSync(database + '-shm', { force: true });
mkdirSync(destinationDirectory, { recursive: true, mode: 0o700 });
copyFileSync(sourceDatabase, database);
ok('临时数据库已复制到 ' + database);
assert(!sourceDatabase.startsWith(destinationDirectory), '源库未被写入');

// 2. Apply migrations to the copy only.
const migration = spawnSync(
  process.execPath,
  ['scripts/selfhost-migrate.mjs'],
  {
    cwd: repoRoot,
    env: { ...process.env, DATABASE_PATH: database },
    encoding: 'utf8',
  },
);
if (migration.status !== 0)
  fail(
    '数据库迁移失败：' + (migration.stderr || migration.stdout || '未知错误').trim(),
  );
if ((migration.stdout || '').trim()) console.log(migration.stdout.trim());
ok('迁移脚本仅作用于临时副本');

// 3. Inspect members/desks and select one account per workbench.
const db = openSqlite(database);
const members = db
  .prepare(
    `SELECT m.id, m.email, m.name, m.role, m.region, m.status, m.desks,
            m.default_desk, m.profile_completed_at, c.member_id AS credential_id
       FROM members m
       LEFT JOIN credentials c ON c.member_id = m.id`,
  )
  .all()
  .map((row) => ({
    ...row,
    desks: parseDesks(row),
    portals: portalsOf(parseDesks(row)),
  }));

// Preferences are the dedicated trial accounts plus stable experience-company
// members; every candidate is re-validated against the copy before use.
const PREFERENCE = {
  sales: ['trial-sales', 'exp-person-4', 'exp-person-6', 'exp-person-9'],
  operations: ['exp-person-12', 'exp-person-13', 'exp-person-14'],
  aftersales: ['exp-person-15', 'exp-person-16'],
  management: ['trial-manager', 'exp-person-2', 'exp-person-3'],
  finance: ['trial-finance', 'exp-person-10', 'exp-person-11'],
};
const deskOfChoice = {
  sales: 'sales',
  operations: 'operations',
  aftersales: 'aftersales',
  management: 'management',
  finance: 'finance',
};
const usable = (m) => m && m.status === 'active' && !!m.credential_id;
function pickAccount(key) {
  const desk = deskOfChoice[key];
  for (const id of PREFERENCE[key]) {
    const candidate = members.find((m) => m.id === id);
    if (usable(candidate) && candidate.desks.includes(desk)) return candidate;
  }
  return members.find(
    (m) =>
      usable(m) &&
      m.desks.includes(desk) &&
      (desk === 'management' ? m.role === 'management' : m.role === desk),
  );
}
const chosen = {};
for (const key of Object.keys(PREFERENCE)) {
  const member = pickAccount(key);
  assert(member, '临时库中找不到可用的' + key + '账号');
  chosen[key] = member;
}
// Multi-workbench account: ideally an account granted all three workbenches so
// the /workspaces selector shows all three entrances; fall back to any account
// with more than one workbench.
const multi =
  members.find((m) => usable(m) && m.portals.length === 3) ||
  members.find((m) => usable(m) && m.portals.length > 1);
assert(multi, '临时库中找不到多工作台账号');
chosen.multi = multi;
ok('已从临时库选出 6 个测试账号（销售/运营/售后/管理/财务/多工作台）');
assert(
  chosen.multi.portals.length === 3,
  '多工作台账号未覆盖三个工作台：' + chosen.multi.portals.join(','),
);

// 4. Set a known test-only password on the copy.
const password = process.env.QA_PASSWORD || DEFAULT_PASSWORD;
const problem = passwordProblem(password);
assert(!problem, 'QA_PASSWORD 不满足应用密码规则：' + problem);
const hash = await hashPassword(password);
const now = new Date().toISOString();
db.exec('BEGIN IMMEDIATE');
try {
  for (const member of Object.values(chosen)) {
    db.prepare(
      `INSERT INTO credentials (member_id, password_hash, must_change, version, updated_at)
       VALUES (?, ?, 0, 1, ?)
       ON CONFLICT(member_id) DO UPDATE SET
         password_hash = excluded.password_hash,
         must_change = 0,
         version = credentials.version + 1,
         updated_at = excluded.updated_at`,
    ).run(member.id, hash, now);
    db.prepare(
      `UPDATE members
          SET status = 'active',
              profile_completed_at = COALESCE(profile_completed_at, ?),
              updated_at = ?
        WHERE id = ?`,
    ).run(now, now, member.id);
    db.prepare('DELETE FROM auth_sessions WHERE member_id = ?').run(member.id);
  }
  db.prepare('DELETE FROM login_attempts').run();
  db.exec('COMMIT');
} catch (error) {
  db.exec('ROLLBACK');
  db.close();
  fail('写入测试账号失败：' + (error instanceof Error ? error.message : error));
}
for (const member of Object.values(chosen)) {
  const stored = db
    .prepare('SELECT password_hash, must_change FROM credentials WHERE member_id = ?')
    .get(member.id);
  assert(stored && stored.must_change === 0, '测试账号未取消强制改密：' + member.email);
  assert(
    await verifyPassword(password, stored.password_hash),
    '测试账号密码校验失败：' + member.email,
  );
}
const pendingOnboarding = db
  .prepare(
    "SELECT count(*) AS n FROM members WHERE id IN (" +
      Object.values(chosen)
        .map(() => '?')
        .join(',') +
      ') AND profile_completed_at IS NULL',
  )
  .get(...Object.values(chosen).map((m) => m.id)).n;
db.close();
assert(pendingOnboarding === 0, '测试账号仍需首次资料确认，登录会被重定向');
ok('6 个测试账号已写入临时密码且无需首次改密');

// 5. Write the account manifest consumed by the browser test (temp-only).
const accounts = {};
for (const [key, member] of Object.entries(chosen)) {
  accounts[key] = {
    email: member.email,
    memberId: member.id,
    name: member.name,
    role: member.role,
    desks: member.desks,
    portals: member.portals,
  };
}
const manifest = {
  database,
  sourceDatabase,
  password,
  passwordSource: process.env.QA_PASSWORD ? 'QA_PASSWORD' : 'default',
  createdAt: now,
  accounts,
};
writeFileSync(accountsFile, JSON.stringify(manifest, null, 2) + '\n', {
  mode: 0o600,
});
ok('测试账号清单已写入 ' + accountsFile);

console.log(
  'D1_ACCOUNTS_JSON ' +
    JSON.stringify({
      database,
      passwordFile: accountsFile,
      accounts: Object.fromEntries(
        Object.entries(accounts).map(([key, value]) => [key, value.email]),
      ),
    }),
);
console.log(JSON.stringify({ passed: passes.length, database, accountsFile }));
