import type {FinanceBook, PaymentPlan} from './finance-model';
import type {SupplierPayable} from './finance-operations';
import type {Project} from './model';

export type Certainty = 'confirmed'|'expected'|'uncertain';
export type Audit = {at:string;actorId:string;note:string;before?:unknown};
export type CashPayment = {id:string;date:string;amountCents:number;reference:string;recordedBy:string;bankId?:string;voidAt?:string;voidReason?:string};
export type Reimbursement = {
 id:string;category:string;amountCents:number;purpose:string;memberId:string;memberName:string;
 status:'待处理'|'已确认待支付'|'已支付'|'已驳回';dueDate:string;note:string;
 voucherId?:string;payments:CashPayment[];history:Audit[];
};
export type PurchaseOrder = {id:string;number:string;supplier:string;amountCents:number;terms:string;history:Audit[]};
export type CashTerms = {orderId:string;trigger:'预付款'|'发货前付款'|'到货付款'|'验收后付款'|'月结'|'分期付款';offsetDays:number;monthlyDay:number};
export type CompanyPlan = {id:string;category:string;month:string;label:string;amountCents:number;dueDate:string;certainty:Certainty;direction:'in'|'out';status:'draft'|'confirmed'|'cancelled'|'settled';includesBenefits:boolean;note:string;seriesId?:string;payments:CashPayment[];history:Audit[]};
export type CompanyBook = {version:number;opening?:{amountCents:number;date:string;note:string};plans:CompanyPlan[];history:Audit[]};
export type Allocation = {projectId:string;kind:'customer'|'supplier'|'reimbursement'|'company';targetId:string;amountCents:number};
export type BankTransaction = {id:string;reference:string;date:string;direction:'in'|'out';amountCents:number;allocations:Allocation[];actorId:string;note:string;voidAt?:string;voidReason?:string};
export type CashLine = {id:string;projectId:string;projectName:string;label:string;category:string;direction:'in'|'out';amountCents:number;paidCents:number;remainingCents:number;dueDate:string;certainty:Certainty;status:string;payments:CashPayment[];source:string;dateWarning?:string};
export const EXPENSE_CATEGORIES=['工资','社保','公积金','租金','水电及物业','税费','贷款本金','贷款利息','其他经营支出','其他收入'] as const;
export const REIMBURSEMENT_CATEGORIES=['差旅','交通','招待','采购杂费','其他'] as const;
export const safeSum=(values:number[])=>values.reduce((sum,n)=>{if(!Number.isSafeInteger(n)||!Number.isSafeInteger(sum+n))throw Error('金额超出精确计算范围');return sum+n;},0);
export const paid=(payments:CashPayment[])=>safeSum(payments.filter(p=>!p.voidAt).map(p=>p.amountCents));
export const dateAdd=(day:string,n:number)=>new Date(Date.parse(day+'T00:00:00Z')+n*86400000).toISOString().slice(0,10);
export function monthDate(month:string,day:number){const [y,m]=month.split('-').map(Number);const last=new Date(Date.UTC(y,m,0)).getUTCDate();return `${month}-${String(Math.min(last,day)).padStart(2,'0')}`;}
export function nextMonth(month:string,n=1){const [y,m]=month.split('-').map(Number);return new Date(Date.UTC(y,m-1+n,1)).toISOString().slice(0,7);}
export function suggestedDue(p:SupplierPayable,project:Project):string {
 const t=p.cashTerms;if(!t)return p.dueDate;
 const b=project.execution?.batches.find(b=>b.id===p.batchId);
 if(t.trigger==='预付款'||t.trigger==='分期付款')return p.dueDate;
 const base=t.trigger==='发货前付款'?(b?.actualShipDate||b?.shipDate):t.trigger==='验收后付款'?(b?.acceptedDate||b?.expectedAcceptanceDate):(b?.actualArrivalDate||b?.arrivalDate);
 if(!base)return '';
 if(t.trigger==='月结')return dateAdd(monthDate(nextMonth(base.slice(0,7)),t.monthlyDay),t.offsetDays);
 return dateAdd(base,t.trigger==='发货前付款'?-t.offsetDays:t.offsetDays);
}
export function projectLines(b:FinanceBook,p:Project):CashLine[]{
 const line=(id:string,label:string,category:string,direction:'in'|'out',amountCents:number,dueDate:string,payments:CashPayment[],certainty:Certainty,status:string,source:string):CashLine=>({id,projectId:p.id,projectName:p.name,label,category,direction,amountCents,paidCents:paid(payments),remainingCents:Math.max(0,amountCents-paid(payments)),dueDate,payments,certainty,status,source});
 return [
 ...b.plans.map((r:PaymentPlan)=>line(r.id,r.label,'客户回款','in',r.amountCents,r.dueDate,b.receipts.filter(v=>v.planId===r.id),r.certainty||'expected',r.cashStatus||(b.reviewStatus==='已审核'?'confirmed':'draft'),'finance_books.plans')),
 ...(b.suppliers||[]).filter(r=>!r.voidAt).map(r=>({...line(r.id,r.supplier+' · '+(r.batchName||r.terms),'采购付款','out',r.amountCents,r.dueDate,r.payments,r.certainty||'confirmed','confirmed','finance_books.suppliers'),dateWarning:!r.cashTerms?'旧计划未关联采购订单，请补充订单与批次':suggestedDue(r,p)!==r.dueDate?(suggestedDue(r,p)||'货期不完整，待财务复核'):undefined})),
 ...(b.reimbursements||[]).map(r=>line(r.id,r.category+' · '+r.purpose,'报销','out',r.amountCents,r.dueDate,r.payments,'confirmed',r.status==='待处理'?'draft':r.status==='已驳回'?'cancelled':r.status==='已支付'?'settled':'confirmed','finance_books.reimbursements')),
 ];
}
export function companyLines(b:CompanyBook):CashLine[]{return b.plans.map(p=>({id:p.id,projectId:'',projectName:'公司',label:p.label,category:p.category,direction:p.direction,amountCents:p.amountCents,paidCents:paid(p.payments),remainingCents:p.status==='settled'?0:Math.max(0,p.amountCents-paid(p.payments)),dueDate:p.dueDate,certainty:p.certainty,status:p.status,payments:p.payments,source:'finance_company'}));}
