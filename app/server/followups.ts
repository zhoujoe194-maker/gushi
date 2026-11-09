import { z } from 'zod';
import { type Context, HttpError } from './auth';
import { loadProject } from './projects';
import { canEditProject, visibleProject } from '../team';
import { date } from './validation';
export async function appendFollowup(ctx: Context, body: Record<string, unknown>) {
  const input = z.object({id:z.string().min(1).max(100),version:z.number().int().positive(),content:z.string().trim().min(1,'请填写本次跟进内容').max(4000),nextDate:date.optional().default(''),requestId:z.string().uuid()}).parse(body);
  const before = await loadProject(ctx,input.id);
  if(!canEditProject(before,ctx.member)) throw new HttpError(403,'当前岗位不能记录销售跟进');
  const old = await ctx.db.prepare('SELECT * FROM project_followups WHERE workspace_id=? AND request_id=?').bind(ctx.workspaceId,input.requestId).first<{id:string;project_id:string;actor_id:string;actor_name:string;content:string;next_followup_date:string|null;created_at:string}>();
  if(old) {
    if(old.project_id!==input.id || old.actor_id!==ctx.member.id || old.content!==input.content || (old.next_followup_date||'')!==input.nextDate) throw new HttpError(409,'请求标识已使用，请重新打开跟进窗口');
    return {project:visibleProject(before,ctx.member),event:{id:old.id,projectId:old.project_id,createdAt:old.created_at,actor:old.actor_name,actorMemberId:old.actor_id,kind:'跟进记录',note:old.content,nextFollowupDate:old.next_followup_date,changes:[]}};
  }
  if(before.version!==input.version) throw new HttpError(409,'项目已更新，请刷新后重试；填写内容仍保留');
  const now=new Date().toISOString(), id=crypto.randomUUID();
  const project={...before,version:before.version+1,updatedAt:now,lastFollowupAt:now,latestFollowupContent:input.content,nextDate:input.nextDate};
  const {id:ignoredId,version:ignoredVersion,updatedAt:ignoredTime,...data}=project;
  const event={kind:'跟进记录',actor:ctx.member.name,actorMemberId:ctx.member.id,ownerMemberIdAtTime:before.ownerMemberId,note:input.content,nextFollowupDate:input.nextDate||null,changes:[]};
  const result=await ctx.db.batch([
    ctx.db.prepare("UPDATE projects SET data=?,version=version+1,updated_at=? WHERE id=? AND user_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)").bind(JSON.stringify(data),now,input.id,ctx.workspaceId,input.version,ctx.member.id,ctx.member.version),
    ctx.db.prepare('INSERT INTO project_followups(id,workspace_id,project_id,actor_id,actor_name,content,next_followup_date,created_at,request_id) SELECT ?,?,?,?,?,?,?,?,? WHERE changes()=1').bind(id,ctx.workspaceId,input.id,ctx.member.id,ctx.member.name,input.content,input.nextDate||null,now,input.requestId),
    ctx.db.prepare('INSERT INTO events(id,project_id,user_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1').bind(id,input.id,ctx.workspaceId,JSON.stringify(event),now),
  ]);
  if(result[0].meta.changes!==1) throw new HttpError(409,'项目或权限已更新，请刷新后重试');
  return {project:visibleProject(project,ctx.member),event:{...event,id,projectId:input.id,createdAt:now}};
}
