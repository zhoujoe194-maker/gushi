import type { Member } from '../team';
import { isManager } from '../team';
import { policyNotes, guidance } from '../server/sales-policy';
import { blankReport, type ReportData } from './report-model';
import { reportSchema } from './report-schema';
import {
  METRICS,
  POLICY_VERSION,
  addDays,
  mondayOf,
  localDate,
  weeklyDeadline,
  totalScore,
  performanceBand,
  evidenceSummary,
  type SalesRecord,
  type SalesInbox,
  type Scores,
} from './model';
function sampleReport(monthly: boolean): ReportData {
  const report = blankReport();
  Object.assign(report.values, {
    weeklyExpected: monthly ? 3 : 1,
    weeklySubmitted: monthly ? 3 : 1,
    weeklyLate: 0,
    weeklyMissing: 0,
    manufacturer: monthly ? 3 : 1,
    registered: monthly ? 5 : 1,
    oldTotal: monthly ? 8 : 3,
    oldPeer: 1,
    oldDesign: monthly ? 5 : 1,
    oldOwner: 1,
    oldPurchase: monthly ? 1 : 0,
    newTotal: monthly ? 23 : 8,
    newPeer: monthly ? 1 : 0,
    newDesign: monthly ? 1 : 0,
    newOwner: monthly ? 18 : 6,
    newPurchase: monthly ? 3 : 2,
    effectiveVisits: monthly ? 31 : 11,
  });
  Object.assign(report.notes, {
    weekly: '演示填报口径：只列本期安排的周报，管理需与平台到期记录核对。',
    manufacturer: '与演示厂家沟通医院交期、园区技术参数和竞品方案。',
    planning: '南城医院改造、滨江园区机房等演示项目。',
    old: '同行：北岸工程；设计：启明设计院；业主：城东服务中心。客户均为虚构，回访设备使用及扩建需求。',
    new: '业主：滨江园区等；采购：新桥建设等。部分以电联为主，重点关注数据中心项目；电联家数待核实。',
    visits:
      '此处展示含电联的填报数量；是否属于有效拜访，由管理结合明细认定，不自动计入绩效得分。',
  });
  return report;
}
export function demoSalesPeople(member: Member) {
  return [
    {
      id: isManager(member) ? 'demo-sales' : member.id,
      name: '陈明（演示）',
      region: '广州总部',
      status: 'active' as const,
      pending: 0,
    },
    {
      id: 'demo-sales-lin',
      name: '林悦（演示）',
      region: '湖南分部',
      status: 'active' as const,
      pending: 0,
    },
  ];
}
export function seedSalesDemo(
  month: string,
  person: ReturnType<typeof demoSalesPeople>[number],
): SalesRecord[] {
  const today = localDate(),
    past = month < today.slice(0, 7),
    now = new Date().toISOString();
  const date = (day: number) => {
    const d = month + '-' + String(day).padStart(2, '0');
    return d > today ? today : d;
  };
  const make = (
    id: string,
    kind: SalesRecord['kind'],
    day: string,
    status: SalesRecord['status'],
    data: Record<string, unknown>,
    period = id,
  ): SalesRecord => ({
    id: `demo-${person.id}-${month}-${id}`,
    memberId: person.id,
    memberName: person.name,
    region: person.region,
    kind,
    date: day,
    period,
    status,
    version: 1,
    data,
    createdAt: day + 'T09:00:00+08:00',
    updatedAt: day + 'T17:00:00+08:00',
    history: [
      {
        at: day + 'T09:00:00+08:00',
        actor: person.name,
        note: '提交演示记录',
      },
    ],
  });
  const activities = [
    [
      '新增线索',
      '南城医院改造需求确认',
      '南城医院（虚构）',
      '设计单位已确认设备选型范围',
    ],
    [
      '新增线索',
      '滨江园区项目资料报备',
      '滨江园区（虚构）',
      '已补齐项目阶段和对接人信息',
    ],
    [
      '客户拜访',
      '走访南城医院项目负责人',
      '南城医院（虚构）',
      '确认施工排期，下周提交配置方案',
    ],
    [
      '客户拜访',
      '滨江园区方案沟通',
      '滨江园区（虚构）',
      '确认机房条件及供货窗口',
    ],
    [
      '老客回访',
      '回访城东客户使用情况',
      '城东服务中心（虚构）',
      '设备使用正常，已同步团队回访纪要',
    ],
    [
      '报价方案',
      '提交园区设备组合方案',
      '滨江园区（虚构）',
      '已提供两种配置和报价对比',
    ],
    ['厂家对接', '确认厂家交付周期', '', '已取得预计交期与技术参数'],
    [
      '回款跟进',
      '核对本月到期应收',
      '城东服务中心（虚构）',
      '财务已核对账单，约定客户回复日期',
    ],
  ];
  const records = activities.map(([type, title, customer, result], i) =>
    make(
      'activity-' + i,
      'activity',
      date(2 + i * 2),
      past || i < 5 ? 'approved' : i === 6 ? 'returned' : 'submitted',
      {
        type,
        title,
        customer,
        result,
        contact: '演示联系人 · 内部通讯录示例',
        progress: '需求确认／方案阶段',
        evidence: '演示凭据：沟通纪要 GS-DEMO-' + (i + 1),
        projectId: '',
        customerStage: type === '老客回访' ? '老客户' : '新客户',
        customerCategory: '业主',
        contactMethod: type === '客户拜访' ? '现场拜访' : '电话',
        ...(i === 6 && !past
          ? { reviewNote: '请补充厂家确认交期的书面依据。' }
          : {}),
      },
    ),
  );
  if (past) {
    for (let i = 0; i < 6; i++)
      records.push(
        make('extra-lead-' + i, 'activity', date(3 + i * 3), 'approved', {
          type: '新增线索',
          title: '工程线索资料归档 ' + (i + 1),
          customer: '演示工程客户 ' + (i + 1),
          contact: '演示联系人 · 内部通讯录示例',
          progress: '方案阶段',
          result: '已核对需求和项目阶段',
          evidence: '演示报备资料 DEMO-L-' + i,
        }),
      );
    for (const [i, type, customer] of [
      [0, '老客回访', '东湖物业（虚构）'],
      [1, '报价方案', '南城医院（虚构）'],
      [2, '厂家对接', ''],
      [3, '厂家对接', ''],
      [4, '厂家对接', ''],
    ] as const)
      records.push(
        make('extra-work-' + i, 'activity', date(18 + i), 'approved', {
          type,
          customer,
          title: type + '工作归档',
          result: '演示工作已完成并同步团队',
          evidence: '演示凭据 DEMO-W-' + i,
        }),
      );
  }
  let saturday = month + '-01';
  while (new Date(saturday + 'T00:00:00Z').getUTCDay() !== 6)
    saturday = addDays(saturday, 1);
  for (
    let i = 0;
    i < 3 && saturday <= today && saturday.startsWith(month);
    i++, saturday = addDays(saturday, 7)
  ) {
    const week = mondayOf(saturday),
      late = i === 1,
      submitted = (late ? addDays(saturday, 1) : saturday) + 'T18:00:00+08:00';
    records.push(
      make(
        'week-' + i,
        'weekly',
        saturday,
        past || i === 0 ? 'approved' : 'submitted',
        {
          summary: '完成医院和园区客户跟进，梳理方案与报价需求。',
          nextPlan: '周二完善报价，周四与客户确认选型。',
          risks: '厂家交期仍需书面确认，请运营协助。',
          evidence: '演示周报凭据：客户拜访纪要、方案清单。',
          deadline: weeklyDeadline(week),
          firstSubmittedAt: submitted,
          submittedAt: submitted,
          late,
          report: sampleReport(false),
        },
        week,
      ),
    );
  }
  const scores = Object.fromEntries(
    METRICS.map((m) => [m.id, m.max]),
  ) as Scores;
  records.push(
    make(
      'monthly',
      'monthly',
      month + '-01',
      past ? 'approved' : 'submitted',
      {
        report: sampleReport(true),
        summary:
          '本月跟进医院改造、园区设备选型和设计院合作。重点项目处于技术确认阶段，持续补齐需求与采购信息。',
        nextPlan:
          '跟进医院招标结果，邀约园区技术交流，拜访设计单位并核实重点行业线索。',
        risks: '部分项目招标时间未确定，需运营协助厂家排期。',
        evidence: '演示客户清单、沟通纪要和方案编号，内容均为虚构。',
      firstSubmittedAt: date(28) + 'T17:00:00+08:00',
      submittedAt: date(28) + 'T17:00:00+08:00',
      },
      month,
    ),
  );
  scores.leads = 16;
  scores.visits = 5;
  const summary = evidenceSummary(records, month);
  scores.weekly = Math.max(
    0,
    5 - summary.weeklyLate * 0.5 - summary.weeklyMissing,
  );
  if (!past) {
    scores.leads = 4;
    scores.maintenance = 0;
    scores.proposal = 0;
    scores.manufacturer = 0;
  }
  const second = person.id === 'demo-sales-lin';
  const data: Record<string, unknown> = {
    selfScores: scores,
    selfNote: '演示自评：已完成客户沟通与方案输出，线索储备仍需加强。',
    policyVersion: POLICY_VERSION,
    improvement: '每周补充两条有效线索，周五复盘客户推进情况。',
    priorResults: [],
  };
  if (past && !second) {
    const final = { ...scores, response: 5 };
    const total = totalScore(final);
    Object.assign(data, {
      managerScores: final,
      managerNote:
        '演示核定：依据已审核周报和客户记录评分，下一月加强线索开发。',
      total,
      band: performanceBand(total),
      publishedAt: now,
      reviewer: '管理（演示）',
      snapshot: evidenceSummary(records, month),
    });
  }
  records.push(
    make(
      'performance',
      'performance',
      month + '-01',
      past && !second ? 'published' : 'submitted',
      data,
      month,
    ),
  );
  return records;
}
export function demoSalesInbox(
  member: Member,
  month: string,
  selected: string,
  saved: Record<string, SalesRecord[]>,
): SalesInbox {
  const people = demoSalesPeople(member).map((p) => ({
    ...p,
    pending: (saved[month + ':' + p.id] || seedSalesDemo(month, p)).filter(
      (r) => r.status === 'submitted',
    ).length,
  }));
  const person = people.find((p) => p.id === selected) || people[0];
  const records =
    saved[month + ':' + person.id] || seedSalesDemo(month, person);
  return {
    member,
    month,
    selectedMemberId: person.id,
    people,
    records,
    evidence: evidenceSummary(records, month),
    serverDate: localDate(),
    rules: METRICS,
    policyNotes,
    guidance,
  };
}
export function updateSalesDemo(
  inbox: SalesInbox,
  body: Record<string, unknown>,
): SalesRecord {
  const old = inbox.records.find((r) => r.id === body.id),
    action = String(body.action),
    now = new Date().toISOString();
  const text = (v: unknown) => String(v || '').trim();
  const ensure = (v: unknown, message: string) => {
    if (!v) throw Error(message);
  };
  const manager = isManager(inbox.member),
    target = inbox.people.find((p) => p.id === inbox.selectedMemberId)!;
  const review = ['review', 'return', 'publish'].includes(action);
  ensure(
    review ? manager && old && old.memberId !== inbox.member.id : !manager,
    '请在对应工作台操作',
  );
  if (old) ensure(old.version === body.version, '记录已更新，请重新打开');
  if (!(action === 'return' && old?.kind === 'performance'))
    ensure(
      !inbox.records.some(
        (r) => r.kind === 'performance' && r.status === 'published',
      ),
      '请先退回已发布的月度考核',
    );
  const next: SalesRecord = old
    ? structuredClone(old)
    : {
        id: crypto.randomUUID(),
        memberId: target.id,
        memberName: target.name,
        region: target.region,
        kind: 'activity',
        date: inbox.serverDate,
        period: crypto.randomUUID(),
        status: 'submitted',
        version: 0,
        createdAt: now,
        updatedAt: now,
        data: {},
        history: [],
      };
  if (review) {
    ensure(text(body.note), '请填写审核依据或退回原因');
    ensure(old?.status !== 'returned', '请等待销售补充后重新提交');
    next.data.reviewNote = text(body.note);
    if (action === 'publish') {
      ensure(
        old?.kind === 'performance' && old.status === 'submitted',
        '仅可发布已提交的月度自评',
      );
      ensure(
        old!.period < inbox.serverDate.slice(0, 7),
        '本月尚未结束，结月后才能发布',
      );
      ensure(
        !inbox.records.some(
          (r) => r.kind !== 'performance' && r.status === 'submitted',
        ),
        '请先审核本月工作记录、周报和月报',
      );
      const scores = body.scores as Scores;
      ensure(
        METRICS.every(
          (m) =>
            Number.isFinite(scores?.[m.id]) &&
            scores[m.id] >= 0 &&
            scores[m.id] <= m.max,
        ),
        '请填写有效评分',
      );
      const total = totalScore(scores);
      ensure(
        total < 70 || total >= 80 || text(body.improvement),
        '70–79.9 分需要改进计划',
      );
      next.status = 'published';
      Object.assign(next.data, {
        managerScores: scores,
        total,
        band: performanceBand(total),
        managerNote: text(body.note),
        improvement: text(body.improvement),
        publishedAt: now,
        reviewer: inbox.member.name,
        snapshot: inbox.evidence,
      });
    } else if (action === 'return') {
      if (old?.kind === 'performance' && old.status === 'published')
        next.data.priorResults = [
          ...((old.data.priorResults as unknown[]) || []),
          { ...old.data, priorResults: undefined },
        ];
      next.status = 'returned';
    } else {
      ensure(
        old?.kind !== 'performance' && old?.status === 'submitted',
        '仅能核实待审核材料',
      );
      next.status = 'approved';
    }
  } else if (action === 'self_review') {
    ensure(!old || old.status !== 'approved', '请先由管理退回');
    const scores = body.scores as Scores;
    ensure(
      METRICS.every(
        (m) =>
          Number.isFinite(scores?.[m.id]) &&
          scores[m.id] >= 0 &&
          scores[m.id] <= m.max,
      ),
      '请完成所有评分',
    );
    ensure(text(body.note), '请填写自评说明');
    next.kind = 'performance';
    next.period = inbox.month;
    next.date = inbox.month + '-01';
    next.status = 'submitted';
    next.data = {
      selfScores: scores,
      selfNote: body.note,
      improvement: body.improvement,
      policyVersion: POLICY_VERSION,
      priorResults: old?.data.priorResults || [],
    };
  } else {
    ensure(!old || old.status !== 'approved', '请先由管理退回已核实记录');
    next.kind =
      action === 'weekly'
        ? 'weekly'
        : action === 'monthly'
          ? 'monthly'
          : 'activity';
    next.status = 'submitted';
    next.data = { ...(body.data as Record<string, unknown>) };
    if (action === 'weekly' || action === 'monthly') {
      const checked = reportSchema.safeParse(next.data.report);
      ensure(
        checked.success,
        checked.success
          ? ''
          : checked.error.issues[0]?.message || '填报数量有误',
      );
      next.data.report = checked.data;
      ensure(
        ['summary', 'nextPlan', 'risks', 'evidence'].every((key) =>
          text(next.data[key]),
        ),
        '请填写总结、计划、协调事项及依据',
      );
    }
    if (action === 'weekly') {
      const week = text(body.week);
      next.date = addDays(week, 5);
      next.period = week;
      ensure(
        !inbox.records.some(
          (r) => r.kind === 'weekly' && r.period === week && r.id !== old?.id,
        ),
        '该周已提交，请打开原周报补充',
      );
      Object.assign(next.data, {
        firstSubmittedAt: old?.data.firstSubmittedAt || now,
        submittedAt: now,
        deadline: weeklyDeadline(week),
        late:
          old?.data.late || now > new Date(weeklyDeadline(week)).toISOString(),
      });
    } else if (action === 'monthly') {
      const month = text(body.month);
      ensure(month === inbox.month, '请选择当前查看月份');
      ensure(!old || old.period === month, '不能更改月报月份');
      ensure(
        !inbox.records.some(
          (r) => r.kind === 'monthly' && r.period === month && r.id !== old?.id,
        ),
        '该月已提交，请打开原月报补充',
      );
      next.period = month;
      next.date = month + '-01';
      Object.assign(next.data, {
        firstSubmittedAt: old?.data.firstSubmittedAt || now,
        submittedAt: now,
      });
    } else {
      next.date = text(body.date);
      ensure(next.date <= inbox.serverDate, '不能填写未来日期');
    }
  }
  next.version++;
  next.updatedAt = now;
  next.history.push({
    at: now,
    actor: inbox.member.name,
    note: review ? text(body.note) : '提交演示材料',
  });
  return next;
}
