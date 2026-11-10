import type { Project } from './model';
export const BUSINESS_STATUSES = ['跟进中','已成交','已暂停','已丢单'] as const;
export type BusinessStatus = typeof BUSINESS_STATUSES[number];
export const REASON_CATEGORIES = [
 {id:'price',label:'价格竞争力不足'}, {id:'budget',label:'客户预算或资金问题'},
 {id:'competitor',label:'竞争对手中标'}, {id:'followup',label:'跟进不及时'},
 {id:'technical',label:'产品或技术不符合要求'}, {id:'delay',label:'项目延期或取消'}, {id:'other',label:'其他'},
];
export function statusOf(p: Pick<Project,'stage'|'businessStatus'>): BusinessStatus {
 if(p.businessStatus) return p.businessStatus;
 if(p.stage==='已暂停'||p.stage==='已丢单') return p.stage;
 return ['已结项','合同履约','售后复盘'].includes(p.stage)?'已成交':'跟进中';
}
export function reviewDate(base: string, days: number): string {
 const day=base.includes('T')?new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Shanghai',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(base)):base;
 return new Date(Date.parse(day+'T00:00:00Z')+days*86400000).toISOString().slice(0,10);
}
export type OutcomeRecord = {
 id:string; projectId:string; projectName:string; ownerMemberId:string|null; actorId:string; actorName:string;
 type:'paused'|'lost'; categoryId:string; categoryLabel:string; explanation:string; createdAt:string;
 reviewDueDate:string|null; data:{fromStatus?:string;toStatus?:string;improvement?:string;competitor?:string};
 revisions:{id:string;actorId:string;createdAt:string;data:{categoryId:string;categoryLabel:string;explanation:string;improvement:string;competitor:string;reviewDate:string;actorName:string}}[];
 canEdit:boolean;
};
