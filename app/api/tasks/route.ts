import { z } from 'zod';
import { readableProjectIds, taskAccessible, requireTaskProject } from '../../server/resource-access';
import {
  getContext,
  handleError,
  response,
  checkOrigin,
  HttpError,
  directory,
} from '../../server/auth';
import { hasDesk } from '../../access';
import { DESK_IDS, isManager, isScopedManager } from '../../team';
import {
  DeskTask,
  inTaskScope,
  canHandleTask,
  canDispatchTask,
  canManageTask,
} from '../../task-model';
import { calendarDate } from '../../server/validation';
import { loadProject } from '../../server/projects';
import { workflowOf } from '../../workflow';
import { MAX_TASK_IMAGES } from '../../task-images';
import { readTaskBody, prepareTaskImage } from '../../server/task-images';
export const dynamic = 'force-dynamic';
type Row = { id: string; data: string; version: number; updated_at: string };
const dto = (r: Row): DeskTask => ({
  ...JSON.parse(r.data),
  id: r.id,
  version: r.version,
  updatedAt: r.updated_at,
});
const fields = z.object({
  title: z.string().trim().min(1, '请填写任务名称').max(150),
  request: z.string().trim().min(1, '请填写任务要求').max(4000),
  desk: z.enum(DESK_IDS),
  dueDate: calendarDate,
  region: z.enum(['全部分部', '广州总部', '湖南分部']),
  projectId: z.string().max(100).default(''),
  assigneeId: z.string().max(100).default(''),
});
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req);
    const rows = await ctx.db
      .prepare(
        'SELECT * FROM desk_tasks WHERE workspace_id=? ORDER BY updated_at DESC',
      )
      .bind(ctx.workspaceId)
      .all<Row>();
    const ms = await directory(ctx);
    const ids = await readableProjectIds(ctx);
    return response({
      tasks: rows.results
        .map(dto)
        .filter((t) => taskAccessible(t, ctx, ids))
        .map((t) => ({
          ...t,
          assigneeName:
            ms.find((m) => m.id === t.assigneeId)?.name || t.assigneeName,
        })),
    });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req);
    const { body, files } = await readTaskBody(req);
    const action = z
        .enum(['create', 'edit', 'feedback', 'accept', 'return', 'cancel'])
        .parse(body.action),
      manager = isManager(ctx.member);
    if (files.length && action !== 'feedback')
      throw new HttpError(400, '图片请随任务进展或验收结果提交');
    const prepared: Awaited<ReturnType<typeof prepareTaskImage>>[] = [];
    let old: DeskTask | null = null;
    if (action !== 'create') {
      const id = z.string().max(100).parse(body.id);
      const r = await ctx.db
        .prepare('SELECT * FROM desk_tasks WHERE id=? AND workspace_id=?')
        .bind(id, ctx.workspaceId)
        .first<Row>();
      if (!r || !inTaskScope(dto(r), ctx.member))
        throw new HttpError(404, '任务不存在或无权访问');
      old = dto(r);
      await requireTaskProject(ctx, old);
      if (old.version !== body.version)
        throw new HttpError(409, '任务已被其他人更新，请刷新后重新打开');
    }
    const now = new Date().toISOString();
    let task: DeskTask;
    let note = '';
    if (action === 'create' || action === 'edit') {
      if (
        !canDispatchTask(ctx.member) ||
        (old && !canManageTask(old, ctx.member))
      )
        throw new HttpError(
          403,
          '仅销售或管理可以下发任务，销售只能调整自己下发的任务',
        );
      if (old && ['已完成', '已取消', '待验收'].includes(old.status))
        throw new HttpError(400, '请先退回任务，再调整要求');
      const input = fields.parse(body.data);
      let projectName = '';
      let region: string = input.region;
      if (input.projectId) {
        const p = await loadProject(ctx, input.projectId);
        projectName = p.name;
        region = workflowOf(p).region;
        if (region === '待分配') region = input.region;
      }
      let assigneeName = '';
      if (input.assigneeId) {
        const member = (await directory(ctx)).find(
          (m) =>
            m.id === input.assigneeId &&
            m.status === 'active' &&
            hasDesk(m, input.desk),
        );
        if (!member) throw new HttpError(400, '请选择目标台内的有效成员');
        assigneeName = member.name;
      }
      const moved =
        old &&
        (old.desk !== input.desk ||
          old.assigneeId !== input.assigneeId ||
          old.region !== region);
      task = {
        ...(old || {}),
        ...input,
        region,
        projectName,
        assigneeName,
        id: old?.id || crypto.randomUUID(),
        version: (old?.version || 0) + 1,
        status: moved ? '待处理' : old?.status || '待处理',
        result: moved ? '' : old?.result || '',
        images: moved ? [] : old?.images || [],
        reviewNote: '',
        createdBy: old?.createdBy || ctx.member.id,
        createdByName: old?.createdByName || ctx.member.name,
        createdAt: old?.createdAt || now,
        updatedAt: now,
        history: old?.history || [],
      };
      note =
        action === 'create'
          ? '派发任务，完成期限 ' + input.dueDate
          : '调整任务要求 / 期限：' +
            old?.dueDate +
            ' → ' +
            input.dueDate +
            (moved ? '，重新派发至 ' + input.desk : '');
    } else {
      if (!old) throw new HttpError(404, '任务不存在');
      task = { ...old, version: old.version + 1, updatedAt: now };
      if (['已完成', '已取消'].includes(old.status))
        throw new HttpError(400, '任务已关闭，不能继续修改');
      if (action === 'feedback') {
        if (!canHandleTask(old, ctx.member))
          throw new HttpError(403, '此任务由指定成员处理');
        if (old.status === '待验收')
          throw new HttpError(400, '任务已提交，请等待管理验收');
        const status = z.enum(['处理中', '待验收']).parse(body.status),
          result = z.string().trim().max(4000).parse(body.result);
        if (status === '待验收' && !result)
          throw new HttpError(400, '提交验收必须填写处理结果');
        const retainedIds =
          body.retainedImageIds === undefined
            ? (old.images || []).map((image) => image.id)
            : z
                .array(z.string().uuid())
                .max(MAX_TASK_IMAGES)
                .parse(body.retainedImageIds);
        if (
          new Set(retainedIds).size !== retainedIds.length ||
          retainedIds.some(
            (id: string) =>
              !(old.images || []).some((image) => image.id === id),
          )
        )
          throw new HttpError(
            400,
            '保留的图片不属于当前任务结果，请刷新后重试',
          );
        if (retainedIds.length + files.length > MAX_TASK_IMAGES)
          throw new HttpError(400, '每个任务当前最多保留 6 张图片');
        for (const file of files)
          prepared.push(await prepareTaskImage(file, ctx.member.name, now));
        task.status = status;
        task.result = result;
        task.images = [
          ...(old.images || []).filter((image) =>
            retainedIds.includes(image.id),
          ),
          ...prepared.map((p) => p.image),
        ];
        task.reviewNote = '';
        if (!task.assigneeId) {
          task.assigneeId = ctx.member.id;
          task.assigneeName = ctx.member.name;
        }
        note =
          (status === '待验收'
            ? '提交处理结果，等待管理验收'
            : '更新处理进展') +
          (result ? '：' + result : '') +
          `；本次结果图片 ${task.images.length} 张（新增 ${prepared.length} 张）`;
      } else {
        if (action === 'cancel' ? !canManageTask(old, ctx.member) : !manager)
          throw new HttpError(
            403,
            '验收与退回由管理台处理；取消任务需为管理人员或任务下发人',
          );
        const review = z
          .string()
          .trim()
          .max(2000)
          .parse(body.note || '');
        if (action === 'accept') {
          if (old.status !== '待验收')
            throw new HttpError(400, '仅能验收已提交结果的任务');
          task.status = '已完成';
          note = '验收通过';
        } else if (action === 'return') {
          if (!review) throw new HttpError(400, '请填写退回原因');
          task.status = '处理中';
          note = '退回补充：' + review;
        } else {
          if (!review) throw new HttpError(400, '请填写取消原因');
          task.status = '已取消';
          note = '取消任务：' + review;
        }
        task.reviewNote = review;
      }
    }
    task.history = [
      ...task.history,
      {
        at: now,
        actor: ctx.member.name,
        note,
        status: task.status,
        ...(action === 'feedback' ? { images: task.images } : {}),
      },
    ];
    const eventId = crypto.randomUUID();
    const first = old
      ? ctx.db
          .prepare(
            "UPDATE desk_tasks SET desk=?,region=?,project_id=?,data=?,version=?,updated_at=? WHERE id=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(
            task.desk,
            task.region,
            task.projectId || null,
            JSON.stringify(task),
            task.version,
            now,
            task.id,
            ctx.workspaceId,
            old.version,
            ctx.member.id,
            ctx.member.version,
          )
      : ctx.db
          .prepare(
            "INSERT INTO desk_tasks(id,workspace_id,desk,region,project_id,data,version,updated_at) SELECT ?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(
            task.id,
            ctx.workspaceId,
            task.desk,
            task.region,
            task.projectId || null,
            JSON.stringify(task),
            task.version,
            now,
            ctx.member.id,
            ctx.member.version,
          );
    const batch = [
      first,
      ctx.db
        .prepare(
          'INSERT INTO member_audit(id,workspace_id,actor_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1',
        )
        .bind(
          eventId,
          ctx.workspaceId,
          ctx.member.id,
          JSON.stringify({
            action: '任务' + action,
            taskId: task.id,
            note,
            status: task.status,
          }),
          now,
        ),
    ];
    for (const p of prepared)
      batch.push(
        ctx.db
          .prepare(
            'INSERT INTO task_images(id,workspace_id,task_id,content_base64,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM member_audit WHERE id=?)',
          )
          .bind(p.image.id, ctx.workspaceId, task.id, p.content, now, eventId),
      );
    if (task.projectId)
      batch.push(
        ctx.db
          .prepare(
            'INSERT INTO events(id,project_id,user_id,data,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM member_audit WHERE id=?)',
          )
          .bind(
            crypto.randomUUID(),
            task.projectId,
            ctx.workspaceId,
            JSON.stringify({
              kind: '任务进度',
              actor: ctx.member.name,
              note: '关联任务进度已更新；任务详情由下发人、承办台与管理台查看。',
              changes: [`任务状态：${task.status}`],
            }),
            now,
            eventId,
          ),
      );
    const results = await ctx.db.batch(batch);
    if (results[0].meta.changes !== 1)
      throw new HttpError(409, '任务或账号权限已更新，请刷新重试');
    return response({ task });
  } catch (e) {
    return handleError(e);
  }
}
