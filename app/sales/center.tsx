'use client';
import { useEffect, useRef, useState } from 'react';
import {
  Plus,
  ClipboardCheck,
  CalendarDays,
  FileCheck2,
  BookOpen,
  Download,
  RefreshCw,
  ArrowRight,
} from 'lucide-react';
import { isManager, deskOf, type Member } from '../team';
import type { Project } from '../model';
import { FinanceModal } from '../role-panels';
import {
  METRICS,
  ACTIVITY_TYPES,
  POLICY_START,
  STATUS_LABELS,
  localDate,
  mondayOf,
  addDays,
  totalScore,
  performanceBand,
  type SalesInbox,
  type SalesRecord,
  type PerformanceData,
  type Scores,
} from './model';
import './sales.css';
import { demoSalesInbox, updateSalesDemo } from './demo';
import {
  blankReport,
  REPORT_SECTIONS,
  reportErrors,
  type ReportData,
} from './report-model';
import { ReportFields, ReportReadOnly } from './report-fields';
import { useUnsavedChanges } from '../../hooks/use-unsaved-changes';
import { UnsavedNotice } from './unsaved-notice';
const tabs = [
  { id: 'activity', label: '工作记录', icon: ClipboardCheck },
  { id: 'weekly', label: '销售周报', icon: CalendarDays },
  { id: 'monthly', label: '销售月报', icon: CalendarDays },
  { id: 'performance', label: '月度绩效', icon: FileCheck2 },
  { id: 'policy', label: '制度与成长', icon: BookOpen },
] as const;
type Tab = (typeof tabs)[number]['id'];
type Action = (body: Record<string, unknown>) => Promise<boolean>;
function availableMonths() {
  const [startYear, startMonth] = POLICY_START.split('-').map(Number);
  const [endYear, endMonth] = localDate().slice(0, 7).split('-').map(Number);
  return Array.from(
    { length: (endYear - startYear) * 12 + endMonth - startMonth + 1 },
    (_, index) =>
      new Date(Date.UTC(startYear, startMonth - 1 + index, 1))
        .toISOString()
        .slice(0, 7),
  ).reverse();
}
const time = (s: string) =>
  new Date(s).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    hour12: false,
  });
