'use client';
import {
  AlertTriangle,
  ArrowRight,
  Bell,
  BriefcaseBusiness,
  CalendarDays,
  CheckCheck,
  ClipboardCheck,
  Clock3,
  FileCheck2,
  LayoutDashboard,
  Wallet,
} from 'lucide-react';
import { Member, ROLES, Desk, deskOf, isManager } from './team';
import { Project, Config, today, shiftDate, isActive, risk } from './model';
import { FinanceBook, totals, money, emptyBook } from './finance-model';
import { DeskTask, taskOverdue } from './task-model';
import { filingAlerts, workflowOf } from './workflow';
import { Linkage } from './dashboard-model';
type Props = {
  member: Member;
  projects: Project[];
  tasks: DeskTask[];
  books: Record<string, FinanceBook>;
  config: Config;
  linkages: Linkage[];
  onOpen: (p: Project) => void;
  onFollowup: (p: Project) => void;
  onTask: (t: DeskTask) => void;
  onTasks: (desk?: Desk) => void;
  onTab: (tab: string) => void;
  onFinance: (p: Project) => void;
  onProjectFilter: (filter: string) => void;
};
const Badge = ({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: string;
}) => <span className={'badge ' + tone}>{children}</span>;
const labels: Record<
  Desk,
  { eyebrow: string; headline: string; description: string }
