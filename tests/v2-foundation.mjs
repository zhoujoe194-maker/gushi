// Disposable database and actual HTTP routes; never opens company databases.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {openSqlite} from '../runtime/sqlite.mjs';
const dir=mkdtempSync(join(tmpdir(),'gushi-v2-')), database=join(dir,'qa.sqlite'), port=Number(process.env.V2_QA_PORT||5268),base=`http://127.0.0.1:${port}`;
const env={...process.env,DATABASE_PATH:database,APP_ORIGIN:base,APP_BUILD_DIR:'.next-production',NODE_ENV:'production'};
const migration=spawnSync(process.execPath,['scripts/selfhost-migrate.mjs'],{env,encoding:'utf8'}); if(migration.status)throw Error(migration.stderr);
const db=openSqlite(database), now=new Date().toISOString(), cookies={};
for(const [id,role,region] of [['a','sales','广州总部'],['b','sales','广州总部'],['manager','management','全部分部'],['branch','management','湖南分部'],['finance','finance','全部分部'],['ops','operations','广州总部']]){
 db.prepare('INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)').run(id,'w',id+'@example.invalid',id,role,region,'active',now,now,now);
 db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id,'unused-test-hash',now);
 const token=randomBytes(32).toString('hex');cookies[id]='gushi_session='+token;
 db.prepare('INSERT INTO auth_sessions VALUES(?,?,1,?,?)').run(createHash('sha256').update(token).digest('hex'),id,'2099-01-01',now);
}
const project=(owner)=>({name:'secret-'+owner,location:'广州',type:'工业厂房',source:'老客户',owner,ownerMemberId:owner,stage:'商务谈判',amount:10,customer:'customer-'+owner,designer:'',contractor:'',contact:'',phone:'',nextAction:'联系',nextDate:'2026-12-01',notes:'',opportunities:[],workflow:{region:'广州总部',assignments:{},assignmentMembers:{sales:'a'},tasks:[],checklist:{},facts:{'payment-record':'financial-secret'},milestones:{}}});
for(const id of ['a','b'])db.prepare('INSERT INTO projects VALUES(?,?,?,?,?)').run(id,'w',JSON.stringify(project(id)),1,now);
const task={id:'t',desk:'sales',region:'广州总部',title:'SECRET-TASK',request:'SECRET-DETAILS',dueDate:'2026-12-01',projectId:'b',assigneeId:'a',createdBy:'manager',version:1,status:'待处理',history:[]};
db.prepare('INSERT INTO desk_tasks VALUES(?,?,?,?,?,?,?,?)').run('t','w','sales','广州总部','b',JSON.stringify(task),1,now);
db.prepare('INSERT INTO task_images VALUES(?,?,?,?,?)').run('image','w','t','AA==',now);
db.prepare("INSERT INTO message_threads(id,workspace_id,endpoint_a,endpoint_b,created_at,kind,name,project_id,created_by) VALUES('g','w','group:g','group:g',?,'group','SECRET-GROUP','b','manager')").run(now);
for(const id of ['a','b']) db.prepare('INSERT INTO message_participants VALUES(?,?,?)').run('g',id,now);
db.prepare("INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,body,project_id,created_at) VALUES('msg','g','w','b','b','person:b','SECRET-MESSAGE','b',?)").run(now);
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env,stdio:['ignore','pipe','pipe']}); let log=''; server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
let count=0;function check(v,label){if(!v)throw Error(label);console.log('PASS '+label);count++}
async function req(id,path='/api/workspace',body,desk){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookies[id],...(desk?{'x-workspace-desk':desk}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
try{
 for(let i=0;i<150;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100));}}
 let a=await req('a');check(a.status===200&&a.data.projects.length===1&&a.data.projects[0].id==='a','销售不能通过同台任务或协作分配查看其他销售项目');
 check(!a.data.finances.b && !a.data.finances.a?.contractSnapshot && !a.data.finances.a?.suppliers,'销售仅返回本人项目的必要合同投影');check(!JSON.stringify(a.data).includes('financial-secret'),'销售不返回受保护的财务事实');
 check((await req('manager')).data.projects.length===2,'公司管理查看全部项目');check((await req('finance')).data.projects.length===2,'财务查看全部项目');check((await req('branch')).data.projects.length===2,'旧分部管理统一查看公司项目');check((await req('ops')).data.projects.length===0,'运营不自动获得项目访问权');
 check((await req('a','/api/workspace',undefined,'finance')).status===403,'伪造工作台请求头无效');
 check((await req('a','/api/tasks')).data.tasks.length===0,'关联任务不泄露其他销售项目');
 check((await req('a','/api/tasks',{action:'feedback',id:'t',version:1,status:'处理中',result:'attack'})).status===404,'任务修改接口独立检查项目权限');
 check((await req('a','/api/tasks/images/image')).status===404,'直接图片URL不能绕过权限');
 check((await req('a','/api/messages?threadId=g')).status===404,'群成员不能读取无权项目群正文');check((await req('a','/api/messages')).data.threads.length===0,'群列表不泄露名称或摘要');check((await req('b','/api/messages?threadId=g')).data.messages.length===1,'负责人仍可读授权群历史');
 check((await req('manager','/api/messages?threadId=g')).status===404,'管理身份不会自动获得私人群历史');
 check((await req('finance','/api/workspace',{action:'update',id:'a',version:1,data:{...project('a'),name:'attack'}})).status===403,'财务不能修改销售主档');
 check((await req('a','/api/workspace',{action:'update',id:'b',version:1,data:project('b')})).status===404,'直接项目修改API不能读取非本人项目');
 check((await req('a','/api/workspace',{action:'update',id:'a',version:1,data:{...project('a'),owner:'b',ownerMemberId:'b'}})).status===403,'销售不能伪造负责人转交项目');
 const directId='private';db.prepare("INSERT INTO message_threads(id,workspace_id,endpoint_a,endpoint_b,created_at) VALUES(?,'w','person:a','person:b',?)").run(directId,now);
 for(const [id,body,projectId] of [['public-msg','NORMAL',''],['restricted-msg','SECRET-PRIVATE','b']])db.prepare("INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,body,project_id,created_at) VALUES(?,?,'w','b','b','person:b',?,?,?)").run(id,directId,body,projectId,now);
 const dm=await req('a','/api/messages?threadId=private');check(dm.data.messages.length===1 && dm.data.messages[0].body==='NORMAL','私人消息逐条过滤无权项目正文');
 const dmList=await req('a','/api/messages');check(!JSON.stringify(dmList.data).includes('SECRET-PRIVATE'),'私聊摘要不泄露无权项目正文');
 check((await req('finance','/api/messages?threadId=private')).status===404,'财务不自动读取私人聊天');
 const moved=await req('manager','/api/workspace',{action:'update',id:'b',version:1,data:{...project('b'),ownerMemberId:'a',owner:'a'}});check(moved.status===200,'管理可转交负责人');
 check((await req('b')).data.projects.length===0,'转交后旧会话立即失去项目权限');check((await req('b','/api/messages?threadId=g')).status===404,'转交后旧负责人立即失去项目群权限');
 check(db.prepare('SELECT previous_member_id,new_member_id FROM project_owner_history').get().previous_member_id==='b','转交保存稳定成员ID历史');check(db.prepare('SELECT count(*) n FROM message_items').get().n===3,'撤权不删除历史消息');
 const independent={...task,id:'independent',projectId:'',desk:'operations',assigneeId:'ops',region:'湖南分部'};db.prepare('INSERT INTO desk_tasks VALUES(?,?,?,?,?,?,?,?)').run(independent.id,'w','operations','广州总部',null,JSON.stringify(independent),1,now);
 check((await req('ops','/api/tasks')).data.tasks.some(t=>t.id==='independent'),'原运营人员可接收跨旧分部的独立协作任务');
 console.log(JSON.stringify({passed:count,database}));
}finally{server.kill('SIGTERM');db.close();writeFileSync(join(dir,'server.log'),log);}
