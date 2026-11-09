// Disposable database and actual HTTP routes; never opens company databases.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {openSqlite} from '../runtime/sqlite.mjs';
const dir=mkdtempSync(join(tmpdir(),'gushi-v2a-')), database=join(dir,'qa.sqlite'), port=Number(process.env.V2_QA_PORT||5269),base=`http://127.0.0.1:${port}`;
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

 const created=await req('a','/api/workspace',{action:'create',data:{name:'极简试用项目'}});
 check(created.status===200,'只填写项目名称即可创建');
 let quick=created.data.project;check(quick.ownerMemberId==='a' && quick.owner==='a','负责人由服务端绑定当前成员');check(quick.nextDate==='' && !quick.lastFollowupAt,'未安排跟进且不伪造创建跟进时间');
 check((await req('a','/api/workspace',{action:'create',data:{name:'伪造归属',ownerMemberId:'b'}})).status===403,'销售不能新建他人负责的项目');
 const assigned=await req('manager','/api/workspace',{action:'create',data:{name:'管理指派',ownerMemberId:'b'}});check(assigned.status===200&&assigned.data.project.ownerMemberId==='b','管理可指定负责人');
 const first={action:'followup',id:quick.id,version:quick.version,content:'第一次联系，确认需求',nextDate:'2026-12-05',requestId:randomUUID()};
 let result=await req('a','/api/workspace',first);check(result.status===200,'文字和可选日期保存成功');quick=result.data.project;
 check(quick.lastFollowupAt===result.data.event.createdAt && result.data.event.actorMemberId==='a','服务器记录真实跟进时间和稳定操作人ID');
 const second={action:'followup',id:quick.id,version:quick.version,content:'第二次联系，等待客户反馈',requestId:randomUUID()};result=await req('a','/api/workspace',second);check(result.status===200&&result.data.project.nextDate==='','不填下次日期也保存并标记待安排');quick=result.data.project;
 const history=db.prepare('SELECT * FROM project_followups WHERE project_id=? ORDER BY created_at').all(quick.id);
 check(history.length===2 && history[0].next_followup_date==='2026-12-05' && history[1].next_followup_date===null,'独立记录追加且保留此前跟进日期');
 const replay=await req('a','/api/workspace',second);check(replay.status===200&&db.prepare('SELECT count(*) n FROM project_followups WHERE project_id=?').get(quick.id).n===2,'重试同一请求不会重复追加');
 let changed=await req('a','/api/workspace',{action:'update',id:quick.id,version:quick.version,data:{...quick,customer:'补充客户',lastFollowupAt:'2099-01-01',latestFollowupContent:'fake'}});
 check(changed.status===200&&changed.data.project.lastFollowupAt===quick.lastFollowupAt&&changed.data.project.latestFollowupContent===quick.latestFollowupContent,'普通资料编辑与伪造字段不改变真实跟进');quick=changed.data.project;
 check((await req('finance','/api/workspace',{...second,version:quick.version,requestId:randomUUID()})).status===403,'财务不能新增销售跟进');
 check((await req('b','/api/workspace',{...second,version:quick.version,requestId:randomUUID()})).status===404,'其他销售不能跟进或读取项目');
 check((await req('a','/api/workspace',{...second,version:quick.version,content:'   ',requestId:randomUUID()})).status===400,'空白跟进内容被后端拒绝');
 check((await req('a','/api/workspace',{...second,version:quick.version,nextDate:'2026-02-30',requestId:randomUUID()})).status===400,'非法日期被后端拒绝');
 const parallel=await Promise.all([req('a','/api/workspace',{...second,version:quick.version,content:'并发一',requestId:randomUUID()}),req('a','/api/workspace',{...second,version:quick.version,content:'并发二',requestId:randomUUID()})]);
 check(parallel.filter(r=>r.status===200).length===1&&parallel.filter(r=>r.status===409).length===1,'并发跟进版本冲突不覆盖历史');quick=parallel.find(r=>r.status===200).data.project;
 const contract=await req('a','/api/finance',{action:'submit_contract',projectId:quick.id,version:0,contractNo:'TRIAL-001',contractAmountCents:100000,paymentTerms:'验收后付款'});
 check(contract.status===200 && contract.data.book.reviewStatus==='待审核','销售合同提交流程恢复');
 check(!contract.data.book.contractSnapshot && !contract.data.book.suppliers && !contract.data.book.financeMemo,'合同响应不泄露快照成本或内部财务数据');
 const commercial={area:20,areaUnit:'㎡',priceUnit:'元/㎡',unitPrice:100,costUnitPrice:66,profitNotes:'PRIVATE-PROFIT',quotes:[],competitors:[],contractorName:'测试单位',funding:'',debt:'',litigation:'',badContracts:'',riskLevel:'待核实',verification:'待核实',source:'',checkedDate:'',riskResponse:''};
 changed=await req('manager','/api/workspace',{action:'update',id:quick.id,version:quick.version,data:{...quick,commercial}});check(changed.status===200,'管理可以保存成本资料');
 const salesView=(await req('a')).data.projects.find(p=>p.id===quick.id);check(salesView.commercial.costUnitPrice===null&&salesView.commercial.profitNotes==='','销售看不到成本和利润');
 changed=await req('a','/api/workspace',{action:'workflow',id:quick.id,version:salesView.version,note:'更新客户报价',data:{...salesView,commercial:{...salesView.commercial,unitPrice:120}}});
 check(changed.status===200&&changed.data.project.commercial.unitPrice===120,'销售报价入口仍能编辑销售单价');
 const stored=JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(quick.id).data);
 check(stored.commercial.costUnitPrice===66&&stored.commercial.profitNotes==='PRIVATE-PROFIT','销售更新报价不覆盖隐藏成本利润');
 check(stored.lastFollowupAt===quick.lastFollowupAt,'合同和报价编辑不冒充真实跟进');
 check((await req('a','/api/workspace',{action:'update',id:quick.id,version:changed.data.project.version,data:{...changed.data.project,commercial:{...changed.data.project.commercial,costUnitPrice:1}}})).status===403,'销售伪造成本修改被拒绝');

 const approved=await req('finance','/api/finance',{action:'review_contract',projectId:quick.id,version:contract.data.book.version,decision:'approved',plans:[{id:randomUUID(),label:'货款',amountCents:100000,dueDate:'2026-12-05'}],note:''});
 check(approved.status===200,'财务仍可审核销售提交的合同');
 const invoice=await req('a','/api/finance',{action:'request_invoice',projectId:quick.id,version:approved.data.book.version,amountCents:100000,title:'模拟客户',taxNo:'TRIAL-TAX',remark:'测试申请'});
 check(invoice.status===200 && invoice.data.book.invoices.length===1,'销售保留必要开票申请权限');
 check((await req('a','/api/finance',{action:'finance_memo',projectId:quick.id,version:invoice.data.book.version,note:'attack'})).status===403,'销售仍不能维护财务内部备注');
 const taskCreate=await req('manager','/api/tasks',{action:'create',data:{title:'跟进独立任务测试',request:'确认客户需求',desk:'sales',dueDate:'2026-12-05',region:'全部分部',projectId:quick.id,assigneeId:'a'}});
 check(taskCreate.status===200,'可向项目负责人下发关联任务');const taskId=taskCreate.data.task.id;
 const feedback=await req('a','/api/tasks',{action:'feedback',id:taskId,version:1,status:'待验收',result:'任务已完成'});
 const accepted=await req('manager','/api/tasks',{action:'accept',id:taskId,version:feedback.data.task.version,note:''});
 check(accepted.status===200&&JSON.parse(db.prepare('SELECT data FROM projects WHERE id=?').get(quick.id).data).lastFollowupAt===quick.lastFollowupAt,'完成任务不刷新真实跟进时间');
 const current=(await req('manager')).data.projects.find(p=>p.id===quick.id);
 const reassigned=await req('manager','/api/workspace',{action:'update',id:quick.id,version:current.version,data:{...current,ownerMemberId:'b',owner:'b'}});
 check(reassigned.status===200&&reassigned.data.project.lastFollowupAt===quick.lastFollowupAt,'修改负责人不改变最近真实跟进');
 check((await req('a','/api/workspace',second)).status===404,'转交后原销售连重试旧跟进请求也不能访问');
 check(db.prepare('SELECT count(*) n FROM project_followups WHERE project_id=?').get(quick.id).n===3,'任务与负责人变化不额外制造跟进记录');
 check((await req('a')).data.projects.some(p=>p.id==='a'),'历史项目仍可读取');
 console.log(JSON.stringify({passed:count,database}));
}finally{server.kill('SIGTERM');db.close();writeFileSync(join(dir,'server.log'),log);}
