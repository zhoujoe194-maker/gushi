import {z} from 'zod';
import {HttpError} from './auth';
import type {CashStore} from './cash-store';
import {canFinance} from '../team';
import {today} from '../model';
import {calendarDate} from './validation';
import {EXPENSE_CATEGORIES,nextMonth,monthDate,paid,type CompanyPlan,type CompanyBook} from '../cash-model';
const month=z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),text=z.string().trim().max(4000);
function validateOverlap(book:CompanyBook){
 const active=book.plans.filter(p=>p.status!=='cancelled');const keys=new Set<string>();
 for(const p of active){const key=p.category+'/'+p.month+'/'+(['工资','社保','公积金'].includes(p.category)?'':p.label);if(keys.has(key))throw new HttpError(400,'该月份同类费用已存在，请修改原计划');keys.add(key);}
 for(const wage of active.filter(p=>p.category==='工资'&&p.includesBenefits&&p.status!=='draft'))if(active.some(p=>p.month===wage.month&&['社保','公积金'].includes(p.category)&&p.status!=='draft'))throw new HttpError(400,'工资已包含社保公积金，不能再次确认同月费用');
}
export async function companyMutation(s:CashStore,raw:Record<string,unknown>){
 if(!canFinance(s.ctx.member))throw new HttpError(403,'工资、费用及现金余额仅财务可维护');
 const b=await s.companyBook();if(b.version!==z.number().int().min(0).parse(raw.version))throw new HttpError(409,'公司费用已更新，请刷新');
 const now=new Date().toISOString(),audit=(note:string,before?:unknown)=>({at:now,actorId:s.ctx.member.id,note,before:before?Object.fromEntries(Object.entries(structuredClone(before)).filter(([k])=>k!=='history')):undefined});
 if(raw.action==='company_opening'){
  const opening=z.object({amountCents:z.number().int().min(0).max(1e12),date:calendarDate,note:text.min(1)}).parse(raw);if(opening.date>today())throw new HttpError(400,'期初日期不得晚于今天');b.history.push(audit('设置期初可用现金（该日零时）',b.opening));b.opening=opening;return;
 }
 if(raw.action==='company_copy'){
  const p=b.plans.find(p=>p.id===raw.id&&p.category==='工资'&&p.status!=='cancelled');if(!p)throw new HttpError(400,'请选择上月工资计划');const target=nextMonth(p.month),dueDate=calendarDate.parse(raw.dueDate);const plan:CompanyPlan={...structuredClone(p),id:crypto.randomUUID(),month:target,dueDate,status:'draft',payments:[],seriesId:undefined,history:[audit('参考上月工资生成草稿，待财务确认')]};b.plans.push(plan);validateOverlap(b);return;
 }
 if(raw.action!=='company_plan')throw new HttpError(400,'不支持的公司费用操作');
 const input=z.object({category:z.enum(EXPENSE_CATEGORIES),month,label:text.min(1),amountCents:z.number().int().positive().max(1e12),dueDate:calendarDate,certainty:z.enum(['confirmed','expected','uncertain']).default('confirmed'),status:z.enum(['draft','confirmed','cancelled','settled']).default('draft'),includesBenefits:z.boolean().default(false),note:text.default(''),repeatCount:z.number().int().min(1).max(24).default(1)}).parse(raw);
 const old=b.plans.find(p=>p.id===raw.id);if(raw.id&&!old)throw new HttpError(404,'费用计划不存在');
 if(old?.status==='settled'){
  if(input.status!=='settled')throw new HttpError(400,'已结清费用不能通过普通编辑重新打开，请先核实并冲销实际流水');
  if(input.amountCents!==old.amountCents||input.month!==old.month||input.category!==old.category||input.dueDate!==old.dueDate||input.includesBenefits!==old.includesBenefits)throw new HttpError(400,'已结清记录仅允许修改名称、备注和说明');
 }else if(input.status==='settled')throw new HttpError(400,'结清必须通过银行核销确认');
 if(old&&input.repeatCount!==1)throw new HttpError(400,'编辑单笔不能重复生成周期费用');
 if(input.category!=='工资'&&input.includesBenefits)throw new HttpError(400,'只有工资可标记包含社保公积金');
 if(old&&old.status!=='settled'&&paid(old.payments)>0){if(input.amountCents<paid(old.payments)||input.status!=='confirmed'||input.category!==old.category||input.month!==old.month)throw new HttpError(400,'已支付记录不能改月份、类别、取消或将预算调低至实付以下；请先冲销流水');}
 const seriesId=input.repeatCount>1?crypto.randomUUID():old?.seriesId;
 for(let n=0;n<input.repeatCount;n++){
  const p:CompanyPlan={...input,id:old?.id||crypto.randomUUID(),month:nextMonth(input.month,n),dueDate:monthDate(nextMonth(input.dueDate.slice(0,7),n),Number(input.dueDate.slice(8))),direction:input.category==='其他收入'?'in':'out',payments:old?.payments||[],seriesId,history:[...(old?.history||[]),audit(old?'修改公司费用':'新增公司费用',old)]};
  if(old)b.plans=b.plans.map(v=>v.id===old.id?p:v);else b.plans.push(p);
 }
 validateOverlap(b);
}
