import type { Member } from '../team';
export const POLICY_START = '2026-08';
export const POLICY_VERSION = 'sales-2026-08';
export const METRICS = [
  {
    id: 'weekly',
    group: '工作行为态度',
    title: '销售周报提交',
    max: 5,
    rule: '每周六 24:00 前完整提交；迟交每次扣 0.5 分，漏交每次扣 1 分，扣完为止。',
    source: '销售考核关键点 C3',
  },
  {
    id: 'response',
    group: '工作行为态度',
    title: '客户消息响应',
    max: 6,
    rule: '工作时段 1 小时及以上未回复，月累计 ≥10 次扣 4 分；非工作时段 4 小时及以上未回复，月累计 ≥10 次扣 2 分。工作时段 1 分钟内回复加 0.5 分，2 分钟内加 0.3 分，月度加分上限 6 分。',
    source: '销售考核关键点 C4',
  },
  {
    id: 'collaboration',
    group: '工作行为态度',
    title: '内部工作群协同',
    max: 5,
    rule: '@本人 30 分钟内回复并同步思路，每次加 0.2 分；当天无回复扣 1 分，仅回复无措施扣 0.5 分。详细方案另列当周周五 18:00 前补齐不扣分，须由管理核实适用情况。',
    source: '销售考核关键点 C5',
  },
  {
    id: 'manufacturer',
    group: '工作行为态度',
    title: '厂家对接信息同步',
    max: 4,
    rule: '每月有效沟通 ≥4 次，合规对接每次加 1 分，上限 4 分；拖延信息反馈每次扣 1 分。',
    source: '销售考核关键点 C6',
  },
  {
    id: 'planning',
    group: '工作行为态度',
    title: '多产品项目统筹',
    max: 5,
    rule: '完整报备、主动梳理和风险预判每次加 0.3 分，上限 5 分；漏报或信息不全每次扣 1 分，多次思路混乱、被动跟进扣 3 分。',
    source: '销售考核关键点 C7',
  },
  {
    id: 'leads',
    group: '销售业务能力',
    title: '有效客户开发',
    max: 20,
    rule: '每周有效产品报备 ≥2 个，月累计 ≥10 个；须含甲方／设计院／负责人、联系方式和项目进度，每少 1 条扣 2 分。',
    source: '销售考核关键点 C9',
  },
  {
    id: 'maintenance',
    group: '销售业务能力',
    title: '老客户维护回访',
    max: 10,
    rule: '每月有效回访 ≥2 家并同步团队群；未达标不得分，有效客诉每次扣 5 分，扣完为止。',
    source: '销售考核关键点 C10；月度绩效考核表第 7 项',
  },
  {
    id: 'proposal',
    group: '销售业务能力',
    title: '客户需求方案输出',
    max: 10,
    rule: '匹配产品、输出技术方案或报价并完整报备，同步团队群每次加 5 分，上限 10 分。',
    source: '销售考核关键点 C11',
  },
  {
    id: 'training',
    group: '销售业务能力',
    title: '培训学习参与',
    max: 5,
    rule: '有培训安排并参加得 3 分，主动提问交流每次加 0.5 分，上限 2 分；当月无培训安排时 5 分全额发放。',
    source: '销售考核关键点 C12',
  },
  {
    id: 'assigned',
    group: '销售业务能力',
    title: '交办事项落实',
    max: 5,
    rule: '24 小时内同步思路每次加 0.2 分；72 小时无反馈扣 1 分，仅回复无思路扣 0.5 分。详细方案另列当周周五 18:00 前补齐不扣分，管理结合期限核实。',
    source: '销售考核关键点 C13',
  },
  {
    id: 'visits',
    group: '业绩经营指标',
    title: '签约拓客动作',
    max: 10,
    rule: '每月有效拜访 ≥3 家且输出报价／方案 ≥2 份得 10 分；仅少量动作得 5 分，无拓客动作得 0 分。',
    source: '销售考核关键点 C16',
  },
  {
    id: 'receivables',
    group: '业绩经营指标',
    title: '应收回款跟进',
    max: 10,
    rule: '当月对账、催收到期应收项目 ≥1 个得 10 分；仅简单问询 5 分，无跟进 0 分。',
    source: '销售考核关键点 C17',
  },
  {
    id: 'expenses',
    group: '业绩经营指标',
    title: '销售费用管控',
    max: 5,
    rule: '预算内得 5 分；每超预算 1% 扣 0.5 分，扣完为止，按已核实的预算与费用计算。',
    source: '销售考核关键点 C18',
  },
] as const;
export type MetricId = (typeof METRICS)[number]['id'];
export type Scores = Record<MetricId, number>;
export const ACTIVITY_TYPES = [
  '新增线索',
  '客户拜访',
  '老客回访',
  '报价方案',
  '厂家对接',
  '培训学习',
  '回款跟进',
  '客户响应',
  '内部协同',
  '项目统筹',
  '交办事项',
  '费用说明',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];
