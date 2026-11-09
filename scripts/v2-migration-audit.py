"""Read-only inventory / copied-database migration audit. Never mutates source."""
import argparse, sqlite3, pathlib, json, hashlib, subprocess, os
p=argparse.ArgumentParser();p.add_argument('source');p.add_argument('copy');args=p.parse_args()
source=pathlib.Path(args.source).resolve(); target=pathlib.Path(args.copy).resolve()
if source==target or target.exists(): raise SystemExit('Target must be a new disposable copy')
a=sqlite3.connect(f'file:{source}?mode=ro',uri=True); b=sqlite3.connect(target); a.backup(b); b.close();os.chmod(target,0o600)
def snapshot(db):
 result={}
 for (name,) in db.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name!='__app_migrations'"):
  rows=sorted([repr(row) for row in db.execute('SELECT * FROM "'+name+'"')]);result[name]={'count':len(rows),'sha256':hashlib.sha256('\n'.join(rows).encode()).hexdigest()}
 return result
before=snapshot(a)
subprocess.run(['node','scripts/selfhost-migrate.mjs'],env={**os.environ,'DATABASE_PATH':str(target)},check=True)
b=sqlite3.connect(target);after=snapshot(b)
assert all(after[k]==v for k,v in before.items()), 'Historical data changed'
assert b.execute('PRAGMA integrity_check').fetchone()[0]=='ok'
assert not b.execute('PRAGMA foreign_key_check').fetchall()
issues=[]
for id,workspace,data in b.execute('SELECT id,user_id,data FROM projects'):
 d=json.loads(data); owner=d.get('ownerMemberId'); member=b.execute('SELECT id FROM members WHERE id=? AND workspace_id=?',(owner,workspace)).fetchone()
 if not member:issues.append({'projectId':id,'issue':'unresolved_owner'})
 if d.get('stage') in ['已结项','合同履约','售后复盘']:issues.append({'projectId':id,'issue':'status_needs_confirmation'})
subprocess.run(['node','scripts/selfhost-migrate.mjs'],env={**os.environ,'DATABASE_PATH':str(target)},check=True)
assert snapshot(b)==after,'Second migration changed data'
print(json.dumps({'historicalTablesUnchanged':len(before),'historicalRowsUnchanged':sum(x['count'] for x in before.values()),'newTables':sorted(set(after)-set(before)),'integrity':'ok','idempotent':True,'reviewItems':issues},ensure_ascii=False,indent=2))
