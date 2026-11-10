import {cashForecast,projectFunding,type Scenario} from '../../cash-forecast';
import {today} from '../../model';
import {getContext,directory,checkOrigin,handleError,response,HttpError} from '../../server/auth';
import {mutateCash} from '../../server/cash';
import {cashReadProject,CashStore} from '../../server/cash-store';
import {canViewFinance,isManager} from '../../team';
import {projectDTO,type ProjectRow} from '../../server/projects';
import {projectLines,companyLines,suggestedDue} from '../../cash-model';
import {emptyBook,type FinanceBook} from '../../finance-model';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{
 const ctx=await getContext(req),url=new URL(req.url),projectId=url.searchParams.get('projectId');
 if(projectId){const data=await cashReadProject(ctx,projectId);const s=new CashStore(ctx,'',''),p=await s.project(projectId,true);return response({...data,grantPeople:isManager(ctx.member)?(await directory(ctx)).filter(m=>m.status==='active').map(m=>({id:m.id,name:m.name})):[],funding:data.full?projectFunding(projectLines(data.book,p),today(),'base'):undefined,lines:projectLines(data.book,p),suggestions:data.full?(data.book.suppliers||[]).filter(v=>!v.voidAt).map(v=>({id:v.id,dueDate:suggestedDue(v,p)})):[]});}
 if(url.searchParams.get('mine')==='1'){const rows=await ctx.db.prepare("SELECT p.* FROM projects p WHERE p.user_id=? AND (json_extract(p.data,'$.ownerMemberId')=? OR EXISTS(SELECT 1 FROM finance_project_grants g WHERE g.workspace_id=p.user_id AND g.project_id=p.id AND g.member_id=?))").bind(ctx.workspaceId,ctx.member.id,ctx.member.id).all<ProjectRow>();return response({projects:rows.results.map(r=>({id:r.id,name:JSON.parse(r.data).name}))});}
 if(!canViewFinance(ctx.member))throw new HttpError(403,'公司现金流仅管理和财务可查看');
 const rows=await ctx.db.prepare('SELECT * FROM projects WHERE user_id=?').bind(ctx.workspaceId).all<ProjectRow>();
 const books=await ctx.db.prepare('SELECT * FROM finance_books WHERE workspace_id=?').bind(ctx.workspaceId).all<{project_id:string;data:string;version:number}>();
 const bank=await ctx.db.prepare('SELECT data FROM bank_transactions WHERE workspace_id=?').bind(ctx.workspaceId).all<{data:string}>();
 const s=new CashStore(ctx,'',''),company=await s.companyBook();
 const lines=rows.results.flatMap(r=>{const p=projectDTO(r),row=books.results.find(b=>b.project_id===p.id),book:FinanceBook=row?{...JSON.parse(row.data),version:row.version,projectId:p.id}:emptyBook(p.id);return projectLines(book,p);});
 const scenario=url.searchParams.get('scenario')||'base';if(!['base','conservative','optimistic'].includes(scenario))throw new HttpError(400,'预测情景无效');
 const allLines=[...lines,...companyLines(company)];
 return response({company,forecast:cashForecast(allLines,company,today(),scenario as Scenario),lines:allLines,bank:bank.results.map(r=>JSON.parse(r.data)),projects:rows.results.map(r=>({id:r.id,name:JSON.parse(r.data).name}))});
 }catch(e){return handleError(e);}}
export async function POST(req:Request){try{checkOrigin(req);const ctx=await getContext(req),raw=await req.text();if(raw.length>3000000)throw new HttpError(413,'提交内容过大');const body=JSON.parse(raw);if(!body||Array.isArray(body)||typeof body!=='object')throw new HttpError(400,'请求格式无效');return response(await mutateCash(ctx,body));}catch(e){return handleError(e);}}