> = {
  sales: {
    eyebrow: 'SALES DESK',
    headline: '把每个机会推进一步',
    description: '先处理今天的拜访、逾期项目和需要补充的合同资料。',
  },
  finance: {
    eyebrow: 'FINANCE DESK',
    headline: '清楚掌握每笔票款',
    description: '优先核验销售提交的合同、到期应收和待开票申请。',
  },
  operations: {
    eyebrow: 'OPERATIONS DESK',
    headline: '把交接事项落实到位',
    description: '技术与市场支持、厂家报备、采购物流，统一在运营台落实。',
  },
  aftersales: {
    eyebrow: 'AFTER-SALES DESK',
    headline: '及时响应，妥善解决',
    description: '跟进售后问题、验收回访和遗留事项，处理结果同步管理。',
  },
  management: {
    eyebrow: 'MANAGEMENT DESK',
    headline: '掌握全局，推动执行',
    description: '统筹五个台的任务期限、处理进展、项目风险与结果验收。',
  },
};
export default function RoleDashboard(p: Props) {
  const {
    member,
    projects,
    tasks,
    books,
    config,
    linkages,
    onOpen,
    onFollowup,
    onTask,
    onTasks,
    onTab,
    onFinance,
    onProjectFilter,
  } = p;
  const desk = deskOf(member.role),
    manager = isManager(member),
    label = labels[desk],
    active = projects.filter(isActive),
    pending = tasks.filter((t) => !['已完成', '已取消'].includes(t.status)),
    late = pending.filter(taskOverdue),
    due = pending.filter((t) => t.dueDate === today()),
    soon = pending.filter(
      (t) => t.dueDate > today() && t.dueDate <= shiftDate(3),
    ),
    review = pending.filter((t) => t.status === '待验收'),
    salesLate = active.filter((p) => p.nextDate && p.nextDate < today()),
    salesToday = active.filter((p) => p.nextDate === today()),
    filings = filingAlerts(projects),
    ledger = projects.map((p) => ({
      project: p,
      book: books[p.id] || emptyBook(p.id),
    })),
    contracts = ledger.filter((x) => x.book.reviewStatus === '待审核'),
    returned = ledger.filter((x) => x.book.reviewStatus === '退回修改'),
    invoices = ledger.reduce(
      (n, x) => n + x.book.invoices.filter((i) => i.status === '待开票').length,
      0,
    ),
    overdueMoney = ledger.reduce((n, x) => n + totals(x.book).overdue, 0);
  const metrics =
    desk === 'sales'
      ? [
          {
            label: '今日客户跟进',
            value: salesToday.length,
            unit: '个',
            hint: '按项目下一步计划安排',
            action: () => onProjectFilter('今日待办'),
          },
          {
            label: '跟进已逾期',
            value: salesLate.length,
            unit: '个',
            hint: '需要尽快更新跟进结果',
            alert: !!salesLate.length,
            action: () => onProjectFilter('跟进逾期'),
          },
          {
            label: '相关未完成任务',
            value: pending.length,
            unit: '项',
            hint: `${due.length} 项今天到期`,
            action: () => onTasks(),
          },
          {
            label: '合同需我补充',
            value: returned.length,
            unit: '份',
            hint: '财务退回的资料与修改意见',
            alert: !!returned.length,
            action: () => onTab('finance'),
          },
        ]
      : desk === 'finance'
        ? [
            {
              label: '待审核合同',
              value: contracts.length,
              unit: '份',
              hint: '销售提交后进入财务队列',
              action: () => onTab('finance'),
            },
            {
              label: '逾期应收金额',
              value: '¥ ' + money(overdueMoney),
              unit: '',
              hint: '已审核合同的到期未收余额',
              alert: !!overdueMoney,
              action: () => onTab('finance'),
            },
            {
              label: '待开票申请',
              value: invoices,
              unit: '项',
              hint: '处理结果同步销售项目',
              action: () => onTab('finance'),
            },
            {
              label: '本台未完成任务',
              value: pending.length,
              unit: '项',
              hint: `${late.length} 项已逾期`,
              alert: !!late.length,
              action: () => onTasks(),
            },
          ]
        : desk === 'operations'
          ? [
              {
                label: '本台待落实',
                value: pending.length,
                unit: '项',
                hint: '方案、报备与履约支持',
                action: () => onTasks(),
              },
              {
                label: '厂家报备关注',
                value: filings.length,
                unit: '项',
                hint: '首次报备、反馈判定与月更新',
                alert: !!filings.length,
                action: () => onTab('filings'),
              },
              {
                label: '今天到期',
                value: due.length,
                unit: '项',
                hint: `未来 3 天另有 ${soon.length} 项`,
                action: () => onTasks(),
              },
              {
                label: '任务已逾期',
                value: late.length,
                unit: '项',
                hint: '优先反馈阻碍与处理计划',
                alert: !!late.length,
                action: () => onTasks(),
              },
            ]
          : desk === 'aftersales'
            ? [
                {
                  label: '待响应与处理中',
                  value: pending.filter((t) => t.status !== '待验收').length,
                  unit: '项',
                  hint: '客户问题、验收及回访',
                  action: () => onTasks(),
                },
                {
                  label: '今天需要完成',
                  value: due.length,
                  unit: '项',
                  hint: '处理后填写客户确认结果',
                  action: () => onTasks(),
                },
                {
                  label: '逾期未闭环',
                  value: late.length,
                  unit: '项',
                  hint: '需补充处理进度与原因',
                  alert: !!late.length,
                  action: () => onTasks(),
                },
                {
                  label: '已反馈待验收',
                  value: review.length,
                  unit: '项',
                  hint: '等待管理确认处理结果',
                  action: () => onTasks(),
                },
              ]
            : [
                {
                  label: '各台未完成任务',
                  value: pending.length,
                  unit: '项',
                  hint: '按授权分部汇总',
                  action: () => onTasks(),
                },
                {
                  label: '逾期待督办',
                  value: late.length,
                  unit: '项',
                  hint: '确认阻碍与新的处理安排',
                  alert: !!late.length,
                  action: () => onTasks(),
                },
                {
                  label: '结果待验收',
                  value: review.length,
                  unit: '项',
                  hint: '查看结果并通过或退回',
                  action: () => onTasks(),
                },
                {
                  label: '项目跟进风险',
                  value: active.filter(
                    (p) => risk(p, config.staleDays).level >= 2,
                  ).length,
                  unit: '个',
                  hint: '漏跟、无计划与长期未更新',
                  alert: !!salesLate.length,
                  action: () => onProjectFilter('跟进逾期'),
                },
              ];
  const reminders: {
    title: string;
    detail: string;
    action: () => void;
    tone: string;
  }[] = [];
  for (const t of late.slice(0, 3))
    reminders.push({
      title: '任务逾期：' + t.title,
      detail: `${t.dueDate} 截止 · ${t.assigneeName || '本台待认领'}`,
      action: () => onTask(t),
      tone: 'red',
    });
  if (desk === 'sales')
    for (const x of returned.slice(0, 2))
      reminders.push({
        title: '财务退回合同：' + x.project.name,
        detail: x.book.reviewNote || '请按审核意见补充合同资料',
        action: () => onFinance(x.project),
        tone: 'amber',
      });
  if (desk === 'finance')
    for (const x of contracts.slice(0, 3))
      reminders.push({
        title: '销售提交合同：' + x.project.name,
        detail: '核验合同条款与收款计划',
        action: () => onFinance(x.project),
        tone: 'blue',
      });
  if (desk === 'operations' && filings.length)
    reminders.push({
      title: `${filings.length} 项厂家报备需要关注`,
      detail: '查看首次报备、判定反馈及每月更新提醒',
      action: () => onTab('filings'),
      tone: 'amber',
    });
  if (manager && review.length)
    reminders.push({
      title: `${review.length} 项处理结果等待你验收`,
      detail: '确认完成情况，不完整的结果可退回补充',
      action: () => onTasks(),
      tone: 'blue',
    });
  for (const t of due.slice(0, 2))
    reminders.push({
      title: '今天到期：' + t.title,
      detail: '完成后提交管理验收',
      action: () => onTask(t),
      tone: 'amber',
    });
  if (desk === 'sales')
    for (const x of salesLate.slice(0, 2))
      reminders.push({
        title: '客户跟进逾期：' + x.name,
        detail: x.nextAction || '请补充下一步行动和跟进日期',
        action: () => onOpen(x),
        tone: 'amber',
      });
  if (!manager)
    for (const t of review.slice(0, 2))
      reminders.push({
        title: '等待管理反馈：' + t.title,
        detail: '处理结果已提交，管理验收后会更新状态',
        action: () => onTask(t),
        tone: 'blue',
      });
  for (const t of soon.slice(0, 2))
    reminders.push({
      title: '即将到期：' + t.title,
      detail: t.dueDate + ' 截止 · ' + (t.assigneeName || '本台待认领'),
      action: () => onTask(t),
      tone: 'blue',
    });
  const sorted = pending
    .slice()
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  return (
    <div className="role-dashboard">
      <section className="dashboard-hero">
        <div>
          <span>{label.eyebrow}</span>
          <h2>
            {member.name}，{label.headline}
          </h2>
          <p>{label.description}</p>
        </div>
        <div className="dashboard-date">
          <CalendarDays size={18} />
          <strong>{today().slice(5).replace('-', ' / ')}</strong>
          <small>今日工作安排</small>
        </div>
      </section>
      <div className="dashboard-metrics">
        {metrics.map((m, i) => (
          <button
            key={m.label}
            onClick={m.action}
            className={m.alert ? 'attention' : ''}
          >
            <span>
              {m.label}
              {i === 0 ? (
                <ClipboardCheck size={17} />
              ) : i === 1 ? (
                <Clock3 size={17} />
              ) : i === 2 ? (
                <FileCheck2 size={17} />
              ) : (
                <Bell size={17} />
              )}
            </span>
            <strong>
              {m.value}
              <small>{m.unit}</small>
            </strong>
            <p>{m.hint}</p>
          </button>
        ))}
      </div>
      {manager && (
        <section className="dashboard-desk-load">
          {ROLES.map((r) => {
            const ts = pending.filter((t) => t.desk === r.id);
            return (
              <button key={r.id} onClick={() => onTasks(r.id as Desk)}>
                <span className={'desk-dot desk-' + r.id} />
                <strong>{r.name}台</strong>
                <b>
                  {ts.length}
                  <small>待办</small>
                </b>
                <span>
                  {ts.filter(taskOverdue).length} 逾期 ·{' '}
                  {ts.filter((t) => t.status === '待验收').length} 待验收
                </span>
              </button>
            );
          })}
        </section>
      )}
      <div className="dashboard-grid">
        <section className="panel dashboard-work">
          <div className="section-heading">
            <div>
              <h2>
                {desk === 'sales'
                  ? '今天先跟进这些客户'
                  : desk === 'finance'
                    ? '优先核验与处理'
                    : manager
                      ? '优先督办的任务'
                      : '本台优先任务'}
              </h2>
              <p>
                {desk === 'sales'
                  ? '今日及逾期项目与下一步行动'
                  : desk === 'finance'
                    ? '销售交来的合同与本台任务'
                    : '按截止时间排列，点击查看要求与反馈。'}
              </p>
            </div>
            <button className="text-button" onClick={() => onTasks()}>
              全部任务
              <ArrowRight size={14} />
            </button>
          </div>
          {desk === 'sales' &&
            salesLate
              .concat(salesToday)
              .slice(0, 4)
              .map((x) => (
                <div className="dashboard-followup" key={x.id}>
                  <span
                    className={
                      'dashboard-symbol ' + (x.nextDate < today() ? 'red' : '')
                    }
                  >
                    <BriefcaseBusiness size={18} />
                  </span>
                  <div>
                    <button className="project-link" onClick={() => onOpen(x)}>
                      {x.name}
                    </button>
                    <p>{x.nextAction}</p>
                    <small>
                      {x.stage} · {x.nextDate}
                    </small>
                  </div>
                  <button
                    className="button small-button"
                    onClick={() => onFollowup(x)}
                  >
                    记录跟进
                  </button>
                </div>
              ))}
          {desk === 'finance' &&
            contracts.slice(0, 3).map((x) => (
              <button
                key={x.project.id}
                className="dashboard-task-line"
                onClick={() => onFinance(x.project)}
              >
                <span className="dashboard-symbol">
                  <Wallet size={18} />
                </span>
                <span>
                  <strong>{x.project.name}</strong>
                  <small>销售已提交合同 · 等待财务审核</small>
                </span>
                <Badge tone="blue">待核合同</Badge>
                <ArrowRight size={14} />
              </button>
            ))}
          {sorted.slice(0, desk === 'sales' ? 3 : 5).map((t) => (
            <button
              key={t.id}
              className="dashboard-task-line"
              onClick={() => onTask(t)}
            >
              <span
                className={'dashboard-symbol ' + (taskOverdue(t) ? 'red' : '')}
              >
                <ClipboardCheck size={18} />
              </span>
              <span>
                <strong>{t.title}</strong>
                <small>
                  {t.projectName || '日常任务'} ·{' '}
                  {t.assigneeName || '本台待认领'} · {t.dueDate} 截止
                </small>
              </span>
              <Badge
                tone={
                  taskOverdue(t)
                    ? 'red'
                    : t.status === '待验收'
                      ? 'blue'
                      : 'gray'
                }
              >
                {taskOverdue(t) ? '已逾期' : t.status}
              </Badge>
              <ArrowRight size={14} />
            </button>
          ))}
          {!sorted.length &&
            !(desk === 'sales' && (salesLate.length || salesToday.length)) &&
            !(desk === 'finance' && contracts.length) && (
              <div className="dashboard-empty">
                <CheckCheck size={25} />
                <strong>目前没有需要立即处理的事项</strong>
                <p>新任务和交接会在本台自动更新。</p>
              </div>
            )}
        </section>
        <section className="panel dashboard-reminders">
          <div className="section-heading">
            <div>
              <h2>提醒与待反馈</h2>
              <p>关注期限、交接和处理结果。</p>
            </div>
            <Bell size={18} />
          </div>
          {reminders.slice(0, 5).map((r, i) => (
            <button key={i} onClick={r.action}>
              <span className={'reminder-dot ' + r.tone} />
              <span>
                <strong>{r.title}</strong>
                <small>{r.detail}</small>
              </span>
              <ArrowRight size={13} />
            </button>
          ))}
          {!reminders.length && (
            <div className="dashboard-empty">
              <Bell size={24} />
              <strong>暂无紧急提醒</strong>
              <p>今天到期、逾期及需处理的业务反馈会显示在这里。</p>
            </div>
          )}
        </section>
      </div>
      <section className="panel dashboard-linkages">
        <div className="section-heading">
          <div>
            <h2>与其他台的协作进度</h2>
            <p>按关联项目查看交接状态；部分工作可同时推进。</p>
          </div>
          <button className="text-button" onClick={() => onTab('projects')}>
            查看项目
            <ArrowRight size={14} />
          </button>
        </div>
        {linkages.slice(0, 3).map((link) => (
          <article className="linkage-project" key={link.projectId}>
            <button
              className="linkage-project-title"
              onClick={() => {
                const x = projects.find((p) => p.id === link.projectId);
                if (x) onOpen(x);
              }}
            >
              <span>
                <strong>{link.projectName}</strong>
                <small>
                  销售主跟：{link.owner} · 当前阶段：{link.stage}
                </small>
              </span>
              <ArrowRight size={16} />
            </button>
            <div className="linkage-steps">
              {link.steps.map((s, i) => (
                <div key={s.desk} className={s.desk === desk ? 'current' : ''}>
                  <span>
                    <i>{i + 1}</i>
                    {s.label}
                    {s.desk === desk && <em>本台</em>}
                  </span>
                  <Badge tone={s.tone}>{s.state}</Badge>
                </div>
              ))}
            </div>
          </article>
        ))}
        {!linkages.length && (
          <div className="dashboard-empty">
            <LayoutDashboard size={25} />
            <strong>关联项目后，协作进度会出现在这里</strong>
            <p>
              销售或管理派发项目任务后，承办台可查看项目背景与相关岗位的交接状态。
            </p>
          </div>
        )}
      </section>
    </div>
  );
}
