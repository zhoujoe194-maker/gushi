import { z } from 'zod';
import {
  getContext,
  checkOrigin,
  response,
  handleError,
  HttpError,
  directory,
  type Context,
} from '../../server/auth';
import { hasDesk } from '../../access';
import { isManager, isScopedManager, type Member } from '../../team';
import { calendarDate } from '../../server/validation';
import { loadProject } from '../../server/projects';
import {
  METRICS,
  ACTIVITY_TYPES,
  POLICY_START,
  POLICY_VERSION,
  localDate,
  mondayOf,
  addDays,
  weeklyDeadline,
  totalScore,
  performanceBand,
  evidenceSummary,
  type SalesRecord,
  type Scores,
  type PerformanceData,
} from '../../sales/model';
import { policyNotes, guidance } from '../../server/sales-policy';
import { reportSchema } from '../../sales/report-schema';
export const dynamic = 'force-dynamic';
type Row = {
  id: string;
  workspace_id: string;
  member_id: string;
  region: string;
  kind: SalesRecord['kind'];
  period: string;
  record_date: string;
  status: SalesRecord['status'];
  data: string;
  version: number;
  created_at: string;
  updated_at: string;
};
const monthSchema = z
  .string()
  .regex(/^\d{4}-(0[1-9]|1[0-2])$/, '请选择有效月份');
const required = z.string().trim().min(1, '请填写完整内容').max(4000);
const short = z.string().trim().max(200);
const optional = z.string().trim().max(4000).default('');
const activitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  title: short.min(1, '请填写工作主题'),
  customer: short.default(''),
  contact: short.default(''),
  progress: z.string().trim().max(1000).default(''),
  result: required,
  evidence: required,
  projectId: z.string().max(100).default(''),
  customerStage: z.enum(['未分类', '新客户', '老客户']).default('未分类'),
  customerCategory: z
    .enum(['未分类', '同行', '设计', '业主', '采购'])
    .default('未分类'),
  contactMethod: z
    .enum(['未注明', '现场拜访', '电话', '线上'])
    .default('未注明'),
  focusIndustry: short.default(''),
});
const weeklySchema = z.object({
  summary: required,
  nextPlan: required,
  risks: required,
  evidence: required,
  report: reportSchema.optional(),
});
const scoresSchema = z
  .object(
    Object.fromEntries(
      METRICS.map((m) => [
        m.id,
        z
          .number()
          .finite()
          .min(0)
          .max(m.max)
          .refine(
            (n) => Math.abs(n * 10 - Math.round(n * 10)) < 1e-8,
            '评分最多保留一位小数',
          ),
      ]),
    ),
  )
  .strict();
