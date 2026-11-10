// Disposable database and actual HTTP routes; never opens company databases.
import {mkdtempSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {spawn,spawnSync} from 'node:child_process';
import {randomBytes,createHash,randomUUID} from 'node:crypto';
import {openSqlite} from '../runtime/sqlite.mjs';
const dir=mkdtempSync(join(tmpdir(),'gushi-cash-')), database=join(dir,'qa.sqlite'), port=Number(process.env.V2_QA_PORT||5273),base=`http://127.0.0.1:${port}`;
const env={...process.env,DATABASE_PATH:database,APP_ORIGIN:base,APP_BUILD_DIR:'.next-production',NODE_ENV:'production'};
const migration=spawnSync(process.execPath,['scripts/selfhost-migrate.mjs'],{env,encoding:'utf8'}); if(migration.status)throw Error(migration.stderr);
const db=openSqlite(database), now=new Date().toISOString(), cookies={};
for(const [id,role,region] of [['a','sales','广州总部'],['b','sales','广州总部'],['manager','management','全部分部'],['branch','management','湖南分部'],['finance','finance','全部分部'],['ops','operations','广州总部']]){
 db.prepare('INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at) VALUES(?,?,?,?,?,?,?,1,?,?,?)').run(id,'w',id+'@example.invalid',id,role,region,'active',now,now,now);
 db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id,'unused-test-hash',now);
 const token=randomBytes(32).toString('hex');cookies[id]='gushi_session='+token;
 db.prepare('INSERT INTO auth_sessions VALUES(?,?,1,?,?)').run(createHash('sha256').update(token).digest('hex'),id,'2099-01-01',now);
}
const server=spawn(process.execPath,['node_modules/next/dist/bin/next','start','-p',String(port)],{env,stdio:['ignore','pipe','pipe']}); let log=''; server.stdout.on('data',d=>log+=d);server.stderr.on('data',d=>log+=d);
let count=0;function check(v,label){if(!v)throw Error(label);console.log('PASS '+label);count++}
async function req(id,path='/api/workspace',body,desk){const r=await fetch(base+path,{method:body?'POST':'GET',headers:{Cookie:cookies[id],...(desk?{'x-workspace-desk':desk}:{}),...(body?{Origin:base,'Content-Type':'application/json'}:{})},body:body?JSON.stringify(body):undefined});return {status:r.status,data:await r.json()}}
try{
 for(let i=0;i<150;i++){try{await fetch(base);break}catch{await new Promise(r=>setTimeout(r,100));}}
 const day=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Shanghai'});
 const create=async owner=>(await req(owner,'/api/workspace',{action:'create',data:{name:'现金流模拟-'+owner}})).data.project;
 const p=await create('a'),q=await create('b');
 const get=async (pid=p.id,actor='finance')=>(await req(actor,'/api/cashflow?projectId='+pid)).data;
 const post=async(actor,body)=>req(actor,'/api/cashflow',{requestId:randomUUID(),...body});
 const edit=async(actor,body,pid=p.id)=>post(actor,{projectId:pid,version:(await get(pid)).book.version,...body});
 check((await req('a','/api/cashflow')).status===403,'销售不能读取公司现金');
 check((await req('a','/api/cashflow?projectId='+q.id)).status===404,'销售不能读取他人项目收支');
 check((await req('a','/api/cashflow',undefined,'finance')).status===403,'工作台头不能伪造财务权限');
 const request={projectId:p.id,version:0,action:'reimburse',category:'交通',amountCents:12345,purpose:'客户拜访',requestId:randomUUID()};
 check((await post('a',request)).status===200,'本人可申请报销');
 check((await post('a',request)).data.replayed===true,'同一请求幂等重试不重复申请');
 check((await post('a',{...request,amountCents:100})).status===409,'幂等键不能替换内容');
 let data=await get(),r=data.book.reimbursements[0];check(data.lines[0].status==='draft','待审核报销不纳入待支付');
 check((await edit('a',{action:'review_reimbursement',id:r.id,status:'已确认待支付',note:'伪造',dueDate:day})).status===403,'销售不能审核报销');
 check((await edit('manager',{action:'review_reimbursement',id:r.id,status:'已确认待支付',note:'伪造',dueDate:day})).status===403,'普通管理不能确认财务款项');
 check((await edit('finance',{action:'review_reimbursement',id:r.id,status:'已确认待支付',note:'票据核实',dueDate:day})).status===200,'财务确认报销计划');
 const settle=(allocations,amountCents,reference,direction='out')=>post('finance',{action:'settle',date:day,allocations,amountCents,reference,direction});
 const allocation={projectId:p.id,kind:'reimbursement',targetId:r.id,amountCents:2345};
 check((await settle([allocation],2345,'BANK-001')).status===200,'报销支持部分支付');
 check((await get()).lines[0].remainingCents===10000,'仅预测部分付款后的剩余金额');
 check((await settle([allocation],2345,'BANK-001')).status===409,'重复银行流水被拒绝');
 check((await settle([{...allocation,amountCents:10000}],10000,'BANK-002')).status===200,'报销尾款核销');
 data=await get();check(data.book.reimbursements[0].status==='已支付'&&data.lines[0].remainingCents===0,'已支付报销不再进入未来支出');
 check((await edit('finance',{action:'review_reimbursement',id:r.id,status:'已驳回',note:'错误'})).status===400,'已支付报销不能直接驳回');
 check((await edit('finance',{action:'purchase_order',number:'PO-01',supplier:'测试厂家',amountCents:90000,terms:'分两批，预付款与到货付款'})).status===200,'复用项目台账登记采购订单');
 check((await edit('finance',{action:'purchase_order',number:'PO-01',supplier:'测试厂家',amountCents:90000,terms:'重复'})).status===400,'同项目采购单号不可重复');
 const delivery={action:'delivery',name:'第一批',shipDate:'2026-11-01',arrivalDate:'2026-11-05',expectedAcceptanceDate:'2026-11-07',actualShipDate:'',actualArrivalDate:'',acceptedDate:''};
 check((await edit('finance',delivery)).status===200,'维护交付批次');
 data=await get();const order=data.book.purchaseOrders[0],batch=data.project.batches[0];
 const supplier={action:'supplier_plan',cashTerms:{orderId:order.id,trigger:'到货付款',offsetDays:0,monthlyDay:10},batchId:batch.id,amountCents:40000,dueDate:'2026-11-05',note:'第一期'};
 check((await edit('finance',supplier)).status===200,'采购计划关联订单及批次');
 check((await edit('finance',{...supplier,amountCents:60000})).status===400,'订单与付款计划防止超额重复');
 check((await edit('finance',{...delivery,id:batch.id,arrivalDate:'2026-11-20',expectedAcceptanceDate:'2026-11-22'})).status===200,'修改预计货期');
 data=await get();check(data.suggestions[0].dueDate==='2026-11-20'&&data.book.suppliers[0].dueDate==='2026-11-05','货期改变提供重评建议，不擅自改财务确认日期');
 const sid=data.book.suppliers[0].id;
 check((await edit('finance',{...supplier,id:sid,cashTerms:{...supplier.cashTerms,trigger:'月结'},dueDate:'2026-12-10'})).status===200,'财务确认月结计划');
 check((await get()).suggestions[0].dueDate==='2026-12-10','月结使用到货月份之后的指定日');
 const sales=await get(p.id,'a');check(!sales.book.suppliers&&!sales.book.purchaseOrders&&!JSON.stringify(sales).includes('测试厂家'),'销售响应不泄露采购成本订单');
 check((await edit('a',{action:'customer_plan',label:'客户回款承诺',amountCents:50000,dueDate:day,note:'分期'})).status===200,'销售提交回款信息');
 data=await get();const plan=data.book.plans[0];check(plan.cashStatus==='draft','销售提交不会确认银行到账');
 check((await settle([{projectId:p.id,kind:'customer',targetId:plan.id,amountCents:100}],100,'UNCONFIRMED','in')).status===400,'待确认计划不能核销');
 check((await edit('finance',{action:'customer_plan',id:plan.id,label:plan.label,amountCents:50000,dueDate:day,certainty:'expected'})).status===200,'财务确认客户计划');
 await edit('finance',{action:'customer_plan',label:'项目乙分期',amountCents:80000,dueDate:day},q.id);const planQ=(await get(q.id)).book.plans[0];
 const split=[{projectId:p.id,kind:'customer',targetId:plan.id,amountCents:20000},{projectId:q.id,kind:'customer',targetId:planQ.id,amountCents:30000}];
 check((await settle(split,50000,'SPLIT-001','in')).status===200,'一笔银行到账分摊两个项目');
 check((await get()).lines.find(l=>l.id===plan.id).remainingCents===30000&&(await get(q.id)).lines[0].remainingCents===50000,'跨项目分摊准确抵减余额');
 check((await settle(split,40000,'SPLIT-BAD','in')).status===400,'分摊不平衡拒绝');
 check((await settle([split[0],split[0]],40000,'DOUBLE','in')).status===400,'同一目标重复分摊拒绝');
 const bank=(await req('finance','/api/cashflow')).data.bank.find(b=>b.reference==='SPLIT-001');
 check((await post('finance',{action:'void_bank',id:bank.id,reason:'银行退回'})).status===200,'跨项目银行流水整体冲销');
 check((await get()).lines.find(l=>l.id===plan.id).remainingCents===50000&&(await get(q.id)).lines[0].remainingCents===80000,'冲销同时恢复两个项目未收余额');
 check((await edit('manager',{action:'grant',memberId:'ops'})).status===200,'管理可单独授权项目报销');
 check((await edit('ops',{action:'reimburse',category:'差旅',amountCents:200,purpose:'现场支持'})).status===200,'获报销授权的协作者可提交申请');
 const ops=await get(p.id,'ops');check(ops.book.plans.length===0&&!ops.book.suppliers&&ops.book.reimbursements.length===1,'报销授权不开放项目完整台账');
 check((await req('ops')).data.projects.length===0,'报销权限不扩大完整项目访问');
 const before=(await get()).book.version;
 db.exec("CREATE TRIGGER cash_rollback BEFORE INSERT ON bank_transactions BEGIN SELECT RAISE(ABORT,'forced'); END");
 check((await settle([{...split[0],amountCents:100}],100,'FAIL','in')).status===503,'模拟银行记录写入失败');
 db.exec('DROP TRIGGER cash_rollback');check((await get()).book.version===before,'失败回滚项目核销记录');
 check(db.prepare('SELECT count(*) n FROM finance_mutations').get().n>10,'保留财务变更审计');
 console.log(JSON.stringify({passed:count,database}));
}finally{server.kill('SIGTERM');db.close();}
