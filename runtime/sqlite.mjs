import {DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
export function databasePath(){return resolve(process.env.DATABASE_PATH||'data/company.sqlite');}
export function openSqlite(path=databasePath(),create=false){if(!create&&!existsSync(path))throw Error('数据库未初始化，请运行 npm run db:migrate');mkdirSync(dirname(path),{recursive:true});const raw=new DatabaseSync(path);raw.exec('PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;');return raw;}
class Statement{
 constructor(db,sql,values=[]){this.db=db;this.sql=sql;this.values=values;}
 bind(...values){return new Statement(this.db,this.sql,values.map(v=>v===undefined?null:v));}
 execute(mode){const statement=this.db.prepare(this.sql);if(mode==='all')return {results:statement.all(...this.values),success:true,meta:{}};const r=statement.run(...this.values);return {results:[],success:true,meta:{changes:Number(r.changes),last_row_id:Number(r.lastInsertRowid)}};}
 async first(column){const r=this.db.prepare(this.sql).get(...this.values);return r?(column?r[column]:r):null;}
 async all(){return this.execute('all');}
 async run(){return this.execute('run');}
}
export function d1Adapter(raw){return {prepare(sql){return new Statement(raw,sql)},async batch(statements){raw.exec('BEGIN IMMEDIATE');try{const results=statements.map(s=>s.execute('run'));raw.exec('COMMIT');return results}catch(e){raw.exec('ROLLBACK');throw e}},raw};}
let database;
export function getDatabase(){return database??=d1Adapter(openSqlite());}