const dto = (r: Row, people: Member[]): SalesRecord => {
  const saved = JSON.parse(r.data);
  return {
    id: r.id,
    memberId: r.member_id,
    memberName: people.find((m) => m.id === r.member_id)?.name || '历史成员',
    region: r.region,
    kind: r.kind,
    period: r.period,
    date: r.record_date,
    status: r.status,
    version: r.version,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    data: saved.content,
    history: saved.history || [],
  };
};
function requireSalesArea(ctx: Context) {
  if (ctx.member.role !== 'sales' && !isManager(ctx.member))
    throw new HttpError(403, '请从销售台或管理台使用销售考核');
}
function scoped(m: Member, viewer: Member) {
  return isManager(viewer)
    ? !isScopedManager(viewer) || m.region === viewer.region
    : m.id === viewer.id;
}
function validMonth(month: string) {
  monthSchema.parse(month);
  if (month < POLICY_START || month > localDate().slice(0, 7))
    throw new HttpError(400, '请选择 2026 年 8 月至当前月份');
  return month;
}
function visibleRow(r: Row, member: Member) {
  return !isScopedManager(member) || r.region === member.region;
}
async function records(
  ctx: Context,
  memberId: string,
  month: string,
  people: Member[],
) {
  const rows = await ctx.db
    .prepare(
      'SELECT * FROM sales_records WHERE workspace_id=? AND member_id=? AND record_date LIKE ? ORDER BY updated_at DESC',
    )
    .bind(ctx.workspaceId, memberId, month + '-%')
    .all<Row>();
  return rows.results
    .filter((r) => visibleRow(r, ctx.member))
    .map((r) => dto(r, people));
}
async function frozen(ctx: Context, memberId: string, date: string) {
  return !!(await ctx.db
    .prepare(
      "SELECT id FROM sales_records WHERE workspace_id=? AND member_id=? AND kind='performance' AND period=? AND status='published'",
    )
    .bind(ctx.workspaceId, memberId, date.slice(0, 7))
    .first());
}
async function save(
  ctx: Context,
  target: Member,
  old: SalesRecord | null,
  next: Pick<SalesRecord, 'kind' | 'period' | 'date' | 'status' | 'data'>,
  note: string,
) {
  const now = new Date().toISOString(),
    id = old?.id || crypto.randomUUID(),
    version = (old?.version || 0) + 1;
  const history = [
    ...(old?.history || []),
    { at: now, actor: ctx.member.name, note },
  ];
  const data = JSON.stringify({ content: next.data, history });
  let guard =
    "EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active' AND version=?) AND EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND version=?)";
  const guards: unknown[] = [
    ctx.member.id,
    ctx.workspaceId,
    ctx.member.version,
    target.id,
    ctx.workspaceId,
    target.version,
  ];
  if (next.kind !== 'performance') {
    guard +=
      " AND NOT EXISTS(SELECT 1 FROM sales_records WHERE workspace_id=? AND member_id=? AND kind='performance' AND status='published' AND period IN (?,?))";
    guards.push(
      ctx.workspaceId,
      target.id,
      next.date.slice(0, 7),
      (old?.date || next.date).slice(0, 7),
    );
  }
  if (next.kind === 'performance' && next.status === 'published') {
    guard +=
      " AND (SELECT COALESCE(SUM(version),0) FROM sales_records WHERE workspace_id=? AND member_id=? AND kind<>'performance' AND record_date LIKE ?)=?";
    guards.push(
      ctx.workspaceId,
      target.id,
      next.period + '-%',
      next.data.evidenceRevision,
    );
  }
  const first = old
    ? ctx.db
        .prepare(
          `UPDATE sales_records SET record_date=?,status=?,data=?,version=?,updated_at=? WHERE id=? AND workspace_id=? AND version=? AND ${guard}`,
        )
        .bind(
          next.date,
          next.status,
          data,
          version,
          now,
          id,
          ctx.workspaceId,
          old.version,
          ...guards,
        )
    : ctx.db
        .prepare(
          `INSERT INTO sales_records(id,workspace_id,member_id,region,kind,period,record_date,status,data,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,?,? WHERE ${guard} AND NOT EXISTS(SELECT 1 FROM sales_records WHERE workspace_id=? AND member_id=? AND kind=? AND period=?)`,
        )
        .bind(
          id,
          ctx.workspaceId,
          target.id,
          target.region,
          next.kind,
          next.period,
          next.date,
          next.status,
          data,
          version,
          now,
          now,
          ...guards,
          ctx.workspaceId,
          target.id,
          next.kind,
          next.period,
        );
  const result = await ctx.db.batch([
    first,
    ctx.db
      .prepare(
        'INSERT INTO member_audit(id,workspace_id,actor_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1',
      )
      .bind(
        crypto.randomUUID(),
        ctx.workspaceId,
        ctx.member.id,
        JSON.stringify({
          action: 'sales_record',
          recordId: id,
          memberId: target.id,
          note,
          version,
          status: next.status,
        }),
        now,
      ),
  ]);
  if (result[0].meta.changes !== 1)
    throw new HttpError(409, '记录或账号权限已更新，请刷新后重试');
  return {
    ...next,
    id,
    memberId: target.id,
    memberName: target.name,
    region: old?.region || target.region,
    version,
    createdAt: old?.createdAt || now,
    updatedAt: now,
    history,
  };
}
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req);
    requireSalesArea(ctx);
    const url = new URL(req.url),
      month = validMonth(
        url.searchParams.get('month') || localDate().slice(0, 7),
      );
    const all = await directory(ctx),
      people = all.filter((m) => hasDesk(m, 'sales') && scoped(m, ctx.member));
    const memberId =
      url.searchParams.get('memberId') ||
      (isManager(ctx.member)
        ? people.find((m) => m.id !== ctx.member.id && m.status === 'active')
            ?.id || people[0]?.id
        : ctx.member.id);
    if (memberId && !people.some((m) => m.id === memberId))
      throw new HttpError(404, '成员不存在或不在你的管理范围内');
    const rows = memberId ? await records(ctx, memberId, month, all) : [];
    const queue = await ctx.db
      .prepare(
        "SELECT member_id,region,COUNT(*) AS count FROM sales_records WHERE workspace_id=? AND record_date LIKE ? AND status='submitted' GROUP BY member_id,region",
      )
      .bind(ctx.workspaceId, month + '-%')
      .all<{ member_id: string; region: string; count: number }>();
    return response({
      member: ctx.member,
      people: people.map((m) => ({
        id: m.id,
        name: m.name,
        region: m.region,
        status: m.status,
        pending: queue.results
          .filter(
            (r) =>
              r.member_id === m.id &&
              (!isScopedManager(ctx.member) || r.region === ctx.member.region),
          )
          .reduce((n, r) => n + r.count, 0),
      })),
      records: rows,
      evidence: evidenceSummary(rows, month),
      serverDate: localDate(),
      month,
      selectedMemberId: memberId || '',
      rules: METRICS,
      policyNotes,
      guidance,
    });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req);
    requireSalesArea(ctx);
    const text = await req.text();
    if (text.length > 50000) throw new HttpError(413, '提交内容过大');
    const body = JSON.parse(text);
    const action = z
        .enum([
          'activity',
          'weekly',
          'monthly',
          'self_review',
          'review',
          'publish',
          'return',
        ])
        .parse(body.action),
      all = await directory(ctx),
      manager = isManager(ctx.member),
      selfAction = ['activity', 'weekly', 'monthly', 'self_review'].includes(
        action,
      );
    if (selfAction && ctx.member.role !== 'sales')
      throw new HttpError(403, '请切换到销售台填写本人工作记录和自评');
    let old: SalesRecord | null = null;
    if (body.id) {
      const id = z.string().max(100).parse(body.id);
      const row = await ctx.db
        .prepare('SELECT * FROM sales_records WHERE workspace_id=? AND id=?')
        .bind(ctx.workspaceId, id)
        .first<Row>();
      if (!row || !visibleRow(row, ctx.member))
        throw new HttpError(404, '记录不存在或无权访问');
      old = dto(row, all);
    }
    if (old && old.version !== z.number().int().min(1).parse(body.version))
      throw new HttpError(409, '记录已更新，请刷新后重新打开');
    const target = all.find(
      (m) =>
        m.id === (old?.memberId || ctx.member.id) &&
        hasDesk(m, 'sales') &&
        scoped(m, ctx.member),
    );
    if (!target) throw new HttpError(404, '成员不存在或无权访问');
    if (selfAction && target.id !== ctx.member.id)
      throw new HttpError(403, '只能提交本人的记录');
    if (!selfAction && (!manager || !old))
      throw new HttpError(403, '仅管理可以审核已提交的记录');
    if (!selfAction && target.id === ctx.member.id)
      throw new HttpError(
        403,
        '不能审核或发布自己的考核，请由另一位管理人员复核',
      );
    const now = new Date().toISOString();
    let next: Pick<SalesRecord, 'kind' | 'period' | 'date' | 'status' | 'data'>;
    let note = '';
    if (action === 'activity') {
      if (old && (old.kind !== 'activity' || old.status === 'approved'))
        throw new HttpError(400, '已核实记录须由管理退回后才能修改');
      const date = calendarDate.parse(body.date);
      validMonth(date.slice(0, 7));
      if (date > localDate())
        throw new HttpError(400, '工作发生日期不能晚于今天');
      if (
        (await frozen(ctx, target.id, date)) ||
        (old && (await frozen(ctx, target.id, old.date)))
      )
        throw new HttpError(
          409,
          '该月考核已发布，请管理先退回考核后再补充记录',
        );
      const data = activitySchema.parse(body.data);
      if (
        ['新增线索', '客户拜访', '老客回访', '报价方案'].includes(data.type) &&
        !data.customer
      )
        throw new HttpError(400, '请填写客户或项目单位');
      if (data.type === '新增线索' && (!data.contact || !data.progress))
        throw new HttpError(400, '有效线索需包含负责人及联系方式、项目进度');
      let projectName = '';
      if (data.projectId)
        projectName = (await loadProject(ctx, data.projectId)).name;
      next = {
        kind: 'activity',
        period: old?.period || crypto.randomUUID(),
        date,
        status: 'submitted',
        data: { ...data, projectName },
      };
      note = old ? '修改并重新提交工作记录' : '提交销售工作记录';
    } else if (action === 'weekly') {
      if (old && (old.kind !== 'weekly' || old.status === 'approved'))
        throw new HttpError(400, '已确认周报须由管理退回后才能修改');
      const week = calendarDate.parse(body.week);
      if (mondayOf(week) !== week || week > localDate())
        throw new HttpError(400, '请选择本周或以往周的周一日期');
      const date = addDays(week, 5);
      validMonth(date.slice(0, 7));
      if (old && old.period !== week)
        throw new HttpError(400, '不能更改已有周报的所属周');
      if (await frozen(ctx, target.id, date))
        throw new HttpError(409, '该月考核已发布，周报暂不能变更');
      const data = weeklySchema.parse(body.data),
        deadline = weeklyDeadline(week);
      next = {
        kind: 'weekly',
        period: week,
        date,
        status: 'submitted',
        data: {
          ...data,
          report: data.report ?? old?.data.report,
          firstSubmittedAt: old?.data.firstSubmittedAt || now,
          submittedAt: now,
          deadline,
          late: now >= new Date(deadline).toISOString(),
        },
      };
      note = '提交周报；截止 ' + date + ' 24:00';
    } else if (action === 'monthly') {
      if (old && (old.kind !== 'monthly' || old.status === 'approved'))
        throw new HttpError(400, '已核实月报须由管理退回后才能修改');
      const month = validMonth(monthSchema.parse(body.month));
      if (old && old.period !== month)
        throw new HttpError(400, '不能更改已有月报的所属月份');
      if (await frozen(ctx, target.id, month))
        throw new HttpError(409, '该月考核已发布，月报暂不能变更');
      const data = weeklySchema
        .extend({ report: reportSchema })
        .parse(body.data);
      next = {
        kind: 'monthly',
        period: month,
        date: month + '-01',
        status: 'submitted',
        data: {
          ...data,
          firstSubmittedAt: old?.data.firstSubmittedAt || now,
          submittedAt: now,
        },
      };
      note = '提交销售月报：' + month;
    } else if (action === 'self_review') {
      if (
        old &&
        (old.kind !== 'performance' ||
          !['submitted', 'returned', 'draft'].includes(old.status))
      )
        throw new HttpError(400, '已发布考核不能修改，请联系管理退回');
      const month = validMonth(monthSchema.parse(body.month));
      if (old && old.period !== month)
        throw new HttpError(400, '不能更改考核月份');
      const scores = scoresSchema.parse(body.scores) as Scores;
      next = {
        kind: 'performance',
        period: month,
        date: month + '-01',
        status: 'submitted',
        data: {
          selfScores: scores,
          selfNote: required.parse(body.note),
          improvement: optional.parse(body.improvement),
          policyVersion: POLICY_VERSION,
          priorResults: old?.data.priorResults || [],
        },
      };
      note = '提交月度自评';
    } else {
      if (!old) throw new HttpError(404, '记录不存在');
      next = {
        kind: old.kind,
        period: old.period,
        date: old.date,
        status: old.status,
        data: { ...old.data },
      };
      const reason = required.parse(body.note);
      if (action === 'publish') {
        if (old.kind !== 'performance' || old.status !== 'submitted')
          throw new HttpError(400, '仅可发布已提交的月度自评');
        if (old.period >= localDate().slice(0, 7))
          throw new HttpError(
            400,
            '当前月份尚未结束，可先填写自评，结月后发布最终考核',
          );
        const monthRecords = await records(ctx, target.id, old.period, all);
        if (
          monthRecords.some(
            (r) => r.kind !== 'performance' && r.status === 'submitted',
          )
        )
          throw new HttpError(400, '请先审核本月待核实的工作记录、周报和月报');
        const scores = scoresSchema.parse(body.scores) as Scores,
          total = totalScore(scores),
          improvement = optional.parse(body.improvement);
        if (total >= 70 && total < 80 && !improvement)
          throw new HttpError(400, '70–79.9 分需要填写书面改进计划');
        next.status = 'published';
        next.data = {
          ...old.data,
          managerScores: scores,
          managerNote: reason,
          improvement,
          total,
          band: performanceBand(total),
          publishedAt: now,
          reviewer: ctx.member.name,
          snapshot: evidenceSummary(monthRecords, old.period),
          evidenceRevision: monthRecords
            .filter((r) => r.kind !== 'performance')
            .reduce((n, r) => n + r.version, 0),
          evidenceVersions: monthRecords
            .filter((r) => r.kind !== 'performance')
            .map((r) => ({ id: r.id, version: r.version })),
        };
        note = '发布月度考核：' + total + ' 分；' + reason;
      } else if (action === 'return') {
        if (old.status === 'returned')
          throw new HttpError(400, '记录已退回，请等待本人补充');
        if (
          old.kind !== 'performance' &&
          (await frozen(ctx, target.id, old.date))
        )
          throw new HttpError(409, '请先退回已发布的月度考核');
        if (old.kind === 'performance' && old.status === 'published')
          next.data.priorResults = [
            ...((old.data.priorResults as unknown[]) || []),
            { ...(old.data as PerformanceData), priorResults: undefined },
          ];
        next.status = 'returned';
        next.data.reviewNote = reason;
        note = '退回补充：' + reason;
      } else {
        if (old.kind === 'performance' || old.status !== 'submitted')
          throw new HttpError(400, '仅可核实已提交的工作记录、周报或月报');
        if (await frozen(ctx, target.id, old.date))
          throw new HttpError(409, '该月考核已发布，不能修改核实结果');
        next.status = 'approved';
        next.data.reviewNote = reason;
        next.data.reviewedBy = ctx.member.name;
        next.data.reviewedAt = now;
        note = '核实通过：' + reason;
      }
    }
    return response({ record: await save(ctx, target, old, next, note) });
  } catch (e) {
    return handleError(e);
  }
}