export type SalesRecord = {
  id: string;
  memberId: string;
  memberName: string;
  region: string;
  kind: 'activity' | 'weekly' | 'monthly' | 'performance';
  period: string;
  date: string;
  status: 'submitted' | 'approved' | 'returned' | 'draft' | 'published';
  version: number;
  createdAt: string;
  updatedAt: string;
  data: Record<string, unknown>;
  history: { at: string; actor: string; note: string }[];
};
export type ActivityData = {
  type: ActivityType;
  title: string;
  customer: string;
  contact: string;
  progress: string;
  result: string;
  evidence: string;
  projectId: string;
  projectName: string;
  customerStage?: string;
  customerCategory?: string;
  contactMethod?: string;
  focusIndustry?: string;
  reviewNote?: string;
};
export type WeeklyData = {
  report?: import('./report-model').ReportData;
  summary: string;
  nextPlan: string;
  risks: string;
  evidence: string;
  firstSubmittedAt: string;
  submittedAt: string;
  deadline: string;
  late: boolean;
  reviewNote?: string;
};
export type PerformanceData = {
  selfScores: Scores;
  selfNote: string;
  managerScores?: Scores;
  managerNote?: string;
  improvement: string;
  policyVersion: string;
  total?: number;
  band?: ReturnType<typeof performanceBand>;
  publishedAt?: string;
  reviewer?: string;
  snapshot?: EvidenceSummary;
};
export type EvidenceSummary = {
  counts: Record<string, number>;
  customersVisited: number;
  oldCustomers: number;
  weeklySubmitted: number;
  weeklyApproved: number;
  weeklyLate: number;
  weeklyMissing: number;
  weeklyExpected: number;
  pendingActivities: number;
};
export type SalesInbox = {
  member: Member;
  people: (Pick<Member, 'id' | 'name' | 'region' | 'status'> & {
    pending: number;
  })[];
  records: SalesRecord[];
  evidence: EvidenceSummary;
  serverDate: string;
  month: string;
  selectedMemberId: string;
  rules: typeof METRICS;
  policyNotes: string[];
  guidance: { title: string; source: string; body: string }[];
};
export const localDate = (now: Date = new Date()) =>
  new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Shanghai',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(now);
export const mondayOf = (date: string) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
};
export const addDays = (date: string, days: number) => {
  const d = new Date(date + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};
export const weeklyDeadline = (monday: string) =>
  addDays(monday, 6) + 'T00:00:00+08:00';
export const totalScore = (scores: Scores) =>
  Math.round(METRICS.reduce((n, m) => n + scores[m.id], 0) * 10) / 10;
export function performanceBand(score: number) {
  return score >= 90
    ? { label: '优秀', referenceBonus: 500 }
    : score >= 80
      ? { label: '合格达标', referenceBonus: 250 }
      : score >= 70
        ? { label: '基本合格', referenceBonus: 100 }
        : { label: '未达标', referenceBonus: 0 };
}
export function evidenceSummary(
  records: SalesRecord[],
  month: string,
  today = localDate(),
): EvidenceSummary {
  const activities = records.filter(
    (r) =>
      r.kind === 'activity' &&
      r.date.startsWith(month) &&
      r.status === 'approved',
  );
  const visits = activities.filter(
      (r) =>
        (r.data.type === '客户拜访' ||
          (r.data.type === '老客回访' &&
            r.data.contactMethod === '现场拜访')) &&
        !['电话', '线上'].includes(String(r.data.contactMethod)),
    ),
    maintenance = activities.filter((r) => r.data.type === '老客回访');
  const expected: string[] = [];
  for (let day = month + '-01'; day.startsWith(month); day = addDays(day, 1)) {
    if (new Date(day + 'T00:00:00Z').getUTCDay() === 6 && day < today)
      expected.push(mondayOf(day));
  }
  const weekly = records.filter(
    (r) => r.kind === 'weekly' && expected.includes(r.period),
  );
  return {
    counts: Object.fromEntries(
      ACTIVITY_TYPES.map((t) => [
        t,
        activities.filter((r) => r.data.type === t).length,
      ]),
    ),
    customersVisited: new Set(
      visits.map((r) => String(r.data.customer).trim().toLowerCase()),
    ).size,
    oldCustomers: new Set(
      maintenance.map((r) => String(r.data.customer).trim().toLowerCase()),
    ).size,
    weeklySubmitted: weekly.length,
    weeklyApproved: weekly.filter((r) => r.status === 'approved').length,
    weeklyLate: weekly.filter((r) => r.data.late).length,
    weeklyMissing: expected.filter((w) => !weekly.some((r) => r.period === w))
      .length,
    weeklyExpected: expected.length,
    pendingActivities: records.filter(
      (r) =>
        r.kind === 'activity' &&
        r.date.startsWith(month) &&
        r.status === 'submitted',
    ).length,
  };
}
export const STATUS_LABELS: Record<SalesRecord['status'], string> = {
  submitted: '待审核',
  approved: '已核实',
  returned: '退回补充',
  draft: '待提交',
  published: '已发布',
};
