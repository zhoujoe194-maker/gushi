import { z } from 'zod';
import { type Context, HttpError, directory } from './auth';
import { loadProject, projectDTO, type ProjectRow } from './projects';
import { canEditProject, canReadProject, isManager, visibleProject } from '../team';
import { hasDesk } from '../access';
import { BUSINESS_STATUSES, REASON_CATEGORIES, statusOf, reviewDate, type OutcomeRecord } from '../outcome-model';
import { today, DEFAULT_CONFIG, type Project } from '../model';
import { date } from './validation';
const text = z.string().trim().max(4000);
const reasonSchema = z.object({categoryId:z.string().min(1,'请选择主要原因'),explanation:text.min(1,'请填写具体情况说明'),improvement:text.default(''),competitor:text.default(''),reviewDate:date.default('')});
type Row={id:string;workspace_id:string;project_id:string;project_name:string;event_type:'paused'|'lost';category_id:string;category_label:string;explanation:string;owner_member_id:string|null;actor_id:string;created_at:string;review_due_date:string|null;data:string};
async function categories(ctx:Context) {
 const rows=await ctx.db.prepare('SELECT id,label,active FROM project_reason_categories WHERE workspace_id=? ORDER BY sort_order,id').bind(ctx.workspaceId).all<{id:string;label:string;active:number}>();
 // Overrides may rename/disable defaults; historical events retain a label snapshot.
 const merged=new Map(REASON_CATEGORIES.map(c=>[c.id,{...c,active:1}]));for(const c of rows.results)merged.set(c.id,c);
 return [...merged.values()].filter(c=>c.active);
}
async function reason(ctx:Context, raw:unknown) {
 const input=reasonSchema.parse(raw);const category=(await categories(ctx)).find(c=>c.id===input.categoryId);
 if(!category)throw new HttpError(400,'原因分类无效，请重新选择');
 return {...input,categoryLabel:category.label};
}
export async function outcomeData(ctx:Context,url:URL) {
 const projectId=url.searchParams.get('projectId'), requested=url.searchParams.get('memberId');
 const manager=isManager(ctx.member);
 if(projectId) await loadProject(ctx,projectId);
 else if(!manager && ctx.member.role!=='sales')throw new HttpError(403,'仅销售本人或管理可查看个人结果档案');
 if(!projectId && !manager && requested && requested!==ctx.member.id)throw new HttpError(403,'不能查看其他销售的结果档案');
 const target=projectId?'':manager?(requested||''):ctx.member.id;
 const people=await directory(ctx);
 if(target&&!people.some(m=>m.id===target))throw new HttpError(404,'成员不存在');
 const all=await ctx.db.prepare('SELECT * FROM projects WHERE user_id=?').bind(ctx.workspaceId).all<ProjectRow>();
 const projects=all.results.map(projectDTO).filter(p=>canReadProject(p,ctx.member));
 const current=projects.filter(p=>!target||p.ownerMemberId===target);
 const records=await ctx.db.prepare(`SELECT * FROM project_outcome_events WHERE workspace_id=?${projectId?' AND project_id=?':target?' AND owner_member_id=?':''} ORDER BY created_at DESC,id DESC`).bind(ctx.workspaceId,...(projectId?[projectId]:target?[target]:[])).all<Row>();
 const revisions=await ctx.db.prepare(`SELECT r.* FROM project_outcome_revisions r JOIN project_outcome_events e ON e.id=r.event_id AND e.workspace_id=r.workspace_id WHERE e.workspace_id=?${projectId?' AND e.project_id=?':target?' AND e.owner_member_id=?':''} ORDER BY r.created_at,r.rowid`).bind(ctx.workspaceId,...(projectId?[projectId]:target?[target]:[])).all<{id:string;event_id:string;actor_id:string;created_at:string;data:string}>();
 const transfers=!manager&&!projectId?await ctx.db.prepare('SELECT project_id,created_at FROM project_owner_history WHERE workspace_id=? AND previous_member_id=? ORDER BY created_at').bind(ctx.workspaceId,ctx.member.id).all<{project_id:string;created_at:string}>():{results:[]};
 const outcomes:OutcomeRecord[]=records.results.map(r=>{
  const p=projects.find(p=>p.id===r.project_id), data=JSON.parse(r.data);
  const snapshotOnly=!manager&&!projectId&&!p;
  const cutoff=snapshotOnly?transfers.results.find(h=>h.project_id===r.project_id&&h.created_at>=r.created_at)?.created_at:undefined;
  return {id:r.id,projectId:r.project_id,projectName:r.project_name,ownerMemberId:r.owner_member_id,actorId:r.actor_id,actorName:data.actorName||'历史操作人',type:r.event_type,categoryId:r.category_id,categoryLabel:r.category_label,explanation:r.explanation,createdAt:r.created_at,reviewDueDate:r.review_due_date,data,revisions:revisions.results.filter(v=>v.event_id===r.id&&(!snapshotOnly||(cutoff&&v.created_at<cutoff))).map(v=>({id:v.id,actorId:v.actor_id,createdAt:v.created_at,data:JSON.parse(v.data)})),canEdit:!!p&&canEditProject(p,ctx.member)&&(manager||r.owner_member_id===ctx.member.id)};
 });
 const cfg=await ctx.db.prepare('SELECT data FROM settings WHERE user_id=?').bind(ctx.workspaceId).first<{data:string}>();
 const days=Math.max(1,Math.min(90,Number(cfg&&JSON.parse(cfg.data).pauseReviewDays)||7));
 const queue=manager?projects.filter(p=>statusOf(p)==='已暂停').map(p=>({projectId:p.id,name:p.name,owner:p.owner,ownerMemberId:p.ownerMemberId,version:p.version,dueDate:p.pauseReviewDate||reviewDate(p.pauseReviewedAt||p.statusChangedAt||p.createdAt||p.updatedAt,days)})).filter(p=>p.dueDate<=today()).sort((a,b)=>a.dueDate.localeCompare(b.dueDate)):[];
 const reviews=projectId?await ctx.db.prepare('SELECT * FROM project_management_reviews WHERE workspace_id=? AND project_id=? ORDER BY created_at DESC,id DESC').bind(ctx.workspaceId,projectId).all():{results:[]};
 const counts={total:current.length,won:current.filter(p=>statusOf(p)==='已成交').length,paused:current.filter(p=>statusOf(p)==='已暂停').length,lost:current.filter(p=>statusOf(p)==='已丢单').length};
 const groups=(type:'paused'|'lost')=>{
  const selected=outcomes.filter(o=>o.type===type);const byCategory=new Map<string,{label:string;events:number;ids:Set<string>}>();
  for(const o of selected){const v=o.revisions.at(-1)?.data;const id=v?.categoryId||o.categoryId;const c=byCategory.get(id)||{label:v?.categoryLabel||o.categoryLabel,events:0,ids:new Set<string>()};c.events++;c.ids.add(o.projectId);byCategory.set(id,c);}
  return {events:selected.length,projects:new Set(selected.map(o=>o.projectId)).size,categories:[...byCategory.values()].map(c=>({label:c.label,events:c.events,projects:c.ids.size}))};
 };
 return {outcomes,reviews:reviews.results,counts,history:{paused:groups('paused'),lost:groups('lost')},people:manager?people.filter(m=>hasDesk(m,'sales')||records.results.some(r=>r.owner_member_id===m.id)).map(m=>({id:m.id,name:m.name})):[],selectedMemberId:target,categories:await categories(ctx),reviewDays:days,queue};
}
export async function mutateOutcome(ctx:Context,raw:Record<string,unknown>) {
 if(!raw||typeof raw!=='object'||Array.isArray(raw))throw new HttpError(400,'提交格式不正确');
 const action=z.enum(['status','revise','review','review-policy']).parse(raw.action);
 if(action==='review-policy') {
  if(!isManager(ctx.member))throw new HttpError(403,'仅管理可配置复查周期');
  const days=z.number().int().min(1).max(90).parse(raw.days);
  await ctx.db.prepare("INSERT INTO settings(user_id,data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=json_set(settings.data,'$.pauseReviewDays',?)").bind(ctx.workspaceId,JSON.stringify({...DEFAULT_CONFIG,pauseReviewDays:days}),days).run();
  return {ok:true,reviewDays:days};
 }
 const id=z.string().min(1).max(100).parse(raw.projectId),version=z.number().int().positive().parse(raw.version);
 const before=await loadProject(ctx,id);
 if(!canEditProject(before,ctx.member))throw new HttpError(403,'当前岗位不能修改销售状态或原因');
 if(before.version!==version)throw new HttpError(409,'项目已更新，请刷新后重试');
 const now=new Date().toISOString(),eventId=crypto.randomUUID(),project={...before};
 const batch:D1PreparedStatement[]=[];let note='',kind='',reasonId='';
 const add=(sql:string,...values:(string|number|null)[])=>batch.push(ctx.db.prepare(sql).bind(...values));
 const guarded=' WHERE EXISTS(SELECT 1 FROM events WHERE id=? AND user_id=?)';
 let state:typeof BUSINESS_STATUSES[number]|undefined;
 if(action==='status')state=z.enum(BUSINESS_STATUSES).parse(raw.status);
 if(action==='review') {
  if(!isManager(ctx.member))throw new HttpError(403,'仅管理可进行暂停项目复查');
  if(statusOf(before)!=='已暂停')throw new HttpError(400,'当前项目不是暂停状态');
  const review=z.object({reviewAction:z.enum(['objection','request_details','reactivate','reviewed']),content:text.min(1,'请填写管理意见'),nextReviewDate:date.default('')}).parse(raw);
  if(review.reviewAction==='reactivate')state='跟进中';
  else {project.pauseReviewedAt=now;project.pauseReviewDate=review.nextReviewDate||null;}
  kind='管理复查';note=review.content;
  add('INSERT INTO project_management_reviews(id,workspace_id,project_id,actor_id,action,content,next_review_date,created_at) SELECT ?,?,?,?,?,?,?,?'+guarded,crypto.randomUUID(),ctx.workspaceId,id,ctx.member.id,review.reviewAction,review.content,review.nextReviewDate||null,now,eventId,ctx.workspaceId);
 }
 if(state) {
  const from=statusOf(before);if(state===from)throw new HttpError(400,'项目已经是该状态，无需重复保存');
  project.businessStatus=state;project.statusChangedAt=now;project.pauseReviewedAt=undefined;project.pauseReviewDate=null;
  kind=kind||'项目状态变化';note=note||`${from} → ${state}`;
  if(state==='已暂停'||state==='已丢单') {
   const r=await reason(ctx,raw.reason);if(state==='已丢单'&&r.reviewDate)throw new HttpError(400,'丢单事件不设置暂停复查日期');
   if(state==='已暂停')project.pauseReviewDate=r.reviewDate||null;
   reasonId=crypto.randomUUID();note+=`；${r.categoryLabel}：${r.explanation}`;
   add('INSERT INTO project_outcome_events(id,workspace_id,project_id,project_name,event_type,category_id,category_label,explanation,owner_member_id,actor_id,created_at,review_due_date,data) SELECT ?,?,?,?,?,?,?,?,?,?,?,?,?'+guarded,reasonId,ctx.workspaceId,id,before.name,state==='已暂停'?'paused':'lost',r.categoryId,r.categoryLabel,r.explanation,before.ownerMemberId||null,ctx.member.id,now,r.reviewDate||null,JSON.stringify({fromStatus:from,toStatus:state,actorName:ctx.member.name,improvement:r.improvement,competitor:r.competitor}),eventId,ctx.workspaceId);
  }
 }
 if(action==='revise') {
  const outcomeId=z.string().min(1).parse(raw.outcomeId);
  const old=await ctx.db.prepare('SELECT * FROM project_outcome_events WHERE id=? AND workspace_id=? AND project_id=?').bind(outcomeId,ctx.workspaceId,id).first<Row>();
  if(!old)throw new HttpError(404,'原因记录不存在');
  if(!isManager(ctx.member)&&old.owner_member_id!==ctx.member.id)throw new HttpError(403,'他人任期的原因只能由管理更正');
  const r=await reason(ctx,raw.reason);if(old.event_type==='lost'&&r.reviewDate)throw new HttpError(400,'丢单事件不设置暂停复查日期');
  kind='原因补充与更正';note=`${r.categoryLabel}：${r.explanation}`;
  add('INSERT INTO project_outcome_revisions(id,workspace_id,event_id,actor_id,created_at,data) SELECT ?,?,?,?,?,?'+guarded,crypto.randomUUID(),ctx.workspaceId,old.id,ctx.member.id,now,JSON.stringify({...r,actorName:ctx.member.name}),eventId,ctx.workspaceId);
  // Only the currently active pause may alter the current reminder schedule.
  const latest=await ctx.db.prepare('SELECT id FROM project_outcome_events WHERE workspace_id=? AND project_id=? ORDER BY created_at DESC,rowid DESC LIMIT 1').bind(ctx.workspaceId,id).first<{id:string}>();
  if(statusOf(before)==='已暂停'&&old.event_type==='paused'&&latest?.id===old.id)project.pauseReviewDate=r.reviewDate||null;
 }
 const {id:ignoredId,version:ignoredVersion,updatedAt:ignoredDate,...data}=project;
 const event={kind,actor:ctx.member.name,actorMemberId:ctx.member.id,ownerMemberIdAtTime:before.ownerMemberId,note,changes:[],fromStatus:statusOf(before),toStatus:statusOf(project),outcomeId:reasonId||undefined};
 const mutations=[ctx.db.prepare("UPDATE projects SET data=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)").bind(JSON.stringify(data),now,id,ctx.workspaceId,version,ctx.member.id,ctx.member.version),ctx.db.prepare('INSERT INTO events(id,project_id,user_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(eventId,id,ctx.workspaceId,JSON.stringify(event),now),...batch];
 const recipients=new Set<string>();
 for(const m of await directory(ctx))if(m.status==='active'&&hasDesk(m,'management'))recipients.add(m.id);
 if(action==='review'&&before.ownerMemberId)recipients.add(before.ownerMemberId);
 for(const recipient of recipients)mutations.push(ctx.db.prepare('INSERT INTO notifications(id,workspace_id,recipient_id,project_id,message,created_at) SELECT ?,?,?,?,?,?'+guarded).bind(crypto.randomUUID(),ctx.workspaceId,recipient,id,`${before.name}：${note}`,now,eventId,ctx.workspaceId));
 const result=await ctx.db.batch(mutations);if(result[0].meta.changes!==1)throw new HttpError(409,'项目或权限已更新，请刷新重试');
 return {project:visibleProject({...project,version:version+1,updatedAt:now},ctx.member),event:{...event,id:eventId,projectId:id,createdAt:now}};
}
