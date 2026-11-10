import { statusOf } from '../outcome-model';
import { hasDesk } from "../access";
import { departmentDesk } from "../workflow";
import { Context, HttpError } from "./auth";
import { Project } from "../model";
import {
  canReadProject,
  canEditProject,
  isManager,
  Member,
  roleInfo,
  canCheckDepartment,
  matchesDepartment,
  canEditFact,
  canEditMilestone,
  taskVisible,
} from "../team";
import {
  GUIDES,
  MILESTONES,
  Workflow,
  workflowOf,
  DepartmentId,
} from "../workflow";
export type ProjectRow = {
  id: string;
  user_id: string;
  data: string;
  version: number;
  updated_at: string;
};
export const projectDTO = (r: ProjectRow): Project => ({
  ...JSON.parse(r.data),
  businessStatus: statusOf(JSON.parse(r.data)),
  statusChangedAt: JSON.parse(r.data).statusChangedAt || r.updated_at,
  id: r.id,
  version: r.version,
  updatedAt: r.updated_at,
});
export async function loadProject(ctx: Context, id: string) {
  const row = await ctx.db
    .prepare("SELECT * FROM projects WHERE id=? AND user_id=?")
    .bind(id, ctx.workspaceId)
    .first<ProjectRow>();
  if (!row) throw new HttpError(404, "项目不存在或无权访问");
  const project = projectDTO(row);
  if (!canReadProject(project, ctx.member))
    throw new HttpError(404, "项目不存在或无权访问");
  return project;
}
const same = (a: unknown, b: unknown) =>
  JSON.stringify(a) === JSON.stringify(b);