function download(inbox: SalesInbox) {
  const rows: unknown[][] = [
    [
      '月份',
      '姓名',
      '记录类型',
      '发生日期 / 周起始日',
      '标题',
      '状态',
      '处理结果 / 周总结',
      '凭据 / 评分说明',
      '自评总分',
      '管理总分',
      '最后更新',
      '下一期计划',
      '风险与协调',
      '客户属性',
      '客户类别',
      '沟通方式',
      '重点行业',
      ...REPORT_SECTIONS.flatMap((s) =>
        s.fields.map((f) => f[1] + '（' + f[2] + '）'),
      ),
      ...REPORT_SECTIONS.map((s) => s.note),
    ],
  ];
  for (const r of inbox.records)
    rows.push([
      inbox.month,
      r.memberName,
      r.kind === 'activity'
        ? '工作记录'
        : r.kind === 'weekly'
          ? '销售周报'
          : r.kind === 'monthly'
            ? '销售月报'
            : '月度绩效',
      r.kind === 'weekly' ? r.period : r.date,
      r.data.title || r.period,
      STATUS_LABELS[r.status],
      r.data.result || r.data.summary || '',
      r.data.evidence || r.data.managerNote || r.data.selfNote || '',
      r.data.selfScores ? totalScore(r.data.selfScores as Scores) : '',
      r.status === 'published' ? r.data.total : '',
      r.updatedAt,
      r.data.nextPlan || '',
      r.data.risks || '',
      r.data.customerStage || '',
      r.data.customerCategory || '',
      r.data.contactMethod || '',
      r.data.focusIndustry || '',
      ...REPORT_SECTIONS.flatMap((s) =>
        s.fields.map(
          (f) => (r.data.report as ReportData | undefined)?.values[f[0]] ?? '',
        ),
      ),
      ...REPORT_SECTIONS.map(
        (s) => (r.data.report as ReportData | undefined)?.notes[s.id] || '',
      ),
    ]);
  const safe = (v: unknown) => {
    let s = String(v ?? '');
    if (/^[\s]*[=+\-@]/.test(s)) s = "'" + s;
    return '"' + s.replaceAll('"', '""') + '"';
  };
  const url = URL.createObjectURL(
    new Blob(['\uFEFF' + rows.map((r) => r.map(safe).join(',')).join('\r\n')], {
      type: 'text/csv;charset=utf-8',
    }),
  );
  const a = document.createElement('a');
  a.href = url;
  a.download = '销售履职-' + inbox.month + '.csv';
  a.click();
  URL.revokeObjectURL(url);
}
export default function SalesCenter({
  member,
  projects,
  demo = false,
}: {
  member: Member;
  projects: Project[];
  demo?: boolean;
}) {
  const manager = isManager(member),
    [month, setMonth] = useState(localDate().slice(0, 7)),
    [person, setPerson] = useState(''),
    [tab, setTab] = useState<Tab>('activity'),
    [nonce, setNonce] = useState(0);
  const [loaded, setLoaded] = useState<{
      key: string;
      inbox?: SalesInbox;
      error?: string;
    }>(),
    [error, setError] = useState(''),
    [notice, setNotice] = useState(''),
    [busy, setBusy] = useState(false),
    [editor, setEditor] = useState<{
      kind: SalesRecord['kind'];
      record?: SalesRecord;
    }>(),
    [detail, setDetail] = useState<SalesRecord>();
  const [demoRecords, setDemoRecords] = useState<Record<string, SalesRecord[]>>(
    {},
  );
  const submitting = useRef(false);
  const key = month + ':' + person + ':' + nonce;
  useEffect(() => {
    if (demo) return;
    const controller = new AbortController();
    fetch(
      '/api/sales?' +
        new URLSearchParams({ month, ...(person ? { memberId: person } : {}) }),
      {
        cache: 'no-store',
        headers: { 'X-Workspace-Desk': deskOf(member.role) },
        signal: controller.signal,
      },
    )
      .then(async (res) => {
        const body = (await res.json()) as SalesInbox & { error?: string };
        if (!res.ok) throw Error(body.error || '加载失败');
        return body as SalesInbox;
      })
      .then((inbox) => setLoaded({ key, inbox }))
      .catch((e) => {
        if (!controller.signal.aborted)
          setLoaded({
            key,
            error: e instanceof Error ? e.message : '加载失败',
          });
      });
    return () => controller.abort();
  }, [demo, key, month, person, member.role]);
  const inbox = demo
    ? demoSalesInbox(member, month, person, demoRecords)
    : loaded?.key === key
      ? loaded.inbox
      : undefined;
  async function action(body: Record<string, unknown>) {
    if (submitting.current) return false;
    submitting.current = true;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (demo && inbox) {
        const record = updateSalesDemo(inbox, body);
        const nextMonth = record.date.slice(0, 7);
        const target = demoSalesInbox(
          member,
          nextMonth,
          inbox.selectedMemberId,
          demoRecords,
        );
        setDemoRecords((previous) => ({
          ...previous,
          [nextMonth + ':' + target.selectedMemberId]: [
            record,
            ...target.records.filter((r) => r.id !== record.id),
          ],
        }));
        setMonth(nextMonth);
        setEditor(undefined);
        setDetail(undefined);
        setNotice('演示记录已更新，仅保存在当前页面；刷新或重置后恢复示例。');
        return true;
      }
      const res = await fetch('/api/sales', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Workspace-Desk': deskOf(member.role),
        },
        body: JSON.stringify(body),
      });
      const data = (await res.json()) as {
        error?: string;
        record?: SalesRecord;
      };
      if (!res.ok) throw Error(data.error || '保存失败');
      setEditor(undefined);
      setDetail(undefined);
      if (data.record) setMonth(data.record.date.slice(0, 7));
      setNonce((n) => n + 1);
      setNotice('已保存，记录与审核历史已更新。');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : '保存失败，请重试');
      return false;
    } finally {
      submitting.current = false;
      setBusy(false);
    }
  }
  function openEditor(kind: SalesRecord['kind'], record?: SalesRecord) {
    setError('');
    setEditor({ kind, record });
  }
  const selected = inbox?.people.find((p) => p.id === inbox.selectedMemberId),
    records = inbox?.records.filter((r) => r.kind === tab) || [],
    assessment = inbox?.records.find((r) => r.kind === 'performance'),
    monthly = inbox?.records.find((r) => r.kind === 'monthly'),
    self = member.role === 'sales';
  return (
    <section className="sales-center" aria-label="销售履职与考核">
      {demo && (
        <p className="info-note">
          演示数据 ·
          成员、客户与考核均为虚构。可试填、审核和退回；本月展示待办，上月可查看已发布结果与待核定示例。刷新页面或重置后恢复。
        </p>
      )}
      <div className="sales-toolbar">
        <label className="field">
          考核月份
          <select value={month} onChange={(e) => setMonth(e.target.value)}>
            {availableMonths().map((value) => (
              <option key={value} value={value}>
                {value.replace('-', ' 年 ')} 月
              </option>
            ))}
          </select>
        </label>
        {manager && (
          <label className="field">
            销售成员
            <select
              value={person || inbox?.selectedMemberId || ''}
              onChange={(e) => setPerson(e.target.value)}
            >
              <option value="">选择成员</option>
              {(inbox?.people || loaded?.inbox?.people || []).map((p) => (
                <option value={p.id} key={p.id}>
                  {p.name} · {p.region}
                  {p.status === 'disabled' ? '（已停用）' : ''}
                  {p.pending ? ' · ' + p.pending + ' 项待审' : ''}
                </option>
              ))}
            </select>
          </label>
        )}
        <div className="sales-toolbar-actions">
          <button
            className="button"
            disabled={busy}
            onClick={() =>
              demo
                ? (setDemoRecords({}), setNotice('演示数据已重置'))
                : setNonce((n) => n + 1)
            }
          >
            <RefreshCw size={16} />
            {demo ? '重置演示' : '刷新'}
          </button>
          <button
            className="button"
            disabled={!inbox || !inbox.records.length}
            onClick={() => inbox && download(inbox)}
          >
            <Download size={16} />
            导出本月
          </button>
        </div>
      </div>
      <div className="sales-tabs" role="group" aria-label="销售考核栏目">
        {tabs.map((t) => (
          <button
            key={t.id}
            aria-pressed={tab === t.id}
            className={tab === t.id ? 'active' : ''}
            onClick={() => setTab(t.id)}
          >
            <t.icon size={17} />
            {t.label}
          </button>
        ))}
      </div>
      {notice && (
        <p role="status" className="info-note">
          {notice}
        </p>
      )}
      {error && !editor && !detail && (
        <p className="error-box" role="alert">
          {error}
        </p>
      )}
      {!inbox ? (
        loaded?.key === key && loaded.error ? (
          <div className="error-box" role="alert">
            {loaded.error}
            <button className="button" onClick={() => setNonce((n) => n + 1)}>
              重新加载
            </button>
          </div>
        ) : (
          <p role="status" className="sales-empty">
            正在加载销售记录…
          </p>
        )
      ) : (
        <>
          <div className="sales-summary">
            <div>
              <span>有效线索</span>
              <strong>
                {inbox.evidence.counts['新增线索']}
                <small> / 10 条</small>
              </strong>
            </div>
            <div>
              <span>有效客户拜访</span>
              <strong>
                {inbox.evidence.customersVisited}
                <small> / 3 家</small>
              </strong>
            </div>
            <div>
              <span>老客户回访</span>
              <strong>
                {inbox.evidence.oldCustomers}
                <small> / 2 家</small>
              </strong>
            </div>
            <div>
              <span>工作记录待核实</span>
              <strong>
                {inbox.evidence.pendingActivities}
                <small> 条</small>
              </strong>
            </div>
          </div>
          <p className="helper-text">
            {selected ? selected.name + ' · ' + selected.region + '。' : ''}
            统计仅采用管理已核实的工作记录，同一客户去重。明确标为电话或线上的记录不计入现场拜访；历史未注明方式的拜访保留原口径。周报、月报的填报数另列，由管理核实。
          </p>
          {tab === 'policy' ? (
            <Policy inbox={inbox} />
          ) : (
            <>
              <div className="section-heading sales-section-heading">
                <div>
                  <h2>
                    {tab === 'activity'
                      ? '把日常工作留下依据'
                      : tab === 'weekly'
                        ? '每周总结，安排下一步'
                        : tab === 'monthly'
                          ? '业务员月报与下月安排'
                          : '月度自评与管理核定'}
                  </h2>
                  <p>
                    {tab === 'activity'
                      ? '记录拓客、客户维护、方案、厂家沟通和业务跟进。'
                      : tab === 'weekly'
                        ? '每周六 24:00 截止，按北京时间记录提交时点。'
                        : tab === 'monthly'
                          ? '按自然月填写业务数量、客户分类、本月总结和下月计划。'
                          : '13 项共 100 分；自评、上级评分与核定结果分别保留。'}
                  </p>
                </div>
                {self && (
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      assessment?.status === 'published' ||
                      (tab === 'monthly' && monthly?.status === 'approved')
                    }
                    onClick={() =>
                      openEditor(
                        tab,
                        tab === 'performance'
                          ? assessment
                          : tab === 'monthly'
                            ? monthly
                            : undefined,
                      )
                    }
                  >
                    <Plus size={17} />
                    {tab === 'activity'
                      ? '新增工作记录'
                      : tab === 'weekly'
                        ? '提交周报'
                        : tab === 'monthly'
                          ? monthly
                            ? '完善月报'
                            : '填写月报'
                          : assessment
                            ? '完善自评'
                            : '填写月度自评'}
                  </button>
                )}
              </div>
              {assessment?.status === 'published' && (
                <p className="info-note">
                  本月考核已发布，相关记录已锁定。如需补充，请联系管理退回本月考核。
                </p>
              )}
              {tab === 'weekly' && (
                <p className="info-note">
                  截至目前，本月已有 {inbox.evidence.weeklyExpected}{' '}
                  个周报截止日；到期周报已交 {inbox.evidence.weeklySubmitted}{' '}
                  份，迟交 {inbox.evidence.weeklyLate} 份，未交{' '}
                  {inbox.evidence.weeklyMissing} 份，已确认{' '}
                  {inbox.evidence.weeklyApproved} 份。跨月周按周六所属月份归档。
                </p>
              )}
              {tab === 'performance' && (
                <>
                  <div className="sales-policy-line">
                    行为态度 25 分 · 业务能力 50 分 · 经营指标 25 分
                  </div>
                  {month === '2026-08' && (
                    <p className="info-note">
                      2026 年 8
                      月为制度适应期，扣分仅记录提醒，结果不作为自动奖惩或发薪依据。
                    </p>
                  )}
                  <p className="helper-text">
                    参考激励：≥90 分 500 元；≥80 分 250 元；≥70 分 100 元；70
                    分以下 0 元。薪资表另列绩效栏为 0，实际发放口径由公司确认。
                  </p>
                  <p className="info-note">
                    本月月报：
                    {monthly ? STATUS_LABELS[monthly.status] : '尚未提交'}
                    。填报数量作为评分依据，仍须逐项核定；发布前先完成已提交材料的审核。
                  </p>
                </>
              )}
              <div className="panel">
                {records.length ? (
                  records.map((r) => (
                    <button
                      className="sales-record"
                      key={r.id}
                      onClick={() => {
                        setError('');
                        setDetail(r);
                      }}
                    >
                      <span>
                        <strong>
                          {r.kind === 'activity'
                            ? String(r.data.title)
                            : r.kind === 'weekly'
                              ? r.period +
                                ' 至 ' +
                                addDays(r.period, 5) +
                                ' 周报'
                              : r.kind === 'monthly'
                                ? r.period + ' 销售月报'
                                : r.period + ' 月度绩效'}
                        </strong>
                        <small>
                          {r.kind === 'activity'
                            ? String(r.data.type) + ' · ' + r.date
                            : r.kind === 'weekly'
                              ? (r.data.late ? '迟交 · ' : '按时提交 · ') +
                                time(String(r.data.submittedAt))
                              : r.kind === 'monthly'
                                ? '本月总结与下月计划 · ' +
                                  time(String(r.data.submittedAt))
                                : '自评 ' +
                                  totalScore(
                                    (r.data as unknown as PerformanceData)
                                      .selfScores,
                                  ) +
                                  ' 分' +
                                  (r.status === 'published'
                                    ? ' · 管理核定 ' + r.data.total + ' 分'
                                    : '')}
                          {r.data.customer ? ' · ' + r.data.customer : ''}
                        </small>
                      </span>
                      <span
                        className={
                          'badge ' +
                          (r.status === 'approved' || r.status === 'published'
                            ? 'green'
                            : r.status === 'returned'
                              ? 'amber'
                              : 'blue')
                        }
                      >
                        {STATUS_LABELS[r.status]}
                      </span>
                      <ArrowRight size={16} />
                    </button>
                  ))
                ) : (
                  <div className="sales-empty">
                    <h3>
                      {tab === 'activity'
                        ? '本月还没有工作记录'
                        : tab === 'weekly'
                          ? '本月还没有周报'
                          : tab === 'monthly'
                            ? '本月还没有月报'
                            : '本月还没有自评'}
                    </h3>
                    <p>
                      {self
                        ? '点击上方按钮开始填写，提交后由管理审核。'
                        : '成员在销售台提交后，会在这里显示待审核的内容。'}
                    </p>
                  </div>
                )}
              </div>
            </>
          )}
        </>
      )}
      {editor && inbox && (
        <RecordEditor
          key={editor.record?.id || editor.kind}
          kind={editor.kind}
          record={editor.record}
          month={month}
          today={inbox.serverDate}
          projects={projects}
          reports={inbox.records.filter((r) => r.kind === 'monthly')}
          busy={busy}
          error={error}
          close={() => !busy && setEditor(undefined)}
          save={action}
        />
      )}
      {detail && inbox && !editor && (
        <RecordDetail
          key={detail.id + ':' + detail.version}
          record={detail}
          manager={manager && detail.memberId !== member.id}
          self={self}
          busy={busy}
          error={error}
          inbox={inbox}
          close={() => !busy && setDetail(undefined)}
          edit={() => openEditor(detail.kind, detail)}
          action={action}
        />
      )}
    </section>
  );
}
function RecordEditor({
  kind,
  record,
  month,
  today,
  projects,
  reports,
  busy,
  error,
  close,
  save,
}: {
  kind: SalesRecord['kind'];
  record?: SalesRecord;
  month: string;
  today: string;
  projects: Project[];
  reports: SalesRecord[];
  busy: boolean;
  error: string;
  close: () => void;
  save: Action;
}) {
  const [date, setDate] = useState(
      record?.date || (today.startsWith(month) ? today : month + '-01'),
    ),
    [week, setWeek] = useState(() => {
      if (record) return record.period;
      const monday = mondayOf(today.startsWith(month) ? today : month + '-01');
      const saturday = addDays(monday, 5);
      return saturday.slice(0, 7) === month
        ? monday
        : addDays(monday, saturday < month + '-01' ? 7 : -7);
    }),
    [draft, setDraft] = useState({
      type: '新增线索',
      title: '',
      customer: '',
      contact: '',
      progress: '',
      result: '',
      evidence: '',
      projectId: '',
      summary: '',
      nextPlan: '',
      risks: '',
      customerStage: '未分类',
      customerCategory: '未分类',
      contactMethod: '未注明',
      focusIndustry: '',
      ...record?.data,
    });
  const [report, setReport] = useState<ReportData>(
    () => (record?.data.report as ReportData) || blankReport(),
  );
  const guardedClose = useUnsavedChanges(
    JSON.stringify({ date, week, draft, report }),
    close,
    busy,
  );
  if (kind === 'performance')
    return (
      <ScoreEditor
        record={record}
        month={month}
        busy={busy}
        error={error}
        close={close}
        save={save}
        reports={reports}
      />
    );
  const change = (name: string, value: string) =>
    setDraft((d) => ({ ...d, [name]: value }));
  return (
    <FinanceModal
      title={
        kind === 'activity'
          ? '填写销售工作记录'
          : kind === 'monthly'
            ? '填写销售月报'
            : '填写销售周报'
      }
      close={guardedClose.requestClose}
      wide={kind !== 'activity'}
    >
      <UnsavedNotice guard={guardedClose} />
      <form
        className="project-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          const form = new FormData(e.currentTarget);
          save({
            action: kind,
            id: record?.id,
            version: record?.version,
            month,
            date: form.get('activityDate'),
            week: kind === 'weekly' ? mondayOf(week) : undefined,
            data: kind === 'activity' ? draft : { ...draft, report },
          });
        }}
      >
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        {kind === 'activity' ? (
          <>
            <div className="form-grid">
              <label className="field">
                工作类型
                <select
                  value={draft.type as string}
                  onChange={(e) => change('type', e.target.value)}
                >
                  {ACTIVITY_TYPES.map((t) => (
                    <option key={t}>{t}</option>
                  ))}
                </select>
              </label>
              <label className="field">
                发生日期 *
                <input
                  name="activityDate"
                  type="date"
                  required
                  min="2026-08-01"
                  max={today}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              工作主题 *
              <input
                required
                maxLength={200}
                value={draft.title as string}
                onChange={(e) => change('title', e.target.value)}
              />
            </label>
            <div className="form-grid">
              <label className="field">
                客户／项目单位
                {['新增线索', '客户拜访', '老客回访', '报价方案'].includes(
                  draft.type as string,
                )
                  ? ' *'
                  : '（选填）'}
                <input
                  required={[
                    '新增线索',
                    '客户拜访',
                    '老客回访',
                    '报价方案',
                  ].includes(draft.type as string)}
                  maxLength={200}
                  value={draft.customer as string}
                  onChange={(e) => change('customer', e.target.value)}
                />
              </label>
              <label className="field">
                负责人及联系方式{draft.type === '新增线索' ? ' *' : '（选填）'}
                <input
                  required={draft.type === '新增线索'}
                  maxLength={200}
                  value={draft.contact as string}
                  onChange={(e) => change('contact', e.target.value)}
                />
              </label>
            </div>
            <label className="field">
              项目进度{draft.type === '新增线索' ? ' *' : '（选填）'}
              <input
                required={draft.type === '新增线索'}
                maxLength={1000}
                value={draft.progress as string}
                onChange={(e) => change('progress', e.target.value)}
              />
            </label>
            <div className="form-grid">
              {(
                [
                  ['customerStage', '客户属性', ['未分类', '新客户', '老客户']],
                  [
                    'customerCategory',
                    '客户类别',
                    ['未分类', '同行', '设计', '业主', '采购'],
                  ],
                  [
                    'contactMethod',
                    '沟通方式',
                    ['未注明', '现场拜访', '电话', '线上'],
                  ],
                ] as const
              ).map(([key, label, options]) => (
                <label className="field" key={key}>
                  {label}
                  <select
                    value={draft[key] as string}
                    onChange={(e) => change(key, e.target.value)}
                  >
                    {options.map((option) => (
                      <option key={option}>{option}</option>
                    ))}
                  </select>
                </label>
              ))}
              <label className="field">
                重点行业（选填）
                <input
                  maxLength={200}
                  value={draft.focusIndustry as string}
                  onChange={(e) => change('focusIndustry', e.target.value)}
                  placeholder="如半导体芯片、数据中心"
                />
              </label>
            </div>
            <label className="field">
              关联项目（选填）
              <select
                value={draft.projectId as string}
                onChange={(e) => change('projectId', e.target.value)}
              >
                <option value="">独立工作记录</option>
                {projects.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="field">
              处理过程与结果 *
              <textarea
                required
                rows={4}
                maxLength={4000}
                value={draft.result as string}
                onChange={(e) => change('result', e.target.value)}
              />
            </label>
          </>
        ) : (
          <>
            {kind === 'weekly' ? (
              <>
                <label className="field">
                  所属周（选择该周任一天） *
                  <input
                    type="date"
                    name="weekDate"
                    required
                    disabled={!!record}
                    max={today}
                    value={week}
                    onChange={(e) => setWeek(e.target.value)}
                  />
                </label>
                <p className="helper-text">
                  {week && mondayOf(week)} 起的周报，周六 24:00
                  截止；迟交会保留实际提交时间。归档月份：
                  {week && addDays(mondayOf(week), 5).slice(0, 7)}。
                </p>
              </>
            ) : (
              <p className="info-note">
                填报月份：{month}
                。月报与月度评分分别留存，当前月可先提交阶段总结；已核实后需管理退回才能补充。
              </p>
            )}
            <ReportFields value={report} change={setReport} disabled={busy} />
            {[
              [
                'summary',
                kind === 'monthly' ? '本月总结' : '本周项目进展与工作总结',
              ],
              [
                'nextPlan',
                kind === 'monthly' ? '下月计划' : '下周计划与具体安排',
              ],
              ['risks', '风险、阻碍及需协调事项'],
            ].map(([key, label]) => (
              <label key={key} className="field">
                {label} *
                <textarea
                  required
                  rows={3}
                  maxLength={4000}
                  value={draft[key as keyof typeof draft] as string}
                  onChange={(e) => change(key, e.target.value)}
                  placeholder={
                    key === 'risks'
                      ? '如无风险，也请说明“本期无待协调事项”'
                      : undefined
                  }
                />
              </label>
            ))}
          </>
        )}
        <label className="field">
          可核实的依据 *
          <textarea
            required
            rows={2}
            maxLength={4000}
            value={draft.evidence as string}
            onChange={(e) => change('evidence', e.target.value)}
            placeholder="例如：沟通日期、团队群消息位置、报价编号、回访记录或材料存放位置"
          />
        </label>
        <p className="helper-text">
          提交即进入管理核实；填报内容会留档，请勿把未发生的事项计作已完成。
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={guardedClose.requestClose}
          >
            取消
          </button>
          <button
            className="button primary"
            disabled={
              busy || (kind !== 'activity' && reportErrors(report).length > 0)
            }
          >
            {busy ? '提交中…' : record ? '保存并重新提交' : '提交审核'}
          </button>
        </div>
      </form>
    </FinanceModal>
  );
}
function ScoreEditor({
  record,
  month,
  manager = false,
  busy,
  error,
  close,
  save,
  reports = [],
}: {
  record?: SalesRecord;
  month: string;
  manager?: boolean;
  busy: boolean;
  error: string;
  close: () => void;
  save: Action;
  reports?: SalesRecord[];
}) {
  const data = record?.data as unknown as PerformanceData | undefined;
  const [scores, setScores] = useState<Record<string, string>>(() =>
      Object.fromEntries(
        METRICS.map((m) => [
          m.id,
          String(
            (manager
              ? data?.managerScores || data?.selfScores
              : data?.selfScores)?.[m.id] ?? '',
          ),
        ]),
      ),
    ),
    [note, setNote] = useState(
      manager ? data?.managerNote || '' : data?.selfNote || '',
    ),
    [improvement, setImprovement] = useState(data?.improvement || '');
  const guardedClose = useUnsavedChanges(
    JSON.stringify({ scores, note, improvement }),
    close,
    busy,
  );
  const complete = METRICS.every(
      (m) =>
        scores[m.id] !== '' &&
        Number(scores[m.id]) >= 0 &&
        Number(scores[m.id]) <= m.max,
    ),
    total = totalScore(
      Object.fromEntries(
        METRICS.map((m) => [m.id, Number(scores[m.id])]),
      ) as Scores,
    );
  return (
    <FinanceModal
      title={manager ? '核定月度绩效' : '填写月度自评'}
      close={guardedClose.requestClose}
      wide
    >
      <UnsavedNotice guard={guardedClose} />
      <form
        className="project-form sales-score-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          save({
            action: manager ? 'publish' : 'self_review',
            id: record?.id,
            version: record?.version,
            month,
            scores: Object.fromEntries(
              METRICS.map((m) => [m.id, Number(scores[m.id])]),
            ),
            note,
            improvement,
          });
        }}
      >
        {error && (
          <p className="error-box" role="alert">
            {error}
          </p>
        )}
        <p className="info-note">
          {month} ·{' '}
          {manager
            ? '已带入自评分，请逐项核实并调整。'
            : '请按实际工作逐项自评，说明依据。'}
          每项得分为 0 至该项权重，最多一位小数。
        </p>
        {reports.map((report) => (
          <details className="sales-report-context" key={report.id}>
            <summary>
              查看 {report.period} 月报依据 · {STATUS_LABELS[report.status]}
            </summary>
            <ReportReadOnly
              report={report.data.report as ReportData | undefined}
            />
            <h4>本月总结</h4>
            <p className="sales-text">{String(report.data.summary || '')}</p>
            <h4>下月计划</h4>
            <p className="sales-text">{String(report.data.nextPlan || '')}</p>
          </details>
        ))}
        <div className="sales-score-list">
          {METRICS.map((m) => (
            <div className="sales-score-item" key={m.id}>
              <div>
                <span className="helper-text">{m.group}</span>
                <strong>{m.title}</strong>
                <details>
                  <summary>评分规则 · {m.max} 分</summary>
                  <p>{m.rule}</p>
                  <small>来源：{m.source}</small>
                </details>
              </div>
              <label className="field">
                {manager ? '上级评分' : '自评'} · {m.title}
                <input
                  type="number"
                  required
                  min={0}
                  max={m.max}
                  step="0.1"
                  value={scores[m.id]}
                  onChange={(e) =>
                    setScores((s) => ({ ...s, [m.id]: e.target.value }))
                  }
                />
              </label>
            </div>
          ))}
        </div>
        <p className="sales-total" role="status">
          {complete ? '合计 ' + total + ' / 100 分' : '请完成所有分项评分'}
          {manager && complete ? ' · ' + performanceBand(total).label : ''}
        </p>
        <label className="field">
          {manager ? '核定依据与反馈' : '自评说明与工作依据'} *
          <textarea
            required
            maxLength={4000}
            rows={3}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="field">
          书面改进计划
          {manager && total >= 70 && total < 80 ? ' *' : '（可补充）'}
          <textarea
            required={manager && total >= 70 && total < 80}
            rows={3}
            maxLength={4000}
            value={improvement}
            onChange={(e) => setImprovement(e.target.value)}
            placeholder="说明需要改善的事项、措施与完成时间"
          />
        </label>
        <p className="helper-text">
          {manager
            ? '发布前须核实本月待审核记录；发布后锁定本月记录，管理可说明原因退回。当前月份结束后才能发布。'
            : '当月可先提交自评，月份结束后由管理发布最终结果。'}
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={guardedClose.requestClose}
          >
            取消
          </button>
          <button className="button primary" disabled={busy || !complete}>
            {busy ? '保存中…' : manager ? '确认并发布结果' : '提交月度自评'}
          </button>
        </div>
      </form>
    </FinanceModal>
  );
}
function RecordDetail({
  record: r,
  manager,
  self,
  busy,
  error,
  inbox,
  close,
  edit,
  action,
}: {
  record: SalesRecord;
  manager: boolean;
  self: boolean;
  busy: boolean;
  error: string;
  inbox: SalesInbox;
  close: () => void;
  edit: () => void;
  action: Action;
}) {
  const [note, setNote] = useState(''),
    [scoring, setScoring] = useState(false),
    data = r.data;
  const monthFrozen =
    r.kind !== 'performance' &&
    inbox.records.some(
      (record) =>
        record.memberId === r.memberId &&
        record.kind === 'performance' &&
        record.status === 'published',
    );
  const pendingReviews = inbox.records.filter(
    (record) =>
      record.memberId === r.memberId &&
      record.kind !== 'performance' &&
      record.status === 'submitted',
  ).length;
  if (scoring)
    return (
      <ScoreEditor
        record={r}
        month={r.period}
        manager
        busy={busy}
        error={error}
        close={() => !busy && setScoring(false)}
        save={action}
        reports={inbox.records.filter((record) => record.kind === 'monthly')}
      />
    );
  const review = (type: string) =>
    action({ action: type, id: r.id, version: r.version, note });
  return (
    <FinanceModal
      title={
        r.kind === 'activity'
          ? '销售工作记录'
          : r.kind === 'weekly'
            ? '销售周报'
            : r.kind === 'monthly'
              ? '销售月报'
              : '月度绩效结果'
      }
      close={close}
      wide={r.kind !== 'activity'}
    >
      <div className="sales-detail">
        <div className="sales-detail-meta">
          <span>
            {r.memberName} · {r.region}
          </span>
          <span className="badge green">{STATUS_LABELS[r.status]}</span>
        </div>
        {error && (
          <p role="alert" className="error-box">
            {error}
          </p>
        )}
        {r.kind === 'performance' ? (
          <>
            <h3>{r.period} 月度考核</h3>
            <div className="table-scroll">
              <table className="sales-score-table">
                <thead>
                  <tr>
                    <th>考核项目</th>
                    <th>权重</th>
                    <th>自评</th>
                    <th>上级</th>
                  </tr>
                </thead>
                <tbody>
                  {METRICS.map((m) => (
                    <tr key={m.id}>
                      <th scope="row">{m.title}</th>
                      <td>{m.max}</td>
                      <td>{(data.selfScores as Scores)[m.id]}</td>
                      <td>
                        {(data.managerScores as Scores | undefined)?.[m.id] ??
                          '待核定'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className="sales-total">
              自评 {totalScore(data.selfScores as Scores)} 分
              {r.status === 'published'
                ? ' · 管理核定 ' + data.total + ' 分'
                : ''}
            </p>
            <h4>自评说明</h4>
            <p className="sales-text">{String(data.selfNote)}</p>
            {data.managerNote && (
              <>
                <h4>管理反馈</h4>
                <p className="sales-text">{String(data.managerNote)}</p>
              </>
            )}
            {data.improvement && (
              <>
                <h4>书面改进计划</h4>
                <p className="sales-text">{String(data.improvement)}</p>
              </>
            )}
            {r.status === 'published' && (
              <p className="info-note">
                {performanceBand(Number(data.total)).label} · 激励表参考{' '}
                {performanceBand(Number(data.total)).referenceBonus}{' '}
                元。实际发放口径需公司确认；本页不生成工资或付款。
                {r.period === '2026-08'
                  ? '本月为制度过渡期，扣分仅记录提醒。'
                  : ''}
              </p>
            )}
            {Array.isArray(data.priorResults) &&
              data.priorResults.length > 0 && (
                <details>
                  <summary>
                    历史核定结果（{data.priorResults.length} 次）
                  </summary>
                  {(data.priorResults as PerformanceData[]).map((p, i) => (
                    <p key={i}>
                      {p.publishedAt ? time(p.publishedAt) : ''} · {p.reviewer}{' '}
                      · {p.total} 分 · {p.managerNote}
                    </p>
                  ))}
                </details>
              )}
          </>
        ) : (
          <>
            <h3>
              {r.kind === 'activity'
                ? String(data.title)
                : r.kind === 'monthly'
                  ? r.period + ' 销售月报'
                  : r.period + ' 至 ' + addDays(r.period, 5) + ' 周报'}
            </h3>
            {(r.kind === 'weekly' || r.kind === 'monthly') && (
              <ReportReadOnly report={data.report as ReportData | undefined} />
            )}
            <dl className="sales-fields">
              {(r.kind === 'activity'
                ? [
                    ['工作类型', data.type],
                    ['发生日期', r.date],
                    ['客户单位', data.customer],
                    ['客户属性', data.customerStage],
                    ['客户类别', data.customerCategory],
                    ['沟通方式', data.contactMethod],
                    ['重点行业', data.focusIndustry],
                    ['联系人及方式', data.contact],
                    ['项目进度', data.progress],
                    ['关联项目', data.projectName],
                    ['工作结果', data.result],
                    ['核实依据', data.evidence],
                  ]
                : [
                    [
                      '截止时间',
                      r.kind === 'weekly'
                        ? r.date + ' 24:00（北京时间）'
                        : '月报暂未设统一截止日',
                    ],
                    [
                      '提交情况',
                      r.kind === 'weekly'
                        ? data.late
                          ? '迟交'
                          : '按时提交'
                        : STATUS_LABELS[r.status],
                    ],
                    ['首次提交', time(String(data.firstSubmittedAt))],
                    ['最近提交', time(String(data.submittedAt))],
                    [
                      r.kind === 'monthly' ? '本月总结' : '本周总结',
                      data.summary,
                    ],
                    [
                      r.kind === 'monthly' ? '下月计划' : '下周计划',
                      data.nextPlan,
                    ],
                    ['风险及协调', data.risks],
                    ['核实依据', data.evidence],
                  ]
              )
                .filter(([, value]) => value)
                .map(([label, value]) => (
                  <div key={String(label)}>
                    <dt>{String(label)}</dt>
                    <dd>{String(value)}</dd>
                  </div>
                ))}
            </dl>
          </>
        )}
        {!!data.reviewNote && (
          <p className="info-note">审核反馈：{String(data.reviewNote)}</p>
        )}
        {monthFrozen && (
          <p className="info-note" role="status">
            本月考核已发布，工作记录、周报和月报已锁定。如需修正，请先由管理在“月度绩效”中退回已发布结果，再补充并重新审核。
          </p>
        )}
        {self &&
          !monthFrozen &&
          !['approved', 'published'].includes(r.status) && (
            <button className="button" disabled={busy} onClick={edit}>
              补充并重新提交
            </button>
          )}
        {manager && !monthFrozen && (
          <div className="sales-review">
            <h4>管理复核</h4>
            <label className="field">
              {r.kind === 'performance'
                ? '退回原因（退回时必填）'
                : '审核意见／退回原因 *'}
              <textarea
                rows={3}
                maxLength={4000}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder={
                  r.kind === 'performance'
                    ? '需要退回时，说明应补充的内容；上级评分在下一步填写'
                    : '填写核实依据；退回时说明需要补充什么'
                }
              />
            </label>
            <div className="form-actions">
              {r.status === 'submitted' &&
                (r.kind === 'performance' ? (
                  <button
                    className="button primary"
                    disabled={
                      busy ||
                      pendingReviews > 0 ||
                      r.period >= inbox.serverDate.slice(0, 7)
                    }
                    onClick={() => setScoring(true)}
                  >
                    填写上级评分并发布
                  </button>
                ) : (
                  <button
                    className="button primary"
                    disabled={busy || !note.trim()}
                    onClick={() => review('review')}
                  >
                    核实通过
                  </button>
                ))}
              {r.status !== 'returned' && (
                <button
                  className="button"
                  disabled={busy || !note.trim()}
                  onClick={() => review('return')}
                >
                  {r.status === 'published'
                    ? '退回并重新开放本月记录'
                    : '退回补充'}
                </button>
              )}
            </div>
            {r.kind === 'performance' &&
              r.status === 'submitted' &&
              pendingReviews > 0 && (
                <p className="helper-text">
                  该成员本月还有 {pendingReviews}{' '}
                  条工作记录、周报或月报待审核，请先核实通过或退回，再核定绩效。
                </p>
              )}
            {r.kind === 'performance' &&
              r.period >= inbox.serverDate.slice(0, 7) && (
                <p className="helper-text">
                  本月尚未结束，可先查看自评和工作记录，结月后发布最终结果。
                </p>
              )}
          </div>
        )}
        <details className="task-history">
          <summary>提交与审核记录（{r.history.length}）</summary>
          {r.history.map((h, i) => (
            <div key={i}>
              <strong>{h.actor}</strong>
              <p>{h.note}</p>
              <small>{time(h.at)}</small>
            </div>
          ))}
        </details>
      </div>
    </FinanceModal>
  );
}
function Policy({ inbox }: { inbox: SalesInbox }) {
  return (
    <div className="sales-policy">
      <section className="panel sales-policy-section">
        <h2>制度口径与考核流程</h2>
        <ol>
          {inbox.policyNotes.map((n) => (
            <li key={n}>{n}</li>
          ))}
        </ol>
        <p className="helper-text">
          依据《新版销售绩效考核制度发布说明》《业务员月度绩效考核表》及八份配套材料，制度自
          2026 年 8 月 1 日执行。
        </p>
      </section>
      <section className="panel sales-policy-section">
        <h2>13 项评分标准</h2>
        {inbox.rules.map((m) => (
          <details key={m.id}>
            <summary>
              {m.title} · {m.max} 分
            </summary>
            <p>{m.rule}</p>
            <small>来源：{m.source}</small>
          </details>
        ))}
      </section>
      {inbox.guidance.map((g) => (
        <section className="panel sales-policy-section" key={g.title}>
          <h2>{g.title}</h2>
          <p>{g.body}</p>
          <small>来源：{g.source}</small>
        </section>
      ))}
    </div>
  );
}
