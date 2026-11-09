import { taskAccessible } from '../../server/resource-access';
import {canViewSupplier} from '../../finance-operations';
import { z } from 'zod';
import {
  getContext,
  handleError,
  response,
  checkOrigin,
  directory,
  HttpError,
} from '../../server/auth';
import { projectSchema, configSchema } from '../../server/validation';
import { Project, blankProject } from '../../model';
import { mergeSalesCommercial } from '../../server/commercial-access';
import { appendFollowup } from '../../server/followups';
import {
  projectDTO,
  ProjectRow,
  loadProject,
  validateAssignments,
  enforceWorkflow,
  projectWrite,
} from '../../server/projects';
import {
  canReadProject,
  canEditProject,
  canCreateProject,
  isManager,
  isCompanyManager,
  canViewFinance,
  canFinance,
  taskVisible,
  visibleProject,
  isScopedManager,
  FINANCE_FACTS,
  mayViewBook,
  canViewFact,
} from '../../team';
import { workflowChanges, workflowOf, EMPTY_WORKFLOW } from '../../workflow';
import { linkageSummary } from '../../dashboard-model';
import { DeskTask } from '../../task-model';
import { salesBook } from '../../finance-model';
import { emptyBook, FinanceBook } from '../../finance-model';
export const dynamic = 'force-dynamic';
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req);
    const [rows, allEvents, config, members, books, notices, taskRows] =
      await Promise.all([
        ctx.db
          .prepare(
            'SELECT * FROM projects WHERE user_id=? ORDER BY updated_at DESC',
          )
          .bind(ctx.workspaceId)
          .all<ProjectRow>(),
        ctx.db
          .prepare(
            'SELECT * FROM events WHERE user_id=? ORDER BY created_at DESC',
          )
          .bind(ctx.workspaceId)
          .all<{
            id: string;
            project_id: string;
            data: string;
            created_at: string;
          }>(),
        ctx.db
          .prepare('SELECT data FROM settings WHERE user_id=?')
          .bind(ctx.workspaceId)
          .first<{ data: string }>(),
        directory(ctx),
        ctx.db
          .prepare('SELECT * FROM finance_books WHERE workspace_id=?')
          .bind(ctx.workspaceId)
          .all<{
            project_id: string;
            data: string;
            version: number;
            updated_at: string;
          }>(),
        ctx.db
          .prepare(
            'SELECT * FROM notifications WHERE workspace_id=? AND recipient_id=? ORDER BY created_at DESC LIMIT 100',
          )
          .bind(ctx.workspaceId, ctx.member.id)
          .all<{
            id: string;
            project_id: string;
            message: string;
            read_at: string | null;
            created_at: string;
          }>(),
        ctx.db
          .prepare('SELECT data FROM desk_tasks WHERE workspace_id=?')
          .bind(ctx.workspaceId)
          .all<{ data: string }>(),
      ]);
    const projects = rows.results
        .map(projectDTO)
        .map((p) => ({
          ...p,
          owner: members.find((m) => m.id === p.ownerMemberId)?.name || p.owner,
        }))
        .filter((p) => canReadProject(p, ctx.member))
        .map((p) => visibleProject(p, ctx.member)),
      ids = new Set(projects.map((p) => p.id));
    const finances: Record<string, FinanceBook> = {};
    for (const p of projects.filter(p => mayViewBook(p, ctx.member))) {
        const b = books.results.find((b) => b.project_id === p.id);
        const book = b
          ? {
              ...JSON.parse(b.data),
              projectId: p.id,
              version: b.version,
              updatedAt: b.updated_at,
            }
          : emptyBook(p.id);
        if (!canFinance(ctx.member)) delete book.financeMemo;
        if (!canViewSupplier(ctx.member)) delete book.suppliers;
        finances[p.id] = canViewFinance(ctx.member) ? book : salesBook(book);
      }
    const events = allEvents.results
      .filter((e) => ids.has(e.project_id))
      .map((e) => ({
        ...JSON.parse(e.data),
        id: e.id,
        projectId: e.project_id,
        createdAt: e.created_at,
      }))
      .filter((e) => (e.kind !== '财务内部备注' || canFinance(ctx.member)) && (e.kind !== '厂家付款记录' || canViewSupplier(ctx.member)))
      .map((e) =>
        !canViewFinance(ctx.member) && e.kind === '票款进度更新'
          ? {
              ...e,
              note: '票款处理进度已更新，当前工作台仅显示交接状态。',
              changes: [],
            }
          : !isManager(ctx.member) &&
              (e.kind === '协作与阶段更新' ||
                e.changes?.some(
                  (c: string) =>
                    c.startsWith('新增协作：') ||
                    c.startsWith('协作 ') ||
                    (!canViewFinance(ctx.member) &&
                      c.startsWith('回款与开票核对：')),
                ))
            ? { ...e, note: '项目阶段或协作进度已更新', changes: [] }
            : e,
      );
    const summaryBooks: Record<string, FinanceBook> = {};
    for (const p of projects) {
      summaryBooks[p.id] = finances[p.id] || emptyBook(p.id);
    }
    const linkages = linkageSummary(
      projects,
      summaryBooks,
      taskRows.results.map((r) => JSON.parse(r.data) as DeskTask).filter(t => taskAccessible(t, ctx, ids)),
    );
    return response({
      projects,
      events,
      linkages,
      config: config ? JSON.parse(config.data) : null,
      member: ctx.member,
      members: members
        .filter((m) =>
          isManager(ctx.member)
            ? !isScopedManager(ctx.member) || m.region === ctx.member.region
            : m.status === 'active',
        )
        .map((m) =>
          isManager(ctx.member)
            ? m
            : {
                ...m,
                email: m.id === ctx.member.id ? m.email : '',
                phone: m.id === ctx.member.id ? m.phone : '',
                bound: false,
              },
        ),
      finances,
      notifications: notices.results
        .filter((n) => ids.has(n.project_id))
        .map((n) => ({
          id: n.id,
          projectId: n.project_id,
          message: !canViewFinance(ctx.member)
            ? '相关项目有更新，请在本台任务和项目中查看。'
            : !isManager(ctx.member) &&
                (n.message.includes('收到协作') ||
                  n.message.includes('已更新为'))
              ? '相关项目的协作进度已更新，请在本台任务和项目中查看。'
              : n.message,
          readAt: n.read_at,
          createdAt: n.created_at,
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
    const raw = await req.text();
    if (raw.length > 400000) throw new HttpError(413, '提交内容过大');
    const body = JSON.parse(raw);
    if (body.action === 'config') {
      if (ctx.member.role !== 'owner')
        throw new HttpError(403, '仅系统管理员可以修改工作区配置');
      const data = configSchema.parse(body.data);
      await ctx.db
        .prepare(
          'INSERT INTO settings(user_id,data) VALUES (?,?) ON CONFLICT(user_id) DO UPDATE SET data=excluded.data',
        )
        .bind(ctx.workspaceId, JSON.stringify(data))
        .run();
      return response({ ok: true });
    }
    if (body.action === 'read_notifications') {
      await ctx.db
        .prepare(
          'UPDATE notifications SET read_at=? WHERE recipient_id=? AND workspace_id=? AND read_at IS NULL',
        )
        .bind(new Date().toISOString(), ctx.member.id, ctx.workspaceId)
        .run();
      return response({ ok: true });
    }
    if (
      !['create', 'update', 'followup', 'workflow', 'filing'].includes(
        body.action,
      )
    )
      throw new HttpError(400, '不支持的操作');
    if (body.action === 'followup') return response(await appendFollowup(ctx, body));
    const parsed = projectSchema.parse(body.action === 'create' ? {...blankProject(ctx.member.name), ...body.data} : body.data) as Omit<
      Project,
      'id' | 'version' | 'updatedAt'
    >;
    let before: Project | null = null;
    if (body.action === 'create') {
      if (!canCreateProject(ctx.member))
        throw new HttpError(403, '当前岗位不能创建销售项目');
      if (ctx.member.role === 'sales') {
        if (parsed.ownerMemberId && parsed.ownerMemberId !== ctx.member.id) throw new HttpError(403, '销售只能创建自己负责的项目');
        parsed.ownerMemberId = ctx.member.id;
        parsed.owner = ctx.member.name;
        parsed.workflow = {
          ...workflowOf(parsed as Project),
          region: '全部分部',
        };
      } else {
        parsed.ownerMemberId ||= ctx.member.id;
      }
      if (isScopedManager(ctx.member)) {
        parsed.workflow = {
          ...workflowOf(parsed as Project),
          region: ctx.member.region,
        };
      }
    } else {
      before = await loadProject(ctx, z.string().min(1).max(100).parse(body.id));
      if (before.version !== body.version)
        throw new HttpError(409, '项目已在其他窗口更新，请刷新后重试');
      if (
        body.action !== 'workflow' &&
        !(
          body.action === 'filing' &&
          ['project', 'operations'].includes(ctx.member.role)
        ) &&
        !canEditProject(before, ctx.member)
      )
        throw new HttpError(
          403,
          '当前岗位不能编辑销售项目，请通过协作事项反馈',
        );
      if (parsed.execution === undefined) parsed.execution = before.execution;
      if (!canViewFinance(ctx.member) && parsed.commercial !== undefined) {
        if (!canEditProject(before,ctx.member)) throw new HttpError(403, '当前岗位不能修改商务报价');
        parsed.commercial = mergeSalesCommercial(parsed.commercial,before.commercial);
      }
      if (parsed.commercial === undefined) parsed.commercial = before.commercial;
      if (!parsed.workflow && before.workflow)
        parsed.workflow = visibleProject(before, ctx.member).workflow;
      if (parsed.ownerMemberId === undefined && before.ownerMemberId)
        parsed.ownerMemberId = before.ownerMemberId;
      if (
        !isManager(ctx.member) &&
        parsed.ownerMemberId !== before.ownerMemberId
      )
        throw new HttpError(403, '重新分配销售负责人需由管理人员操作');
      for (const o of parsed.opportunities) {
        const old = before.opportunities.find((x) => x.id === o.id);
        for (const k of [
          'filingDate',
          'filingContact',
          'filingReference',
        ] as const)
          if (o[k] === undefined && old?.[k] !== undefined) o[k] = old[k];
      }
    }
    if (before && parsed.workflow && !isManager(ctx.member)) {
      const hidden = workflowOf(before).tasks.filter(
        (t) => !taskVisible(t.department, ctx.member),
      );
      if (parsed.workflow.tasks.some((t) => hidden.some((h) => h.id === t.id)))
        throw new HttpError(403, '不能访问其他工作台任务');
      parsed.workflow.tasks = [...parsed.workflow.tasks, ...hidden];
      for (const key of new Set([...FINANCE_FACTS, ...Object.keys(workflowOf(before).facts), ...Object.keys(parsed.workflow.facts)])) {
        if (canViewFact(ctx.member, key)) continue;
        if (Object.hasOwn(parsed.workflow.facts, key))
          throw new HttpError(403, '当前岗位不能访问财务核对记录');
        const value = workflowOf(before).facts[key];
        if (value !== undefined) parsed.workflow.facts[key] = value;
      }
    }
    if (!canViewFinance(ctx.member) && !before && parsed.commercial) parsed.commercial = mergeSalesCommercial(parsed.commercial);
    const data = {
      ...parsed,
      id: before?.id || '',
      version: before?.version || 0,
      updatedAt: before?.updatedAt || '',
    } as Project;
    if (before) enforceWorkflow(ctx, before, data);
    else if (data.workflow)
      enforceWorkflow(
        ctx,
        {
          ...data,
          workflow: { ...EMPTY_WORKFLOW, region: data.workflow.region },
        },
        data,
      );
    validateAssignments(data, await directory(ctx), before);
    if (
      isScopedManager(ctx.member) &&
      workflowOf(data).region !== ctx.member.region
    )
      throw new HttpError(403, '只能管理本分部项目');
    const note = ['workflow', 'followup', 'filing'].includes(body.action)
      ? z.string().trim().min(1).max(5000).parse(body.note)
      : '';
    const changes: string[] = [];
    const labels: Record<string, string> = {
      name: '项目名称',
      location: '地区',
      type: '类型',
      source: '来源',
      owner: '主跟销售',
      stage: '阶段',
      amount: '预计金额',
      customer: '业主',
      designer: '设计院',
      contractor: '采购单位',
      contact: '联系人',
      phone: '联系方式',
      nextAction: '下一步行动',
      nextDate: '跟进日期',
      notes: '备注',
    };
    if (before) {
      for (const [k, label] of Object.entries(labels)) {
        const a = (before as unknown as Record<string, unknown>)[k],
          b = (data as unknown as Record<string, unknown>)[k];
        if (a !== b)
          changes.push(`${label}：${a || '未填写'} → ${b || '未填写'}`);
      }
      if (
        JSON.stringify(before.opportunities) !==
        JSON.stringify(data.opportunities)
      )
        changes.push('产品机会 / 厂家报备已更新');
    }
    if (before && JSON.stringify(before.commercial) !== JSON.stringify(data.commercial)) changes.push('商务报价与风险档案已更新');
    if (before && JSON.stringify(before.execution) !== JSON.stringify(data.execution)) changes.push('合同条款与交付批次已更新');
    if (data.workflow)
      changes.push(...workflowChanges(before?.workflow, data.workflow));
    const result = await projectWrite(
      ctx,
      before,
      data,
      note,
      body.action === 'create'
        ? '创建项目'
        : body.action === 'followup'
          ? '跟进记录'
          : body.action === 'workflow'
            ? '协作与阶段更新'
            : body.action === 'filing'
              ? '厂家报备更新'
              : '更新项目',
      changes,
    );
    return response({
      ...result,
      project: visibleProject(result.project, ctx.member),
    });
  } catch (e) {
    return handleError(e);
  }
}
