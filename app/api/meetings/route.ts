import { z } from "zod";
import {
  getContext,
  checkOrigin,
  response,
  handleError,
  HttpError,
  directory,
} from "../../server/auth";
import { isManager, isScopedManager } from "../../team";
import { hasDesk } from "../../access";
import { meetingSchema, type Meeting } from "../../meeting-model";
import { type DeskTask } from "../../task-model";
export const dynamic = "force-dynamic";
type Row = {
  id: string;
  region: string;
  data: string;
  version: number;
  updated_at: string;
};
const dto = (r: Row): Meeting => ({
  ...JSON.parse(r.data),
  id: r.id,
  version: r.version,
  updatedAt: r.updated_at,
});
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req);
    if (!isManager(ctx.member))
      throw new HttpError(403, "会议纪要由管理台查看和维护");
    const rows = await ctx.db
      .prepare(
        "SELECT * FROM management_meetings WHERE workspace_id=? ORDER BY updated_at DESC",
      )
      .bind(ctx.workspaceId)
      .all<Row>();
    const meetings = rows.results
      .filter(
        (r) => !isScopedManager(ctx.member) || r.region === ctx.member.region,
      )
      .map(dto);
    const taskIds = new Set(
      meetings.flatMap((m) => m.actions.map((a) => a.taskId)),
    );
    const tasks = await ctx.db
      .prepare("SELECT data FROM desk_tasks WHERE workspace_id=?")
      .bind(ctx.workspaceId)
      .all<{ data: string }>();
    return response({
      meetings,
      tasks: tasks.results
        .map((r) => JSON.parse(r.data) as DeskTask)
        .filter((t) => taskIds.has(t.id)),
    });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req);
    if (!isManager(ctx.member))
      throw new HttpError(403, "仅管理台可维护会议纪要");
    const raw = await req.text();
    if (raw.length > 300000) throw new HttpError(413, "会议内容过大");
    const body = JSON.parse(raw),
      action = z.enum(["save", "dispatch"]).parse(body.action);
    let before: Meeting | null = null;
    if (body.id) {
      const row = await ctx.db
        .prepare(
          "SELECT * FROM management_meetings WHERE id=? AND workspace_id=?",
        )
        .bind(z.string().uuid().parse(body.id), ctx.workspaceId)
        .first<Row>();
      if (
        !row ||
        (isScopedManager(ctx.member) && row.region !== ctx.member.region)
      )
        throw new HttpError(404, "会议不存在或无权访问");
      before = dto(row);
      if (before.version !== body.version)
        throw new HttpError(409, "会议已被其他管理人员更新，请刷新后重试");
    }
    const now = new Date().toISOString();
    let meeting: Meeting, task: DeskTask | undefined;
    if (action === "save") {
      const input = meetingSchema.parse(body.data);
      if (isScopedManager(ctx.member) && input.region !== ctx.member.region)
        throw new HttpError(403, "仅可维护本分部会议");
      if (
        before?.actions.some((a) => a.taskId) &&
        input.region !== before.region
      )
        throw new HttpError(400, "已有派发任务的会议不能调整分部");
      for (const a of before?.actions || [])
        if (
          a.taskId &&
          JSON.stringify(input.actions.find((v) => v.id === a.id)) !==
            JSON.stringify(a)
        )
          throw new HttpError(
            400,
            "已派发行动项请在任务中心调整，不可移除或改写",
          );
      const members = await directory(ctx);
      for (const a of input.actions) {
        const old = before?.actions.find((v) => v.id === a.id);
        if (a.taskId && a.taskId !== old?.taskId)
          throw new HttpError(400, "不可自行关联未派发的任务");
        if (a.taskId) continue;
        const m = members.find(
          (m) =>
            m.id === a.assigneeId &&
            m.status === "active" &&
            hasDesk(m, a.desk),
        );
        if (
          !m ||
          (input.region !== "全部分部" &&
            m.region !== "全部分部" &&
            input.region !== m.region)
        )
          throw new HttpError(400, "行动项负责人岗位或分部不匹配");
      }
      meeting = {
        ...input,
        id: before?.id || crypto.randomUUID(),
        version: (before?.version || 0) + 1,
        updatedAt: now,
        createdBy: before?.createdBy || ctx.member.name,
        history: [
          ...(before?.history || []),
          {
            at: now,
            actor: ctx.member.name,
            note: before ? "更新会议纪要与行动安排" : "新建会议纪要",
          },
        ],
      };
    } else {
      if (!before) throw new HttpError(400, "请先保存会议");
      meeting = structuredClone(before);
      const a = meeting.actions.find((a) => a.id === body.actionId);
      if (!a) throw new HttpError(404, "行动项不存在");
      if (a.taskId) throw new HttpError(409, "该行动项已经派发，请勿重复操作");
      const m = (await directory(ctx)).find(
        (m) =>
          m.id === a.assigneeId && m.status === "active" && hasDesk(m, a.desk),
      );
      if (
        !m ||
        (meeting.region !== "全部分部" &&
          m.region !== "全部分部" &&
          m.region !== meeting.region)
      )
        throw new HttpError(400, "负责人已停用或岗位、分部不匹配");
      a.taskId = crypto.randomUUID();
      task = {
        id: a.taskId,
        version: 1,
        desk: a.desk,
        region: meeting.region,
        title: a.title,
        request: `会议：${meeting.title}（${meeting.date}）\n${a.request}`,
        dueDate: a.dueDate,
        projectId: "",
        projectName: "",
        assigneeId: m.id,
        assigneeName: m.name,
        status: "待处理",
        result: "",
        reviewNote: "",
        createdBy: ctx.member.id,
        createdByName: ctx.member.name,
        createdAt: now,
        updatedAt: now,
        history: [
          {
            at: now,
            actor: ctx.member.name,
            note: "从周会行动项派发，会议编号 " + meeting.id,
            status: "待处理",
          },
        ],
      };
      meeting.version++;
      meeting.updatedAt = now;
      meeting.history.push({
        at: now,
        actor: ctx.member.name,
        note:
          "派发任务：" + a.title + "，负责人 " + m.name + "，期限 " + a.dueDate,
      });
    }
    const first = before
      ? ctx.db
          .prepare(
            "UPDATE management_meetings SET region=?,data=?,version=?,updated_at=? WHERE id=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(
            meeting.region,
            JSON.stringify(meeting),
            meeting.version,
            now,
            meeting.id,
            ctx.workspaceId,
            before.version,
            ctx.member.id,
            ctx.member.version,
          )
      : ctx.db
          .prepare(
            "INSERT INTO management_meetings(id,workspace_id,region,data,version,updated_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(
            meeting.id,
            ctx.workspaceId,
            meeting.region,
            JSON.stringify(meeting),
            meeting.version,
            now,
            ctx.member.id,
            ctx.member.version,
          );
    const batch = [first];
    if (task)
      batch.push(
        ctx.db
          .prepare(
            "INSERT INTO desk_tasks(id,workspace_id,desk,region,project_id,data,version,updated_at) SELECT ?,?,?,?,NULL,?,1,? WHERE changes()=1",
          )
          .bind(
            task.id,
            ctx.workspaceId,
            task.desk,
            task.region,
            JSON.stringify(task),
            now,
          ),
      );
    const result = await ctx.db.batch(batch);
    if (result[0].meta.changes !== 1)
      throw new HttpError(409, "会议或账号权限已变化，请刷新后重试");
    return response({ meeting, task });
  } catch (e) {
    return handleError(e);
  }
}