export function validateAssignments(
  project: Project,
  members: Member[],
  before: Project | null = null,
) {
  if (project.ownerMemberId) {
    const m = members.find(
      (x) =>
        x.id === project.ownerMemberId &&
        (x.status === "active" || before?.ownerMemberId === x.id),
    );
    if (
      !m ||
      (!(hasDesk(m, "sales") || hasDesk(m, "management")) &&
        before?.ownerMemberId !== m.id)
    )
      throw new HttpError(400, "请选择有效的项目主跟成员");
    project.owner = m.name;
  }
  const w = project.workflow;
  if (!w) return;
  if (new Set(w.tasks.map((t) => t.id)).size !== w.tasks.length)
    throw new HttpError(400, "协作事项编号重复");
  if (
    new Set(project.opportunities.map((o) => o.id)).size !==
    project.opportunities.length
  )
    throw new HttpError(400, "产品机会编号重复");
  for (const [dep, id] of Object.entries(w.assignmentMembers || {})) {
    if (!id) continue;
    const m = members.find((x) => x.id === id);
    if (
      !m ||
      (m.status !== "active" &&
        before?.workflow?.assignmentMembers?.[dep as DepartmentId] !== id) ||
      (!hasDesk(m, departmentDesk(dep)) &&
        before?.workflow?.assignmentMembers?.[dep as DepartmentId] !== id)
    )
      throw new HttpError(400, "部门对接人岗位不匹配");
    w.assignments[dep as DepartmentId] = m.name;
  }
  for (const t of w.tasks) {
    if (t.assigneeMemberId) {
      const m = members.find((x) => x.id === t.assigneeMemberId);
      if (
        !m ||
        (m.status !== "active" &&
          !before?.workflow?.tasks.some(
            (p) => p.id === t.id && p.assigneeMemberId === m.id,
          )) ||
        (!hasDesk(m, departmentDesk(t.department)) &&
          !before?.workflow?.tasks.some(
            (p) => p.id === t.id && p.assigneeMemberId === m.id,
          ))
      )
        throw new HttpError(400, "协作承办人岗位不匹配或已停用");
      t.assignee = m.name;
    }
  }
}
export function enforceWorkflow(ctx: Context, before: Project, after: Project) {
  const m = ctx.member,
    w = workflowOf(after),
    old = workflowOf(before);
  if (!canReadProject(before, m)) throw new HttpError(404, "无权访问此项目");
  if (!canEditProject(before, m)) {
    for (const k of [
      "commercial",
      "execution",
      "name",
      "location",
      "type",
      "source",
      "owner",
      "ownerMemberId",
      "stage",
      "amount",
      "customer",
      "designer",
      "contractor",
      "contact",
      "phone",
      "nextAction",
      "nextDate",
      "notes",
      "opportunities",
    ] as const)
      if (
        !same(before[k], after[k]) &&
        !(
          k === "opportunities" &&
          ["project", "operations"].includes(m.role) &&
          before.opportunities.length === after.opportunities.length &&
          after.opportunities.every((o, i) => {
            const p = before.opportunities[i];
            return (
              o.id === p.id &&
              o.productId === p.productId &&
              o.drawing === p.drawing &&
              o.tender === p.tender &&
              o.note === p.note
            );
          })
        )
      )
        throw new HttpError(
          403,
          "当前岗位不能修改销售项目主档，请在协作事项中反馈",
        );
  }
  if (!isManager(m)) {
    if (
      m.role !== "sales" &&
      (!same(old.assignments, w.assignments) ||
        !same(old.assignmentMembers || {}, w.assignmentMembers || {}) ||
        old.region !== w.region)
    )
      throw new HttpError(403, "当前岗位不能重新分配项目");
    if (m.role === "sales" && old.region !== w.region)
      throw new HttpError(403, "项目跨分部调整需由管理人员操作");
    for (const guide of GUIDES)
      for (const c of guide.checks)
        if (
          !!old.checklist[c.id] !== !!w.checklist[c.id] &&
          !canCheckDepartment(m, c.department)
        )
          throw new HttpError(403, "只能核对本岗位负责的检查项");

    for (const key of new Set([
      ...Object.keys(old.facts),
      ...Object.keys(w.facts),
    ])) {
      if ((old.facts[key] || "") === (w.facts[key] || "")) continue;
      if (key.startsWith("check:") || key.startsWith("stage:")) {
        if (!canEditFact(m, key))
          throw new HttpError(403, "只能填写本岗位检查依据与阶段补充");
      } else if (m.role === "sales") {
        if (key === "payment-record")
          throw new HttpError(403, "回款核对由财务维护");
      } else if (!canEditFact(m, key))
        throw new HttpError(403, "只能维护本岗位相关的阶段信息");
    }
    for (const key of new Set([
      ...Object.keys(old.milestones),
      ...Object.keys(w.milestones),
    ])) {
      if ((old.milestones[key] || "") === (w.milestones[key] || "")) continue;
      const dep = MILESTONES.find((x) => x.id === key)?.department;
      if (m.role === "sales") {
        if (dep === "finance")
          throw new HttpError(403, "约定回款节点由财务核对");
      } else if (!canEditMilestone(m, dep || ""))
        throw new HttpError(403, "只能维护本岗位相关的时间节点");
    }
  }
  for (const g of GUIDES)
    for (const c of g.checks)
      if (
        w.checklist[c.id] &&
        !old.checklist[c.id] &&
        !w.facts["check:" + c.id]?.trim()
      )
        throw new HttpError(400, "勾选完成前请填写检查依据：" + c.label);
  for (const t of old.tasks)
    if (!w.tasks.some((x) => x.id === t.id))
      throw new HttpError(400, "协作记录需保留，可填写处理结果后关闭");
  for (const t of w.tasks) {
    const prev = old.tasks.find((x) => x.id === t.id);
    if (!prev) {
      if (!isManager(m)) throw new HttpError(403, "新任务由管理台统一派发");
      t.createdByMemberId = m.id;
      if (!t.assigneeMemberId)
        throw new HttpError(400, "请选择已登记账号作为协作承办人");
      continue;
    }
    if (same(prev, t)) continue;
    if (!taskVisible(prev.department, m))
      throw new HttpError(403, "只能处理本台任务");
    if (t.createdByMemberId !== prev.createdByMemberId)
      throw new HttpError(403, "不能修改协作发起人");
    if (isManager(m)) continue;
    if (prev.assigneeMemberId === m.id) {
      const { status, result, completedAt, ...base } = t;
      const {
        status: oldStatus,
        result: oldResult,
        completedAt: oldCompleted,
        ...oldBase
      } = prev;
      if (!same(base, oldBase))
        throw new HttpError(
          403,
          "承办人可以反馈结果，调整交接要求请联系发起人",
        );
    } else throw new HttpError(403, "此事项仅承办人或管理人员可以处理");
  }
}
export async function projectWrite(
  ctx: Context,
  before: Project | null,
  data: Project,
  note: string,
  kind: string,
  changes: string[],
) {
  const now = new Date().toISOString(),
    id = before?.id || crypto.randomUUID(),
    version = (before?.version || 0) + 1,
    evId = crypto.randomUUID();
  const {
    id: ignoredId,
    version: ignoredVersion,
    updatedAt: ignoredDate,
    ...input
  } = data;
  const stored = {...input, businessStatus: (before ? statusOf(before) : '跟进中') as Project['businessStatus'], statusChangedAt: before?.statusChangedAt, pauseReviewDate: before?.pauseReviewDate, pauseReviewedAt: before?.pauseReviewedAt, createdAt: before?.createdAt || (before ? undefined : now), lastFollowupAt: before?.lastFollowupAt, latestFollowupContent: before?.latestFollowupContent};
  const actor = `${ctx.member.name}（${roleInfo(ctx.member.role).name}）`;
  const first = before
    ? ctx.db
        .prepare(
          "UPDATE projects SET data=?,version=?,updated_at=? WHERE id=? AND user_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
        )
        .bind(
          JSON.stringify(stored),
          version,
          now,
          id,
          ctx.workspaceId,
          before.version,
          ctx.member.id,
          ctx.member.version,
        )
    : ctx.db
        .prepare(
          "INSERT INTO projects(id,user_id,data,version,updated_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
        )
        .bind(
          id,
          ctx.workspaceId,
          JSON.stringify(stored),
          version,
          now,
          ctx.member.id,
          ctx.member.version,
        );
  const event = { kind, actor, actorMemberId: ctx.member.id, ownerMemberIdAtTime: before?.ownerMemberId || data.ownerMemberId || null, note, changes };
  const batch: D1PreparedStatement[] = [
    first,
    ctx.db
      .prepare(
        "INSERT INTO events (id,project_id,user_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1",
      )
      .bind(evId, id, ctx.workspaceId, JSON.stringify(event), now),
  ];
  if (before && before.ownerMemberId !== data.ownerMemberId) batch.push(ctx.db.prepare(
    'INSERT INTO project_owner_history(id,workspace_id,project_id,previous_member_id,new_member_id,actor_id,created_at) SELECT ?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?)'
  ).bind(crypto.randomUUID(), ctx.workspaceId, id, before.ownerMemberId || null, data.ownerMemberId || null, ctx.member.id, now, evId));
  const old = before ? workflowOf(before) : null;
  for (const t of workflowOf(data).tasks) {
    const p = old?.tasks.find((x) => x.id === t.id);
    let recipient = "",
      message = "";
    if (
      t.assigneeMemberId &&
      (!p || p.assigneeMemberId !== t.assigneeMemberId)
    ) {
      recipient = t.assigneeMemberId;
      message = `${data.name}：你收到协作“${t.title}”，期限 ${t.dueDate}`;
    } else if (p && (p.status !== t.status || p.result !== t.result)) {
      recipient = t.createdByMemberId || data.ownerMemberId || "";
      message = `${data.name}：“${t.title}”已更新为${t.status}`;
    }
    if (recipient && recipient !== ctx.member.id)
      batch.push(
        ctx.db
          .prepare(
            "INSERT INTO notifications (id,workspace_id,recipient_id,project_id,message,created_at) SELECT ?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM events WHERE id=?)",
          )
          .bind(
            crypto.randomUUID(),
            ctx.workspaceId,
            recipient,
            id,
            message,
            now,
            evId,
          ),
      );
  }
  const results = await ctx.db.batch(batch);
  if (results[0].meta.changes !== 1)
    throw new HttpError(409, "项目已被其他人更新或账号权限变化，请刷新后重试");
  return {
    project: { ...stored, id, version, updatedAt: now },
    event: { ...event, id: evId, projectId: id, createdAt: now },
  };
}
