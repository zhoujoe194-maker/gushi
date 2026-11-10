import {z} from 'zod';
import {HttpError,type Context} from './auth';
import {canFinance,isManager,canReadProject} from '../team';
import {today} from '../model';
import {emptyExecution} from '../business-model';
import {calendarDate} from './validation';
import {CashStore,hashRequest,cashReadProject} from './cash-store';
import {paid,safeSum,suggestedDue,REIMBURSEMENT_CATEGORIES,type Allocation,type BankTransaction,type CashPayment,type Audit} from '../cash-model';
const id=z.string().trim().min(1).max(100),text=z.string().trim().max(4000),money=z.number().int().positive().max(1e12),certainty=z.enum(['confirmed','expected','uncertain']);
export const financial=(ctx:Context)=>{if(!canFinance(ctx.member))throw new HttpError(403,'实际收付款及财务计划仅由财务维护');};
export async function mutateCash(ctx:Context,raw:Record<string,unknown>){
 const requestId=id.parse(raw.requestId),action=id.parse(raw.action),hash=hashRequest(raw);
 const replay=await ctx.db.prepare('SELECT actor_id,request_hash FROM finance_mutations WHERE workspace_id=? AND id=?').bind(ctx.workspaceId,requestId).first<{actor_id:string;request_hash:string}>();
 if(replay){if(replay.actor_id!==ctx.member.id||replay.request_hash!==hash)throw new HttpError(409,'请求编号已经使用');return {ok:true,replayed:true};}
 const s=new CashStore(ctx,requestId,hash),now=new Date().toISOString(),audit=(note:string,before?:unknown):Audit=>({at:now,actorId:ctx.member.id,note,before:before?Object.fromEntries(Object.entries(structuredClone(before)).filter(([key])=>key!=='history')):undefined});
 if(action==='settle'||action==='void_bank'){
  financial(ctx);await bankMutation(s,raw,action);await s.save(action);return {ok:true};
 }
 if(action.startsWith('company_')){const {companyMutation}=await import('./cash-company');await companyMutation(s,raw);await s.save(action);return {ok:true};}
 const projectId=id.parse(raw.projectId),p=await s.project(projectId,action==='reimburse'),b=await s.book(projectId);
 if(b.version!==z.number().int().min(0).parse(raw.version))throw new HttpError(409,'项目收支已更新，请刷新后重试');
 if(action==='grant'){
  if(!isManager(ctx.member))throw new HttpError(403,'只有管理可授予报销权限');const memberId=id.parse(raw.memberId);if(!await ctx.db.prepare("SELECT id FROM members WHERE workspace_id=? AND id=? AND status='active'").bind(ctx.workspaceId,memberId).first())throw new HttpError(400,'成员不存在');
  if(raw.revoke)s.add('DELETE FROM finance_project_grants WHERE workspace_id=? AND project_id=? AND member_id=?',[ctx.workspaceId,projectId,memberId]);
  else s.add('INSERT OR IGNORE INTO finance_project_grants SELECT ?,?,? WHERE 1=1',[ctx.workspaceId,projectId,memberId]);
 }else if(action==='reimburse'){
  const amountCents=money.parse(raw.amountCents),purpose=text.min(1).parse(raw.purpose),category=z.enum(REIMBURSEMENT_CATEGORIES).parse(raw.category),rid=crypto.randomUUID();let voucherId:string|undefined;
  if(raw.voucher){const v=z.object({name:z.string().max(150),data:z.string().max(2800000)}).parse(raw.voucher);const match=/^data:(image\/png|image\/jpeg|application\/pdf);base64,([A-Za-z0-9+/=]+)$/.exec(v.data);if(!match)throw new HttpError(400,'凭证支持 PNG、JPEG 或 PDF');const bytes=Buffer.from(match[2],'base64');if(bytes.length>2*1024*1024||!(match[1]==='image/png'?bytes.subarray(0,8).toString('hex')==='89504e470d0a1a0a':match[1]==='image/jpeg'?bytes.subarray(0,3).toString('hex')==='ffd8ff':bytes.subarray(0,5).toString()==='%PDF-'))throw new HttpError(400,'凭证格式不正确或超过2MB');voucherId=crypto.randomUUID();s.add('INSERT INTO finance_vouchers SELECT ?,?,?,?,?,?,? WHERE 1=1',[voucherId,ctx.workspaceId,projectId,rid,v.name,match[1],match[2]]);}
  (b.reimbursements||=[]).push({id:rid,category,amountCents,purpose,memberId:ctx.member.id,memberName:ctx.member.name,status:'待处理',dueDate:'',note:'',voucherId,payments:[],history:[audit('提交报销')]});
 }else if(action==='review_reimbursement'){
  financial(ctx);const r=b.reimbursements?.find(r=>r.id===raw.id);if(!r||r.status==='已支付')throw new HttpError(400,'申请不存在或已经支付');const status=z.enum(['已确认待支付','已驳回']).parse(raw.status);if(paid(r.payments))throw new HttpError(400,'部分支付后不能驳回或重新审核，请先冲销银行流水');r.history.push(audit('审核报销',r));r.status=status;r.note=text.min(1).parse(raw.note);r.dueDate=status==='已确认待支付'?calendarDate.parse(raw.dueDate):'';
 }else if(action==='customer_plan'){
  if(!canReadProject(p,ctx.member))throw new HttpError(403,'无权提交收款计划');const input=z.object({id:id.optional(),label:text.min(1),amountCents:money,dueDate:calendarDate,note:text.default(''),certainty:certainty.default('expected')}).parse(raw);
  if(!canFinance(ctx.member)&&ctx.member.role!=='sales')throw new HttpError(403,'管理只读，收款计划由销售提交或财务确认');
  const old=b.plans.find(v=>v.id===input.id);if(input.id&&!old)throw new HttpError(404,'收款计划不存在');
  if(old&&!canFinance(ctx.member))throw new HttpError(403,'已有收款计划由财务调整');
  const received=paid(b.receipts.filter(v=>v.planId===old?.id));if(input.amountCents<received)throw new HttpError(400,'计划金额不能低于已收金额');
  const r={...input,id:old?.id||crypto.randomUUID(),cashStatus:canFinance(ctx.member)?'confirmed' as const:'draft' as const,history:[...(old?.history||[]),audit(old?'修改收款计划':'新增收款信息',old)]};if(old)b.plans=b.plans.map(v=>v.id===old.id?r:v);else b.plans.push(r);
 }else if(action==='purchase_order'){
  financial(ctx);const input=z.object({number:text.min(1),supplier:text.min(1),amountCents:money,terms:text.min(1)}).parse(raw);if(b.purchaseOrders?.some(o=>o.number===input.number))throw new HttpError(400,'采购订单号重复');(b.purchaseOrders||=[]).push({...input,id:crypto.randomUUID(),history:[audit('新增采购订单')]});
 }else if(action==='supplier_plan'){
  financial(ctx);const old=b.suppliers?.find(v=>v.id===raw.id);if(raw.id&&!old)throw new HttpError(404,'付款计划不存在');if(old?.voidAt)throw new HttpError(400,'计划已作废');
  const terms=z.object({orderId:id,trigger:z.enum(['预付款','发货前付款','到货付款','验收后付款','月结','分期付款']),offsetDays:z.number().int().min(0).max(365),monthlyDay:z.number().int().min(1).max(31)}).parse(raw.cashTerms);
  const order=b.purchaseOrders?.find(o=>o.id===terms.orderId),batch=p.execution?.batches.find(v=>v.id===raw.batchId);if(!order||!batch)throw new HttpError(400,'请选择采购订单及有效交付批次');
  const value=money.parse(raw.amountCents);if(value<paid(old?.payments||[]))throw new HttpError(400,'计划金额低于已付金额');
  const allocated=safeSum((b.suppliers||[]).filter(v=>!v.voidAt&&v.id!==old?.id&&v.cashTerms?.orderId===order.id).map(v=>v.amountCents));if(allocated+value>order.amountCents)throw new HttpError(400,'付款计划合计超出采购订单总额');
  const next={...old,id:old?.id||crypto.randomUUID(),supplier:order.supplier,batchId:batch.id,batchName:batch.name,amountCents:value,dueDate:calendarDate.parse(raw.dueDate),terms:order.terms,note:text.parse(raw.note||''),createdBy:old?.createdBy||ctx.member.id,payments:old?.payments||[],cashTerms:terms,certainty:certainty.parse(raw.certainty||'confirmed'),history:[...(old?.history||[]),audit('财务确认付款计划',old)]};
  if(old)b.suppliers=b.suppliers!.map(v=>v.id===old.id?next:v);else (b.suppliers||=[]).push(next);
 }else if(action==='delivery'){
  financial(ctx);const input=z.object({id:id.optional(),name:text.min(1),shipDate:calendarDate.or(z.literal('')),arrivalDate:calendarDate.or(z.literal('')),expectedAcceptanceDate:calendarDate.or(z.literal('')),actualShipDate:calendarDate.or(z.literal('')),actualArrivalDate:calendarDate.or(z.literal('')),acceptedDate:calendarDate.or(z.literal(''))}).parse(raw);
  if([input.actualShipDate,input.actualArrivalDate,input.acceptedDate].some(d=>d>today()))throw new HttpError(400,'实际货期不能晚于今天');
  if(input.shipDate&&input.arrivalDate&&input.shipDate>input.arrivalDate)throw new HttpError(400,'预计到货早于发货');if(input.actualArrivalDate&&(!input.actualShipDate||input.actualArrivalDate<input.actualShipDate))throw new HttpError(400,'请先记录有效实际发货日期');if(input.acceptedDate&&(!input.actualArrivalDate||input.acceptedDate<input.actualArrivalDate))throw new HttpError(400,'请先记录有效实际到货日期');
  const execution=p.execution||emptyExecution(),old=execution.batches.find(v=>v.id===input.id);if(input.id&&!old)throw new HttpError(404,'批次不存在');const batch={goods:'',quantity:null,unit:'',paymentTrigger:'待确认' as const,paymentDueDate:'',paymentTerms:'',note:'',...old,...input,id:old?.id||crypto.randomUUID(),status:input.acceptedDate?'已验收' as const:input.actualArrivalDate?'已到货' as const:input.actualShipDate?'已发货' as const:'计划中' as const};if(old)execution.batches=execution.batches.map(v=>v.id===old.id?batch:v);else execution.batches.push(batch);execution.batchCount=Math.max(execution.batchCount,execution.batches.length);p.execution=execution;
 }else throw new HttpError(400,'不支持的收支操作');
 await s.save(action);return {ok:true};
}
async function bankMutation(s:CashStore,raw:Record<string,unknown>,action:string){
 const {ctx}=s,now=new Date().toISOString();let transaction:BankTransaction;
 if(action==='void_bank'){
  const row=await ctx.db.prepare('SELECT data FROM bank_transactions WHERE workspace_id=? AND id=?').bind(ctx.workspaceId,id.parse(raw.id)).first<{data:string}>();if(!row)throw new HttpError(404,'银行流水不存在');transaction=JSON.parse(row.data);if(transaction.voidAt)throw new HttpError(400,'流水已经冲销');transaction.voidAt=now;transaction.voidReason=text.min(1).parse(raw.reason);
 }else{
  const input=z.object({reference:z.string().trim().min(1).max(150),date:calendarDate,direction:z.enum(['in','out']),amountCents:money,note:text.default(''),allocations:z.array(z.object({projectId:z.string().max(100),kind:z.enum(['customer','supplier','reimbursement','company']),targetId:id,amountCents:money})).min(1).max(100)}).parse(raw);
  if(input.date>today())throw new HttpError(400,'实际收付款不能使用未来日期');if(safeSum(input.allocations.map(a=>a.amountCents))!==input.amountCents)throw new HttpError(400,'分摊总额必须等于银行流水');if(new Set(input.allocations.map(a=>`${a.projectId}/${a.kind}/${a.targetId}`)).size!==input.allocations.length)throw new HttpError(400,'同一计划不能重复分摊');
  if(await ctx.db.prepare('SELECT id FROM bank_transactions WHERE workspace_id=? AND reference=?').bind(ctx.workspaceId,input.reference).first())throw new HttpError(409,'银行流水号已登记，不可重复核销');
  const all=await ctx.db.prepare('SELECT data FROM finance_books WHERE workspace_id=?').bind(ctx.workspaceId).all<{data:string}>();if(all.results.some(v=>{const b=JSON.parse(v.data);return [...(b.receipts||[]),...(b.suppliers||[]).flatMap((p:{payments:CashPayment[]})=>p.payments)].some((p:CashPayment)=>p.reference===input.reference&&!p.voidAt);}))throw new HttpError(409,'流水号已在原票款记录中登记');
  transaction={...input,id:crypto.randomUUID(),actorId:ctx.member.id};
 }
 for(const a of transaction.allocations){
  let payments:CashPayment[],amountCents:number;let reimbursement:import('../cash-model').Reimbursement|undefined,companyPlan:import('../cash-model').CompanyPlan|undefined;
  if(a.kind==='company'){
   if(a.projectId)throw new HttpError(400,'公司费用不可绑定项目');const c=await s.companyBook(),p=c.plans.find(p=>p.id===a.targetId);if(!p||(!transaction.voidAt&&p.status!=='confirmed'))throw new HttpError(400,'公司计划尚未确认或已结清');if(p.direction!==transaction.direction)throw new HttpError(400,'收支方向不匹配');payments=p.payments;amountCents=p.amountCents;companyPlan=p;
  }else{
   await s.project(a.projectId);const b=await s.book(a.projectId);
   if(a.kind==='customer'){
    const p=b.plans.find(p=>p.id===a.targetId);if(!p||(!transaction.voidAt&&(p.cashStatus?p.cashStatus!=='confirmed':b.reviewStatus!=='已审核')))throw new HttpError(400,'客户收款计划未确认');if(transaction.direction!=='in')throw new HttpError(400,'客户货款应为收入');payments=b.receipts.filter(r=>r.planId===p.id);amountCents=p.amountCents;
   }else if(a.kind==='supplier'){
    const p=b.suppliers?.find(p=>p.id===a.targetId&&!p.voidAt);if(!p)throw new HttpError(400,'采购计划不存在');if(transaction.direction!=='out')throw new HttpError(400,'采购为支出');payments=p.payments;amountCents=p.amountCents;
   }else{const p=b.reimbursements?.find(p=>p.id===a.targetId);if(!p||(!transaction.voidAt&&p.status!=='已确认待支付'))throw new HttpError(400,'报销尚未确认或已经支付');if(transaction.direction!=='out')throw new HttpError(400,'报销为支出');payments=p.payments;amountCents=p.amountCents;reimbursement=p;}
  }
  if(transaction.voidAt){const payment=payments.find(p=>p.bankId===transaction.id&&!p.voidAt);if(!payment)throw new HttpError(409,'核销记录已改变，不能部分冲销');payment.voidAt=transaction.voidAt;payment.voidReason=transaction.voidReason;if(reimbursement)reimbursement.status='已确认待支付';if(companyPlan)companyPlan.status='confirmed';}
  else{
   if(a.amountCents>amountCents-paid(payments))throw new HttpError(400,'本次金额超过剩余未收付款');
   const payment:CashPayment={id:crypto.randomUUID(),bankId:transaction.id,date:transaction.date,amountCents:a.amountCents,reference:transaction.reference,recordedBy:ctx.member.id};
   if(a.kind==='customer'){const b=await s.book(a.projectId);b.receipts.push({...payment,planId:a.targetId,note:transaction.note});}else payments.push(payment);
   if(reimbursement&&paid(payments)===amountCents)reimbursement.status='已支付';if(companyPlan&&(raw.close===true||paid(payments)===amountCents))companyPlan.status='settled';
  }
 }
 if(action==='void_bank')s.add('UPDATE bank_transactions SET data=?,version=version+1 WHERE workspace_id=? AND id=?',[JSON.stringify(transaction),ctx.workspaceId,transaction.id]);
 else s.add('INSERT INTO bank_transactions(id,workspace_id,reference,data) SELECT ?,?,?,? WHERE 1=1',[transaction.id,ctx.workspaceId,transaction.reference,JSON.stringify(transaction)]);
}
