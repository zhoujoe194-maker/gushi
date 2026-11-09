import { backup } from 'node:sqlite';
import { mkdirSync, openSync, closeSync, chmodSync } from 'node:fs';
import { resolve } from 'node:path';
import { openSqlite } from '../runtime/sqlite.mjs';
mkdirSync('backups', { recursive: true, mode: 0o700 });
const path = resolve(
    'backups/company-' +
      new Date().toISOString().replace(/[:.]/g, '-') +
      '.sqlite',
  ),
  db = openSqlite();
closeSync(openSync(path, 'wx', 0o600));
try {
  await backup(db, path);
  chmodSync(path, 0o600);
} finally {
  db.close();
}
console.log('备份已完成：' + path);
