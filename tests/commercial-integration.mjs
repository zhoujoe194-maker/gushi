import { randomUUID } from 'node:crypto';
import { resolve } from 'node:path';
import { writeFileSync } from 'node:fs';
import { openSqlite } from '../runtime/sqlite.mjs';
import { hashPassword } from '../app/server/password.ts';

const database = resolve(process.env.DATABASE_PATH || '.');
const base = process.env.QA_URL || 'http://127.0.0.1:5188';
if (
  process.env.RUN_LOCAL_TESTS !== '1' ||
  !database.startsWith('/private/tmp/gushi-access-qa/') ||
  !/^http:\/\/127\.0\.0\.1:\d+$/.test(base)
)
  throw Error('仅允许隔离的本机业务测试数据库');
const passed = [],
  failed = [];
function check(value, label) {
  (value ? passed : failed).push(label);
  console.log((value ? 'PASS ' : 'FAIL ') + label);
}
const db = openSqlite(database),
  now = new Date().toISOString(),
  day = now.slice(0, 10);
const workspace = 'business-' + randomUUID(),
  password = 'BusinessQA!' + randomUUID(),
  hash = await hashPassword(password),
  users = {};
for (const [name, role, region, desks] of [
  ['owner', 'owner', '全部分部'],
  ['manager', 'management', '全部分部'],
  ['sales', 'sales', '广州总部'],
  ['sales2', 'sales', '广州总部'],
  ['finance', 'finance', '全部分部', ['finance', 'operations']],
  ['ops', 'operations', '广州总部'],
  ['ops2', 'operations', '广州总部'],
  ['after', 'aftersales', '广州总部'],
  ['branch', 'management', '湖南分部'],
  ['outside', 'sales', '广州总部'],
]) {
  const id = workspace + '-' + name,
    email = id + '@example.invalid';
  db.prepare(
    "INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) VALUES(?,?,?,?,?,?,'active',1,?,?,?,?,?)",
  ).run(
    id,
    name === 'outside' ? workspace + '-other' : workspace,
    email,
    name,
    role,
    region,
    now,
    now,
    now,
    desks ? JSON.stringify(desks) : null,
    desks?.[0] || null,
  );
  db.prepare('INSERT INTO credentials VALUES(?,?,0,1,?)').run(id, hash, now);
  users[name] = { id, email };
}
// Login rate limits are scoped to these synthetic identifiers; never touch real accounts.
db.close();
async function request(user, path = '/api/workspace', body, desk) {
  const r = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: {
      ...(user ? { Cookie: users[user].cookie } : {}),
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
      ...(body ? { Origin: base, 'Content-Type': 'application/json' } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    redirect: 'manual',
  });
  const data = await r.json().catch(() => ({}));
  return {
    status: r.status,
    body: data,
    cookie: r.headers.get('set-cookie')?.split(';')[0],
  };
}
async function ok(user, path, body, desk) {
  const r = await request(user, path, body, desk);
  if (r.status !== 200)
    throw Error(`${path}: ${r.status} ${JSON.stringify(r.body)}`);
  return r.body;
}
async function denied(user, path, body, status, label, desk) {
  const r = await request(user, path, body, desk);
  check(r.status === status, `${label} (${r.status})`);
}
for (const user of Object.values(users)) {
  const r = await request(null, '/api/auth', {
    action: 'login',
    identifier: user.email,
    password,
  });
  if (r.status !== 200) throw Error('Fixture login: ' + JSON.stringify(r));
  user.cookie = r.cookie;
}
let p=(await ok('sales','/api/workspace',{action:'create',data:{name:'商务履约专项测试',location:'广州',type:'工业厂房',source:'测试',owner:'sales',ownerMemberId:users.sales.id,stage:'商务谈判',amount:12,customer:'虚构客户',designer:'',contractor:'虚构总包',contact:'',phone:'',nextAction:'确认报价',nextDate:day,notes:'',opportunities:[],workflow:{region:'广州总部',assignments:{},assignmentMembers:{operations:users.ops.id},tasks:[],checklist:{},facts:{},milestones:{}}}})).project;
const commercial={area:1200,areaUnit:'㎡',priceUnit:'元/㎡',unitPrice:100,costUnitPrice:70,profitNotes:'税运同口径，参考毛利率30%',quotes:[{id:'q1',date:day,company:'我方',product:'保温板',unit:'元/㎡',quantity:1200,unitPrice:100,total:120000,costUnitPrice:70,terms:'含税含运',status:'已报价',source:'正式报价单'}],competitors:[{id:'c1',date:day,company:'虚构对手',product:'同类材料',unit:'元/㎡',quantity:1200,unitPrice:95,total:114000,costUnitPrice:null,terms:'运输另计',status:'待核实',source:'客户口述'}],contractorName:'虚构总包',funding:'待核实',debt:'待核实',litigation:'待核实',badContracts:'待核实',riskLevel:'中',verification:'部分核实',source:'会议记录',checkedDate:day,riskResponse:'首批款到发货'};
const execution={contractTerms:'分批交货，延误按合同处理',settlement:'按实测面积结算',paymentMethod:'银行转账',paymentRequirements:'首批发货前付，第二批到货后30天',technicalRequirements:'技术指标按确认图纸',leadTime:'预付款后15天',batchCount:2,batches:[{id:'batch1',name:'首批',goods:'保温板',quantity:600,unit:'㎡',shipDate:day,arrivalDate:day,paymentTrigger:'发货前付款',paymentDueDate:day,paymentTerms:'首批款到发货',status:'计划中',note:''}]};
async function update(project,user='sales'){return (await ok(user,'/api/workspace',{action:'workflow',id:project.id,version:project.version,data:project,note:'更新专项档案'})).project}
p=await update({...p,commercial,execution},'manager');
const managerCommercial=(await ok('manager','/api/workspace')).projects.find(v=>v.id===p.id);
check(managerCommercial.commercial.costUnitPrice===70&&managerCommercial.commercial.profitNotes.length>0,'成本与利润仅管理维护');
p=(await ok('sales','/api/workspace')).projects.find(v=>v.id===p.id);
check(p.commercial.quotes[0].total===120000&&!p.commercial.profitNotes&&p.execution.batches.length===1,'报价、对手、风险、合同与批次持久化（销售视图隐藏成本）');
await denied('sales','/api/workspace',{action:'workflow',id:p.id,version:p.version,data:{...p,commercial:{...p.commercial,unitPrice:-1}},note:'无效'},400,'负数报价被拒绝');
await denied('sales','/api/workspace',{action:'workflow',id:p.id,version:p.version,data:{...p,execution:{...execution,batchCount:0}},note:'无效'},400,'批次数量超约定被拒绝');
await denied('sales','/api/workspace',{action:'workflow',id:p.id,version:p.version,data:{...p,workflow:{...p.workflow,checklist:{'deal-credit':true}}},note:'空勾选'},400,'无依据不能新勾选阶段完成');
p=await update({...p,workflow:{...p.workflow,checklist:{'deal-credit':true},facts:{'check:deal-credit':'已核实授权书，信用风险待复核','stage:商务谈判:sales':'首批款到发货'}}});
check(p.workflow.checklist['deal-credit']&&p.workflow.facts['check:deal-credit'],'阶段说明与检查状态一起保存');
check(!(await ok('ops')).projects.some(v=>v.id===p.id),'部门对接人分配不会向运营返回项目主档（V2 边界）');
await denied('ops','/api/workspace',{action:'workflow',id:p.id,version:p.version,data:p,note:'越权'},404,'运营不能通过项目接口写入（项目不可读）');
await denied('ops','/api/workspace',{action:'filing',id:p.id,version:p.version,data:p,note:'越权'},404,'运营不能通过报备接口写入（项目不可读）');
check((await ok('sales')).projects.find(v=>v.id===p.id).commercial.unitPrice===100,'运营无项目写入路径后销售商务档案保持不变');
await denied('sales2','/api/workspace',{action:'update',id:p.id,version:p.version,data:p},404,'其他销售不能修改项目报价');
let b=(await ok('sales','/api/finance',{action:'submit_contract',projectId:p.id,version:0,contractNo:'QA-COMM',contractAmountCents:12000000,paymentTerms:execution.paymentRequirements})).book;
const booked=(await ok('manager','/api/workspace')).finances[p.id];
check(booked.contractSnapshot.execution.settlement===execution.settlement&&booked.contractSnapshot.projectVersion===p.version,'合同提交保存条款批次快照');
const planId=randomUUID();b=(await ok('finance','/api/finance',{action:'review_contract',projectId:p.id,version:b.version,decision:'approved',note:'核验通过',plans:[{id:planId,label:'合同货款',amountCents:12000000,dueDate:day}]})).book;
async function fin(action,user='finance'){const r=await ok(user,'/api/finance',{...action,projectId:p.id,version:b.version});b=r.book;return b}
await denied('sales','/api/finance',{action:'create_collection',projectId:p.id,version:b.version,planId,assigneeId:users.finance.id,nextDate:day,note:'越权'},403,'销售不能维护财务催款任务');
await fin({action:'create_collection',planId,assigneeId:users.finance.id,nextDate:day,note:'联系客户确认付款审批'});const collectionId=b.collections[0].id;
check(b.collections[0].assigneeId===users.finance.id,'建立指定财务负责人的催款任务');
await denied('finance','/api/finance',{action:'create_collection',projectId:p.id,version:b.version,planId,assigneeId:users.finance.id,nextDate:day,note:'重复'},400,'同节点不重复建立活跃催款');
await fin({action:'update_collection',id:collectionId,nextDate:day,promiseDate:day,status:'已结束',note:'已完成本次催款，待核实到账'});
check(b.receipts.length===0&&b.collections[0].history.length===2,'催款结束不虚增回款并保留历史');
await ok('finance','/api/cashflow',{action:'purchase_order',requestId:randomUUID(),projectId:p.id,version:b.version,number:'PO-'+randomUUID(),supplier:'虚构厂家',amountCents:8000000,terms:'发货前付清'});
b=(await ok('finance','/api/workspace')).finances[p.id];
const purchaseOrderId=b.purchaseOrders.at(-1).id;
await ok('finance','/api/cashflow',{action:'supplier_plan',requestId:randomUUID(),projectId:p.id,version:b.version,orderId:purchaseOrderId,batchId:'batch1',amountCents:8000000,dueDate:day,note:'测试应付',cashTerms:{orderId:purchaseOrderId,trigger:'发货前付款',offsetDays:0,monthlyDay:1}});
b=(await ok('finance','/api/workspace')).finances[p.id];
const supplierId=b.suppliers[0].id;
check(b.suppliers[0].batchName==='首批','厂家付款计划关联交货批次');
await denied('finance','/api/finance',{action:'record_supplier_payment',projectId:p.id,version:b.version,id:supplierId,amountCents:8000001,date:day,reference:'OVER-'+randomUUID()},400,'厂家付款不超过未付余额');
const stale=b.version;
await fin({action:'record_supplier_payment',id:supplierId,amountCents:3000000,date:day,reference:'BANK-'+randomUUID()});
await denied('finance','/api/finance',{action:'record_supplier_payment',projectId:p.id,version:stale,id:supplierId,amountCents:3000000,date:day,reference:'BANK-DUP-'+randomUUID()},409,'厂家付款并发版本防重复');
check(b.suppliers[0].payments[0].amountCents===3000000,'实际付款金额日期凭据保存');
await denied('finance','/api/finance',{action:'void_supplier',projectId:p.id,version:b.version,id:supplierId,reason:'有付款'},400,'有效付款存在时不能作废计划');
await ok('finance','/api/cashflow',{action:'void_bank',id:b.suppliers[0].payments[0].bankId,reason:'银行退回',requestId:randomUUID()});
b=(await ok('finance','/api/workspace')).finances[p.id];
check(!!b.suppliers[0].payments[0].voidAt,'冲销保留原厂家付款流水');
check(!(await ok('sales')).finances[p.id].suppliers,'销售不返回厂家应付内部流水');
check((await ok('manager')).finances[p.id].suppliers.length===1,'管理可查看厂家付款情况');
check(!(await ok('sales')).events.some(e=>e.kind==='厂家付款记录'),'销售不可读取厂家付款内部事件');
const meetingData={title:'周一专项会议',date:day,region:'广州总部',attendees:'管理、财务、销售',minutes:'明确合同与回款条件',presidentTasks:'周总：本周落实首批交货',actions:[{id:randomUUID(),title:'确认首批交期',request:'与厂家确认后反馈，附书面依据',desk:'operations',assigneeId:users.ops.id,dueDate:day}]};
await denied('sales','/api/meetings',undefined,403,'销售不读取管理会议全文');
let meeting=(await ok('manager','/api/meetings',{action:'save',data:meetingData})).meeting;
check(meeting.minutes===meetingData.minutes&&meeting.presidentTasks===meetingData.presidentTasks,'会议纪要与周总任务保存');
check((await ok('branch','/api/meetings')).meetings.some(m=>m.id===meeting.id),'V2 公司管理可读取其他地区会议纪要');
const branchMeeting=(await ok('branch','/api/meetings',{action:'save',data:{...meetingData,title:'跨旧分部会议',region:'湖南分部'}})).meeting;
check(branchMeeting.region==='湖南分部','V2 公司管理可新增跨旧分部会议');
const beforeVersion=meeting.version;let dispatched=await ok('manager','/api/meetings',{action:'dispatch',id:meeting.id,version:meeting.version,actionId:meeting.actions[0].id});meeting=dispatched.meeting;const task=dispatched.task;
check(task.assigneeId===users.ops.id&&task.request.includes('周一专项会议'),'会议任务进入统一任务中心并保留来源');
await denied('manager','/api/meetings',{action:'dispatch',id:meeting.id,version:beforeVersion,actionId:meeting.actions[0].id},409,'重复点击派发不会生成重复任务');
await denied('manager','/api/meetings',{action:'dispatch',id:meeting.id,version:meeting.version,actionId:meeting.actions[0].id},409,'已派发行动项不可再次派发');
await denied('manager','/api/meetings',{action:'save',id:meeting.id,version:meeting.version,data:{...meeting,actions:[]}},400,'已派发行动项不可删除');
check((await ok('ops','/api/tasks')).tasks.some(t=>t.id===task.id),'承办台收到会议任务');
let handled=(await ok('ops','/api/tasks',{action:'feedback',id:task.id,version:task.version,status:'待验收',result:'厂家已书面确认首批交货期'})).task;
handled=(await ok('manager','/api/tasks',{action:'accept',id:handled.id,version:handled.version,note:''})).task;
check((await ok('manager','/api/meetings')).tasks.find(t=>t.id===task.id)?.status==='已完成','会议追踪同步承办反馈与管理验收结果');
check((await ok('branch','/api/meetings')).meetings.length>=2,'V2 公司管理看到公司全部会议');
check((await ok('owner','/api/health')).status==='ok','新迁移健康检查通过');
const legacyId='exp-project-'+randomUUID();const fixtureDb=openSqlite(database);const original=fixtureDb.prepare('SELECT * FROM projects WHERE id=?').get(p.id);fixtureDb.prepare('INSERT INTO projects(id,user_id,data,version,updated_at) VALUES(?,?,?,?,?)').run(legacyId,workspace,original.data,original.version,original.updated_at);fixtureDb.close();
const legacy=(await ok('sales')).projects.find(v=>v.id===legacyId);check(!!(await update({...legacy,notes:'兼容旧演示编号'})).version,'旧体验项目编号可保存且沿用权限校验');
check((await ok('sales','/api/finance',{action:'submit_contract',projectId:legacyId,version:0,contractNo:'LEGACY',contractAmountCents:10000,paymentTerms:'发货前付清'})).book.version===1,'旧体验项目编号可提交合同');
await denied('outside','/api/finance',{action:'submit_contract',projectId:legacyId,version:1,contractNo:'BAD',contractAmountCents:10000,paymentTerms:'越权'},404,'兼容编号仍禁止跨工作区访问');

console.log(JSON.stringify({passed:passed.length,failed}));if(failed.length)process.exitCode=1;
