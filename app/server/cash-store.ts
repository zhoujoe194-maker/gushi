import {createHash} from 'node:crypto';
import {HttpError,type Context} from './auth';
import {projectDTO,type ProjectRow} from './projects';
import {canReadProject,canViewFinance} from '../team';
import {emptyBook,type FinanceBook} from '../finance-model';
import type {CompanyBook} from '../cash-model';
import type {Project} from '../model';
export class CashStore {
 books=new Map<string,{before:FinanceBook;after:FinanceBook}>();
 projects=new Map<string,{before:Project;after:Project}>();
 company?:{before:CompanyBook;after:CompanyBook};
 extra:D1PreparedStatement[]=[];
 grants=new Set<string>();
 constructor(public ctx:Context,public requestId:string,public hash:string){}
 async project(id:string,allowGrant=false){
  let item=this.projects.get(id);if(!item){const row=await this.ctx.db.prepare('SELECT * FROM projects WHERE user_id=? AND id=?').bind(this.ctx.workspaceId,id).first<ProjectRow>();if(!row)throw new HttpError(404,'项目不存在');const p=projectDTO(row);item={before:structuredClone(p),after:p};this.projects.set(id,item);}
  if(!canReadProject(item.after,this.ctx.member)){
   const grant=allowGrant&&await this.ctx.db.prepare('SELECT member_id FROM finance_project_grants WHERE workspace_id=? AND project_id=? AND member_id=?').bind(this.ctx.workspaceId,id,this.ctx.member.id).first();
   if(!grant)throw new HttpError(404,'项目不存在或未获授权');this.grants.add(id);
  }return item.after;
 }
 async book(id:string){let b=this.books.get(id);if(!b){const row=await this.ctx.db.prepare('SELECT * FROM finance_books WHERE workspace_id=? AND project_id=?').bind(this.ctx.workspaceId,id).first<{data:string;version:number;updated_at:string}>();const data=row?{...JSON.parse(row.data),projectId:id,version:row.version,updatedAt:row.updated_at}:emptyBook(id);b={before:structuredClone(data),after:data};this.books.set(id,b);}return b.after;}
 async companyBook(){if(!this.company){const row=await this.ctx.db.prepare('SELECT * FROM finance_company WHERE workspace_id=?').bind(this.ctx.workspaceId).first<{data:string;version:number}>();const b:CompanyBook=row?{...JSON.parse(row.data),version:row.version}:{version:0,plans:[],history:[]};this.company={before:structuredClone(b),after:b};}return this.company.after;}
 gate=' EXISTS(SELECT 1 FROM finance_mutations WHERE workspace_id=? AND id=?)';
 add(sql:string,values:(string|number|null)[]){this.extra.push(this.ctx.db.prepare(sql+' AND '+this.gate).bind(...values,this.ctx.workspaceId,this.requestId));}
 async save(action:string){
  const ctx=this.ctx, now=new Date().toISOString();let conditions="EXISTS(SELECT 1 FROM members WHERE id=? AND version=? AND status='active')",args:(string|number)[]=[ctx.member.id,ctx.member.version];
  for(const id of this.grants){conditions+=' AND EXISTS(SELECT 1 FROM finance_project_grants WHERE workspace_id=? AND project_id=? AND member_id=?)';args.push(ctx.workspaceId,id,ctx.member.id);}
  for(const [id,b] of this.books){conditions+=' AND COALESCE((SELECT version FROM finance_books WHERE workspace_id=? AND project_id=?),0)=?';args.push(ctx.workspaceId,id,b.before.version);}
  for(const [id,p] of this.projects){conditions+=' AND EXISTS(SELECT 1 FROM projects WHERE user_id=? AND id=? AND version=?)';args.push(ctx.workspaceId,id,p.before.version);}
  if(this.company){conditions+=' AND COALESCE((SELECT version FROM finance_company WHERE workspace_id=?),0)=?';args.push(ctx.workspaceId,this.company.before.version);}
  const audit={action,books:[...this.books.values()],company:this.company,projects:[...this.projects.values()].filter(p=>JSON.stringify(p.before)!==JSON.stringify(p.after))};
  const statements=[ctx.db.prepare('INSERT INTO finance_mutations(id,workspace_id,actor_id,request_hash,data,created_at) SELECT ?,?,?,?,?,? WHERE '+conditions).bind(this.requestId,ctx.workspaceId,ctx.member.id,this.hash,JSON.stringify(audit),now,...args)];
  for(const [id,b] of this.books){if(JSON.stringify(b.before)===JSON.stringify(b.after))continue;b.after.version=b.before.version+1;b.after.updatedAt=now;statements.push(ctx.db.prepare('INSERT INTO finance_books(project_id,workspace_id,data,version,updated_at) SELECT ?,?,?,?,? WHERE '+this.gate+' ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,version=excluded.version,updated_at=excluded.updated_at').bind(id,ctx.workspaceId,JSON.stringify(b.after),b.after.version,now,ctx.workspaceId,this.requestId));}
  for(const [id,p] of this.projects){if(JSON.stringify(p.before)===JSON.stringify(p.after))continue;statements.push(ctx.db.prepare('UPDATE projects SET data=?,version=version+1,updated_at=? WHERE user_id=? AND id=? AND '+this.gate).bind(JSON.stringify(p.after),now,ctx.workspaceId,id,ctx.workspaceId,this.requestId));}
  if(this.company&&JSON.stringify(this.company.before)!==JSON.stringify(this.company.after)){const b=this.company;statements.push(ctx.db.prepare('INSERT INTO finance_company(workspace_id,data,version) SELECT ?,?,? WHERE '+this.gate+' ON CONFLICT(workspace_id) DO UPDATE SET data=excluded.data,version=excluded.version').bind(ctx.workspaceId,JSON.stringify(b.after),b.before.version+1,ctx.workspaceId,this.requestId));}
  statements.push(...this.extra);const result=await ctx.db.batch(statements);if(result[0].meta.changes!==1)throw new HttpError(409,'数据或权限已更新，请刷新后重试');
 }
}
export const hashRequest=(v:unknown)=>createHash('sha256').update(JSON.stringify(v)).digest('hex');
export async function cashReadProject(ctx:Context,id:string){
 const s=new CashStore(ctx,'',''),p=await s.project(id,true),b=await s.book(id);const full=canViewFinance(ctx.member),owner=canReadProject(p,ctx.member);
 return {project:{id:p.id,name:p.name,version:p.version,batches:(p.execution?.batches||[]).map(v=>({id:v.id,name:v.name,shipDate:v.shipDate,arrivalDate:v.arrivalDate,actualShipDate:v.actualShipDate,actualArrivalDate:v.actualArrivalDate,acceptedDate:v.acceptedDate,expectedAcceptanceDate:v.expectedAcceptanceDate,status:v.status}))},book:full?b:{...emptyBook(id),version:b.version,reviewStatus:b.reviewStatus,plans:owner?b.plans.map(r=>({id:r.id,label:r.label,amountCents:r.amountCents,dueDate:r.dueDate,cashStatus:r.cashStatus,certainty:r.certainty,note:r.note,history:r.history})):[],receipts:owner?b.receipts.map(r=>({id:r.id,planId:r.planId,amountCents:r.amountCents,date:r.date,reference:'',note:'',recordedBy:'',voidAt:r.voidAt})):[],reimbursements:(b.reimbursements||[]).filter(r=>r.memberId===ctx.member.id)},full};
}
