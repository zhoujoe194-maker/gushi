import { mkdtempSync, readFileSync, readdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { openSqlite } from '../runtime/sqlite.mjs';
import { migrate } from '../scripts/selfhost-migrate.mjs';
if (process.env.RUN_LOCAL_TESTS !== '1') throw Error('仅限隔离升级验收');
const path = join(
  mkdtempSync(join(tmpdir(), 'gushi-report-migration-')),
  'company.sqlite',
);
process.env.DATABASE_PATH = path;
const db = openSqlite(path, true),
  passed = [];
function check(value, name) {
  if (!value) throw Error(name);
  passed.push(name);
  console.log('PASS ' + name);
}
db.exec(
  'CREATE TABLE __app_migrations(name TEXT PRIMARY KEY,digest TEXT NOT NULL,applied_at TEXT NOT NULL)',
);
for (const name of readdirSync('drizzle')
  .filter((n) => /^000\d.*\.sql$/.test(n))
  .sort()) {
  const sql = readFileSync(resolve('drizzle', name), 'utf8');
  db.exec(sql);
  db.prepare('INSERT INTO __app_migrations VALUES(?,?,?)').run(
    name,
    createHash('sha256').update(sql).digest('hex'),
    '2026-10-29',
  );
}
db.prepare(
  "INSERT INTO members(id,workspace_id,name,email,role,region,status,version,created_at,updated_at) VALUES('legacy-sales','legacy','历史销售','migration@example.invalid','sales','广州总部','active',1,'2026-09-01','2026-09-01')",
).run();
for (const kind of ['activity', 'weekly', 'performance'])
  db.prepare('INSERT INTO sales_records VALUES(?,?,?,?,?,?,?,?,?,?,?,?)').run(
    kind,
    'legacy',
    'legacy-sales',
    '广州总部',
    kind,
    kind === 'weekly' ? '2026-09-07' : '2026-09',
    '2026-09-12',
    kind === 'performance' ? 'published' : 'approved',
    JSON.stringify({
      content: { summary: '原有中文资料', total: 91.5 },
      history: [{ note: '原有审核' }],
    }),
    7,
    '2026-09-12',
    '2026-10-01',
  );
const before = JSON.stringify(
  db.prepare('SELECT * FROM sales_records ORDER BY id').all(),
);
migrate();
check(
  JSON.stringify(
    db.prepare('SELECT * FROM sales_records ORDER BY id').all(),
  ) === before,
  '升级逐字段保留旧工作记录、周报、评分、版本和审核历史',
);
check(
  db.prepare('PRAGMA integrity_check').get().integrity_check === 'ok' &&
    db.prepare('PRAGMA foreign_key_check').all().length === 0,
  '升级后完整性与外键检查通过',
);
const insert = db.prepare(
  "INSERT INTO sales_records VALUES('monthly','legacy','legacy-sales','广州总部','monthly','2026-09','2026-09-01','submitted','{}',1,'2026-10-31','2026-10-31')",
);
insert.run();
check(
  db.prepare("SELECT COUNT(*) n FROM sales_records WHERE kind='monthly'").get()
    .n === 1,
  '升级后可存月报',
);
let duplicate = false;
try {
  db.exec(
    "INSERT INTO sales_records SELECT 'duplicate',workspace_id,member_id,region,kind,period,record_date,status,data,version,created_at,updated_at FROM sales_records WHERE id='monthly'",
  );
} catch {
  duplicate = true;
}
check(duplicate, '升级保留同成员同月唯一约束');
migrate();
check(
  db.prepare('SELECT COUNT(*) n FROM sales_records').get().n === 4,
  '重复升级不丢记录或重复创建月报',
);
check(
  db
    .prepare(
      "SELECT COUNT(*) n FROM sqlite_master WHERE type='index' AND name IN ('sales_records_member','sales_records_review')",
    )
    .get().n === 2,
  '检索与审核索引保留',
);
db.close();
console.log(JSON.stringify({ passed: passed.length }));
