import type { Context } from './auth';
import { HttpError } from './auth';
import { loadProject, projectDTO, type ProjectRow } from './projects';
import { canReadProject } from '../team';
import { inTaskScope, type DeskTask } from '../task-model';
export async function readableProjectIds(ctx: Context): Promise<Set<string>> {
  const rows = await ctx.db.prepare('SELECT * FROM projects WHERE user_id=?').bind(ctx.workspaceId).all<ProjectRow>();
  return new Set(rows.results.map(projectDTO).filter(p => canReadProject(p, ctx.member)).map(p => p.id));
}
export function taskAccessible(task: DeskTask, ctx: Context, ids: Set<string>) {
  return inTaskScope(task, ctx.member) && (!task.projectId || ids.has(task.projectId));
}
export async function requireTaskProject(ctx: Context, task: DeskTask) {
  if (!inTaskScope(task, ctx.member)) throw new HttpError(404, '任务不存在或无权访问');
  if (task.projectId) await loadProject(ctx, task.projectId);
}
