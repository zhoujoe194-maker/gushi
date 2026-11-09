import {readdirSync,readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {openSqlite,databasePath} from '../runtime/sqlite.mjs';
export function migrate(){const db=openSqlite(databasePath(),true);db.exec('CREATE TABLE IF NOT EXISTS __app_migrations(name TEXT PRIMARY KEY,digest TEXT NOT NULL,applied_at TEXT NOT NULL)');for(const name of readdirSync(resolve('drizzle')).filter(n=>/^\d+.*\.sql$/.test(n)).sort()){const sql=readFileSync(resolve('drizzle',name),'utf8'),digest=createHash('sha256').update(sql).digest('hex'),old=db.prepare('SELECT digest FROM __app_migrations WHERE name=?').get(name);if(old){if(old.digest!==digest)throw Error('已应用的迁移文件被修改：'+name);continue;}db.exec('BEGIN IMMEDIATE');try{db.exec(sql);db.prepare('INSERT INTO __app_migrations VALUES(?,?,?)').run(name,digest,new Date().toISOString());db.exec('COMMIT');console.log('已应用数据库迁移：'+name)}catch(e){db.exec('ROLLBACK');throw e}}db.close();}
if(process.argv[1]&&import.meta.url.endsWith('/'+process.argv[1].split('/').at(-1)))migrate();
