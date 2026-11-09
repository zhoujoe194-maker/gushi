// Weekly and monthly reports share the company's October 2026 reporting form.
// Quantities are self-reported evidence, never automatic performance scores.
export const REPORT_SECTIONS = [
  {
    id: 'weekly',
    title: '销售周报提交',
    group: '工作行为态度',
    hint: '填写本人统计口径；平台按周六截止计算的记录另列，不会被此处覆盖。',
    fields: [
      ['weeklyExpected', '应提交', '份'],
      ['weeklySubmitted', '实提交', '份'],
      ['weeklyLate', '迟交', '份'],
      ['weeklyMissing', '漏交', '份'],
    ],
    note: '周报口径说明',
  },
  {
    id: 'manufacturer',
    title: '厂家对接',
    group: '工作行为态度',
    hint: '记录有效沟通、报备、意见建议、竞品情况和同行案例。',
    fields: [['manufacturer', '有效沟通', '次']],
    note: '厂家及对接内容',
  },
  {
    id: 'planning',
    title: '项目统筹报备',
    group: '工作行为态度',
    hint: '列明报备项目和遗漏情况。',
    fields: [
      ['registered', '规范报备', '项'],
      ['missedRegistration', '漏报备', '项'],
    ],
    note: '报备项目清单与遗漏说明',
  },
  {
    id: 'leads',
    title: '有效项目线索收集',
    group: '销售业务能力',
    hint: '可来自用户端、竞品、设计、总包、经销商；说明联系人和项目进度。',
    fields: [['leads', '有效项目线索', '条']],
    note: '线索清单及来源',
  },
  {
    id: 'old',
    title: '老客户有效回访',
    group: '销售业务能力',
    hint: '按客户去重，四类合计应与总数一致。电联是其中项，不额外相加。',
    fields: [
      ['oldTotal', '老客户总数', '家'],
      ['oldPeer', '老客户 · 同行', '家'],
      ['oldDesign', '老客户 · 设计', '家'],
      ['oldOwner', '老客户 · 业主', '家'],
      ['oldPurchase', '老客户 · 采购', '家'],
      ['oldPhone', '老客户 · 其中电联', '家'],
    ],
    note: '老客户分类清单、回访内容及电联说明',
  },
  {
    id: 'new',
    title: '新客户拜访',
    group: '销售业务能力',
    hint: '按客户去重，四类合计应与总数一致。注明半导体芯片、数据中心等重点客户。',
    fields: [
      ['newTotal', '新客户总数', '家'],
      ['newPeer', '新客户 · 同行', '家'],
      ['newDesign', '新客户 · 设计', '家'],
      ['newOwner', '新客户 · 业主', '家'],
      ['newPurchase', '新客户 · 采购', '家'],
      ['newPhone', '新客户 · 其中电联', '家'],
    ],
    note: '新客户分类清单、电联及重点行业说明',
  },
  {
    id: 'training',
    title: '培训学习',
    group: '销售业务能力',
    hint: '没有发生填 0，尚未核实可留空。',
    fields: [
      ['trainingAbsent', '缺席', '次'],
      ['trainingExchange', '主动交流', '次'],
    ],
    note: '培训安排与交流内容',
  },
  {
    id: 'assigned',
    title: '上级交办事项',
    group: '销售业务能力',
    hint: '分别记录本期接收、本期闭环和超时未反馈事项，可说明跨期任务。',
    fields: [
      ['assignedReceived', '接收', '项'],
      ['assignedClosed', '闭环', '项'],
      ['assignedOverdue', '超时未反馈', '项'],
    ],
    note: '交办事项与闭环说明',
  },
  {
    id: 'visits',
    title: '有效客户拜访数量',
    group: '业绩经营指标',
    hint: '单列填报的有效数量，并说明电联是否计入及认定依据，由管理核实。',
    fields: [['effectiveVisits', '有效客户拜访', '家']],
    note: '有效拜访认定说明',
  },
  {
    id: 'proposal',
    title: '输出并报备报价／技术方案',
    group: '业绩经营指标',
    hint: '填写已输出并报备的方案，不把计划数量计作完成。',
    fields: [['proposals', '报价／技术方案', '份']],
    note: '报价与方案清单',
  },
] as const;
export type ReportValueKey =
  (typeof REPORT_SECTIONS)[number]['fields'][number][0];
export type ReportNoteKey = (typeof REPORT_SECTIONS)[number]['id'];
export type ReportData = {
  values: Record<ReportValueKey, number | null>;
  notes: Record<ReportNoteKey, string>;
};
export function blankReport(): ReportData {
  return {
    values: Object.fromEntries(
      REPORT_SECTIONS.flatMap((s) => s.fields.map((f) => [f[0], null])),
    ) as ReportData['values'],
    notes: Object.fromEntries(
      REPORT_SECTIONS.map((s) => [s.id, '']),
    ) as ReportData['notes'],
  };
}
export function reportErrors(report: ReportData): string[] {
  const v = report.values,
    errors: string[] = [];
  for (const prefix of ['old', 'new'] as const) {
    const label = prefix === 'old' ? '老客户' : '新客户';
    const total = v[`${prefix}Total`],
      phone = v[`${prefix}Phone`];
    const parts = [
      v[`${prefix}Peer`],
      v[`${prefix}Design`],
      v[`${prefix}Owner`],
      v[`${prefix}Purchase`],
    ];
    if (
      total !== null &&
      ((parts.every((n) => n !== null) &&
        parts.reduce<number>((n, x) => n + (x ?? 0), 0) !== total) ||
        parts.reduce<number>((n, x) => n + (x ?? 0), 0) > total)
    )
      errors.push(`${label}四类数量合计须等于${label}总数`);
    if (total !== null && phone !== null && phone > total)
      errors.push(`${label}电联数量不能超过总数`);
  }
  if (
    v.weeklyExpected !== null &&
    v.weeklySubmitted !== null &&
    v.weeklyMissing !== null &&
    v.weeklySubmitted + v.weeklyMissing !== v.weeklyExpected
  )
    errors.push('周报实提交与漏交合计须等于应提交数量');
  if (
    v.weeklyLate !== null &&
    v.weeklySubmitted !== null &&
    v.weeklyLate > v.weeklySubmitted
  )
    errors.push('迟交数量不能超过实提交数量');
  return errors;
}
