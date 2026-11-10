'use client';
import { StageEvidence } from './stage-evidence';
import { departmentDesk } from './workflow';
import { hasDesk } from './access';
import React, { useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  Check,
  Clock3,
  CalendarDays,
  ChevronRight,
  FileCheck2,
  GitBranch,
  Plus,
  Users,
  Building2,
  BookOpen,
  TriangleAlert,
  BriefcaseBusiness,
  Target,
  ClipboardList,
  MessageSquare,
  Search,
} from 'lucide-react';
import {
  Member,
  isManager,
  canEditProject,
  canCheckDepartment,
  canEditFact,
  canViewFact,
  canEditMilestone,
  roleInfo,
  matchesDepartment,
} from './team';
import {
  Project,
  Config,
  Event,
  today,
  shiftDate,
  isActive,
  risk,
} from './model';
import {
  DEPARTMENTS,
  GUIDES,
  MILESTONES,
  Workflow,
  Collaboration,
  DepartmentId,
  workflowOf,
  guideFor,
  departmentName,
  filingAlerts,
  nextMonthlyDate,
  taskTone,
} from './workflow';
const money = (n: number) =>
  new Intl.NumberFormat('zh-CN', { maximumFractionDigits: 1 }).format(n);
const short = (d: string) => (d ? d.slice(5).replace('-', '/') : '待补录');
const Badge = ({
  children,
  tone = 'gray',
}: {
  children: React.ReactNode;
  tone?: string;
}) => <span className={'badge ' + tone}>{children}</span>;
const Heading = ({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: React.ReactNode;
}) => (
  <div className="section-heading">
    <div>
      <h2>{title}</h2>
      {description && <p>{description}</p>}
    </div>
    {action}
  </div>
);
export function WorkflowOverview({
  projects,
  config,
  onOpen,
  onFollowup,
  onDepartment,
  onFilings,
  onProjects,
}: {
  projects: Project[];
  config: Config;
  onOpen: (p: Project) => void;
  onFollowup: (p: Project) => void;
  onDepartment: (d: string) => void;
  onFilings: () => void;
  onProjects: (stage?: string) => void;
}) {
  const active = projects.filter(isActive),
    tasks = active.flatMap((p) =>
      workflowOf(p).tasks.map((task) => ({ project: p, task })),
    ),
    pending = tasks.filter((x) => x.task.status !== '已完成'),
    alerts = filingAlerts(projects),
    risks = active
      .filter((p) => risk(p, config.staleDays).level >= 2)
      .sort(
        (a, b) =>
          risk(b, config.staleDays).level - risk(a, config.staleDays).level,
      );
  const dueDates = active
    .flatMap((p) =>
      MILESTONES.map((m) => ({
        project: p,
        milestone: m,
        date: workflowOf(p).milestones[m.id],
      })).filter((x) => x.date && x.date <= shiftDate(7)),
    )
    .sort((a, b) => a.date.localeCompare(b.date));
  return (
    <>
      <div className="workflow-stats">
        <button onClick={() => onProjects()}>
          <span>
            在跟项目 <BriefcaseBusiness size={18} />
          </span>
          <strong>
            {active.length}
            <small>个</small>
          </strong>
          <p>预计机会 ¥ {money(active.reduce((s, p) => s + p.amount, 0))} 万</p>
        </button>
        <button className="alert-stat" onClick={() => onDepartment('全部部门')}>
          <span>
            待闭环协作 <GitBranch size={18} />
          </span>
          <strong>
            {pending.length}
            <small>项</small>
          </strong>
          <p>
            {pending.filter((x) => x.task.dueDate < today()).length} 项逾期 ·{' '}
            {pending.filter((x) => x.task.status === '待反馈').length} 项待反馈
          </p>
        </button>
        <button onClick={onFilings}>
          <span>
            厂家报备关注 <FileCheck2 size={18} />
          </span>
          <strong>
            {alerts.length}
            <small>项</small>
          </strong>
          <p>首次报备、判定反馈与每月更新</p>
        </button>
        <button onClick={() => onProjects()}>
          <span>
            项目跟进风险 <TriangleAlert size={18} />
          </span>
          <strong>
            {risks.length}
            <small>个</small>
          </strong>
          <p>逾期、无计划或长期未更新</p>
        </button>
      </div>
      <section className="panel phase-overview">
        <Heading
          title="一条项目主线，多部门协同"
          description="销售主跟客户与机会；各部门围绕当前阶段落实支持并反馈。"
        />
        <div className="phase-overview-track">
          {GUIDES.map((g, i) => (
            <button key={g.stage} onClick={() => onProjects(g.stage)}>
              <span className="phase-number">
                {String(i + 1).padStart(2, '0')}
              </span>
              <strong>{g.stage}</strong>
              <small>{departmentName(g.lead)}主跟</small>
              <b>
                {active.filter((p) => p.stage === g.stage).length}
                <i>个项目</i>
              </b>
            </button>
          ))}
        </div>
      </section>
      <div className="management-grid">
        <section className="panel">
          <Heading
            title="需要推进的项目"
            description="优先处理漏跟和长期停滞，明确下一步动作。"
            action={
              <button className="text-button" onClick={() => onProjects()}>
                项目协同
                <ArrowRight size={14} />
              </button>
            }
          />
          {risks.length ? (
            risks.slice(0, 3).map((p) => (
              <div className="focus-project" key={p.id}>
                <div className="focus-project-icon">
                  <Clock3 size={19} />
                </div>
                <div>
                  <button className="project-link" onClick={() => onOpen(p)}>
                    {p.name}
                  </button>
                  <p>{p.nextAction || '请补充下一步行动'}</p>
                  <small>
                    {workflowOf(p).region} · {p.owner} · {p.stage}
                  </small>
                </div>
                <div>
                  <Badge tone={risk(p, config.staleDays).tone}>
                    {risk(p, config.staleDays).text}
                  </Badge>
                  <button className="text-button" onClick={() => onFollowup(p)}>
                    记录跟进
                    <ArrowUpRight size={13} />
                  </button>
                </div>
              </div>
            ))
          ) : (
            <div className="small-empty">当前没有需要优先处理的项目。</div>
          )}
        </section>
        <section className="panel">
          <Heading
            title="部门协作负载"
            description="按承办部门查看未完成事项。"
            action={<Users size={17} className="muted" />}
          />
          <div className="department-load">
            {DEPARTMENTS.filter(
              (d) => d.group === '执行协同' || d.id === 'finance',
            ).map((d) => {
              const n = pending.filter(
                (x) => departmentName(x.task.department) === d.name,
              ).length;
              return (
                <button key={d.id} onClick={() => onDepartment(d.id)}>
                  <span className={'dept-symbol dept-' + d.id}>
                    {d.short.slice(0, 1)}
                  </span>
                  <span>
                    <strong>{d.name}</strong>
                    <small>{d.purpose}</small>
                  </span>
                  <b>{n}</b>
                  <ChevronRight size={14} />
                </button>
              );
            })}
          </div>
        </section>
      </div>
      <div className="management-grid bottom-management">
        <section className="panel">
          <Heading
            title="跨部门交接与反馈"
            description="事项有承办人、有期限、有处理结果。"
            action={
              <button
                className="text-button"
                onClick={() => onDepartment('全部部门')}
              >
                全部协作
                <ArrowRight size={14} />
              </button>
            }
          />
          {pending.length ? (
            pending.slice(0, 4).map(({ project: p, task: t }) => (
              <button
                className="handoff-line"
                key={t.id}
                onClick={() => onOpen(p)}
              >
                <span className={'handoff-indicator ' + taskTone(t)} />
                <span>
                  <strong>{t.title}</strong>
                  <small>
                    {p.name} · {departmentName(t.department)} /{' '}
                    {t.assignee || '待落实对接人'}
                  </small>
                </span>
                <Badge tone={taskTone(t)}>
                  {t.dueDate < today() ? '已逾期' : t.status}
                </Badge>
              </button>
            ))
          ) : (
            <div className="small-empty">
              销售或管理可直接下发任务，无需先创建项目。
            </div>
          )}
        </section>
        <section className="panel">
          <Heading
            title="关键节点"
            description="未来 7 天及尚待处理的历史节点"
            action={<CalendarDays size={17} className="muted" />}
          />
          {dueDates.length ? (
            dueDates.slice(0, 4).map((x) => (
              <button
                className="milestone-line"
                key={x.project.id + x.milestone.id}
                onClick={() => onOpen(x.project)}
              >
                <b className={x.date < today() ? 'text-red' : ''}>
                  {short(x.date)}
                </b>
                <span>
                  <strong>{x.milestone.label}</strong>
                  <small>{x.project.name}</small>
                </span>
                <span className="milestone-dept">
                  {departmentName(x.milestone.department)}
                </span>
              </button>
            ))
          ) : (
            <div className="small-empty">
              在项目推进中登记出图、招标、采购、发货和回款时间。
            </div>
          )}
        </section>
      </div>
      <div className="workflow-note">
        <BookOpen size={15} />
        沟通有结果，交接有反馈，项目有复盘。
        <span>报备每月至少更新一次 · 按培训资料整理</span>
      </div>
    </>
  );
}
export function StageWorkspace({
  project,
  config,
  onSave,
  onTask,
  busy,
  member,
  members,
}: {
  member: Member;
  members: Member[];
  project: Project;
  config: Config;
  onSave: (
    w: Workflow,
    message: string,
    expectedVersion?: number,
  ) => Promise<boolean>;
  onTask: (t?: Collaboration) => void;
  busy: boolean;
}) {
  const [view, setView] = useState(
      GUIDES.some((g) => g.stage === project.stage)
        ? project.stage
        : '售后复盘',
    ),
    [editing, setEditing] = useState(false),
    [draft, setDraft] = useState(workflowOf(project)),
    [editVersion, setEditVersion] = useState(project.version);
  const w = workflowOf(project),
    guide = guideFor(view),
    current = guideFor(project.stage);
  const checks = guide.checks.filter((c) => w.checklist[c.id]).length,
    visibleFields = guide.fields.filter((f) => canViewFact(member, f.id));
  return (
    <div className="stage-workspace">
      <div className="project-phase-strip">
        {GUIDES.map((g, i) => (
          <button
            key={g.stage}
            className={
              (g.stage === view ? 'selected ' : '') +
              (g.stage === project.stage ? 'current' : '')
            }
            onClick={() => setView(g.stage)}
          >
            <span>{i + 1}</span>
            <strong>{g.stage}</strong>
            {g.stage === project.stage && <small>当前</small>}
          </button>
        ))}
      </div>
      <div className="stage-workspace-grid">
        <div>
          <section className="stage-guide-card">
            <div className="guide-head">
              <span className="guide-icon">
                <Target size={21} />
              </span>
              <div>
                <small>
                  {!isActive(project)
                    ? '项目结果与复盘'
                    : view === project.stage
                      ? '当前阶段工作台'
                      : '阶段工作参考'}
                </small>
                <h3>{guide.title}</h3>
              </div>
              <Badge tone="green">主责：{departmentName(guide.lead)}</Badge>
            </div>
            <p className="stage-goal">{guide.goal}</p>
            <div className="support-tags">
              <span>协作部门</span>
              {Array.from(new Set(guide.support.map(departmentDesk))).map((d) => (
                <Badge key={d}>{departmentName(d)}</Badge>
              ))}
            </div>
            <div className="checklist-title">
              <h4>阶段检查项</h4>
              <span>
                {checks} / {guide.checks.length} 已核对
              </span>
            </div>
            <div className="stage-checklist">
              {guide.checks.map(c => <StageEvidence key={project.id+c.id} project={project} member={member} check={c} stage={view} onSave={onSave} busy={busy}/>)}
            </div>
            <StageEvidence key={project.id+view} project={project} member={member} stage={view} onSave={onSave} busy={busy}/>
            <div className="handoff-summary">
              <GitBranch size={17} />
              <span>
                <strong>交接要求</strong>
                {guide.handoff}
              </span>
            </div>
            <div className="guide-tips">
              {guide.tips.map((t) => (
                <p key={t}>{t}</p>
              ))}
              <small>参考：{guide.source}</small>
            </div>
          </section>
          <section className="panel stage-facts">
            <Heading
              title="本阶段要掌握的信息"
              description="把培训要求转成项目记录，便于交接与复盘。"
              action={
                !editing &&
                visibleFields.some((f) => canEditFact(member, f.id)) ? (
                  <button
                    className="text-button"
                    onClick={() => {
                      setDraft(structuredClone(w));
                      setEditVersion(project.version);
                      setEditing(true);
                    }}
                  >
                    编辑记录
                    <ArrowUpRight size={13} />
                  </button>
                ) : undefined
              }
            />
            {editing ? (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  if (
                    await onSave(
                      {
                        ...w,
                        facts: draft.facts,
                        milestones: draft.milestones,
                      },
                      '更新阶段信息与关键时间节点',
                      editVersion,
                    )
                  )
                    setEditing(false);
                }}
              >
                <div className="stage-facts-form">
                  {visibleFields.map((f) => (
                    <label className="field" key={f.id}>
                      {f.label}
                      <textarea
                        disabled={!canEditFact(member, f.id)}
                        rows={3}
                        maxLength={4000}
                        value={draft.facts[f.id] || ''}
                        placeholder={f.placeholder}
                        onChange={(e) =>
                          setDraft({
                            ...draft,
                            facts: { ...draft.facts, [f.id]: e.target.value },
                          })
                        }
                      />
                    </label>
                  ))}
                  <div className="form-grid">
                    {MILESTONES.map((m) => (
                      <label className="field" key={m.id}>
                        {m.label}
                        <input
                          disabled={!canEditMilestone(member, m.department)}
                          type="date"
                          value={draft.milestones[m.id] || ''}
                          onChange={(e) =>
                            setDraft({
                              ...draft,
                              milestones: {
                                ...draft.milestones,
                                [m.id]: e.target.value,
                              },
                            })
                          }
                        />
                      </label>
                    ))}
                  </div>
                  <div className="inline-actions">
                    <button
                      type="button"
                      className="button"
                      onClick={() => setEditing(false)}
                    >
                      取消
                    </button>
                    <button className="button primary" disabled={busy}>
                      保存阶段信息
                    </button>
                  </div>
                </div>
              </form>
            ) : (
              <dl className="stage-facts-list">
                {visibleFields.map((f) => (
                  <div key={f.id}>
                    <dt>{f.label}</dt>
                    <dd>{w.facts[f.id] || '待补充 · ' + f.placeholder}</dd>
                  </div>
                ))}
              </dl>
            )}
          </section>
        </div>
        <div className="stage-side">
          <section className="panel project-roles">
            <Heading
              title="项目分工"
              description={w.region + ' · 销售持续主跟'}
              action={<Users size={16} />}
            />
            <div className="role-line">
              <span className="dept-symbol dept-sales">销</span>
              <span>
                <small>项目主跟</small>
                <strong>{project.owner}</strong>
              </span>
              <Badge>销售部</Badge>
            </div>
            {DEPARTMENTS.filter((d) =>
              ['operations', 'aftersales', 'finance', 'general'].includes(d.id),
            ).map((d) => (
              <div className="role-assignment" key={d.id}>
                <span>{d.name}</span>
                <strong>{w.assignments[d.id] || '待落实对接人'}</strong>
              </div>
            ))}
            {canEditProject(project, member) && (
              <details className="assignment-editor">
                <summary>调整项目分工</summary>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    const data = new FormData(e.currentTarget);
                    const assignments = { ...w.assignments },
                      assignmentMembers = { ...w.assignmentMembers };
                    for (const d of DEPARTMENTS)
                      if (
                        d.id !== 'sales' &&
                        d.id !== 'hr' &&
                        d.id !== 'general'
                      ) {
                        const id = String(data.get(d.id) || '');
                        assignmentMembers[d.id] = id;
                        assignments[d.id] =
                          members.find((m) => m.id === id)?.name || '';
                      }
                    await onSave(
                      {
                        ...w,
                        region: isManager(member)
                          ? String(data.get('region'))
                          : w.region,
                        assignments,
                        assignmentMembers,
                      },
                      '更新项目所属分部与部门对接人',
                    );
                  }}
                >
                  <label className="field">
                    所属分部
                    <select
                      disabled={!isManager(member)}
                      name="region"
                      defaultValue={w.region}
                    >
                      {['待分配', '广州总部', '湖南分部'].map((s) => (
                        <option key={s}>{s}</option>
                      ))}
                    </select>
                  </label>
                  {DEPARTMENTS.filter(
                    (d) =>
                      d.id !== 'sales' && d.id !== 'hr' && d.id !== 'general',
                  ).map((d) => (
                    <label className="field" key={d.id}>
                      {d.name}对接人
                      <select
                        name={d.id}
                        defaultValue={w.assignmentMembers?.[d.id] || ''}
                      >
                        <option value="">
                          {w.assignments[d.id]
                            ? w.assignments[d.id] + '（待绑定账号）'
                            : '暂不分配'}
                        </option>
                        {members
                          .filter(
                            (m) =>
                              m.status === 'active' &&
                              hasDesk(m, departmentDesk(d.id)),
                          )
                          .map((m) => (
                            <option value={m.id} key={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    </label>
                  ))}
                  <button className="button primary" disabled={busy}>
                    保存项目分工
                  </button>
                </form>
              </details>
            )}
          </section>
          <section className="panel milestone-card">
            <Heading
              title="项目时间节点"
              description="工程时间与销售阶段分别记录"
            />
            {MILESTONES.map((m) => (
              <div key={m.id}>
                <span>{m.label}</span>
                <b
                  className={
                    w.milestones[m.id] && w.milestones[m.id] < today()
                      ? 'text-red'
                      : ''
                  }
                >
                  {w.milestones[m.id] || '待补录'}
                </b>
              </div>
            ))}
          </section>
          <section className="panel handoff-card">
            <Heading
              title="历史项目协作"
              description="新任务可从首页“下发任务”安排"
              action={undefined}
            />
            {w.tasks.length ? (
              w.tasks.map((t) => (
                <button
                  className="project-task"
                  key={t.id}
                  onClick={() => onTask(t)}
                >
                  <strong>{t.title}</strong>
                  <span>
                    {departmentName(t.department)} ·{' '}
                    {t.assignee || '待落实对接人'}
                  </span>
                  <div>
                    <small>{t.dueDate}</small>
                    <Badge tone={taskTone(t)}>{t.status}</Badge>
                  </div>
                </button>
              ))
            ) : (
              <div className="small-empty">
                暂无本台历史协作记录。新任务在本台首页查看。
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
export function CollaborationEditor({
  project,
  task,
  onSubmit,
  onCancel,
  busy,
  error,
  member,
  members,
}: {
  member: Member;
  members: Member[];
  project: Project;
  task?: Collaboration;
  onSubmit: (task: Collaboration) => void;
  onCancel: () => void;
  busy: boolean;
  error: string;
}) {
  const [draft, setDraft] = useState<Collaboration>(
    task || {
      id: crypto.randomUUID(),
      title: '',
      department: guideFor(project.stage).support[0] || 'project',
      assignee:
        workflowOf(project).assignments[
          guideFor(project.stage).support[0] || 'project'
        ] || '',
      dueDate: today(),
      status: '待处理',
      request: '',
      result: '',
      createdAt: new Date().toISOString(),
      completedAt: '',
      assigneeMemberId:
        workflowOf(project).assignmentMembers?.[
          guideFor(project.stage).support[0] || 'project'
        ] || '',
      createdByMemberId: member.id,
    },
  );
  const w = workflowOf(project);
  const feedbackOnly =
      !!task && task.assigneeMemberId === member.id && !isManager(member),
    canHandle = isManager(member) || draft.assigneeMemberId === member.id,
    canAdjust = isManager(member);
  return (
    <form
      className="project-form"
      onSubmit={(e) => {
        e.preventDefault();
        onSubmit({
          ...draft,
          completedAt:
            draft.status === '已完成'
              ? draft.completedAt || new Date().toISOString()
              : '',
        });
      }}
    >
      {error && (
        <div className="error-box" role="alert">
          {error}
        </div>
      )}
      <p className="helper-text">
        {project.name} · 发起人：项目主跟 {project.owner}
      </p>
      <label className="field">
        协作事项 <em>*</em>
        <input
          disabled={!canAdjust}
          required
          maxLength={150}
          value={draft.title}
          placeholder="例如：确认厂家交期并反馈销售"
          onChange={(e) => setDraft({ ...draft, title: e.target.value })}
        />
      </label>
      <div className="form-grid">
        <label className="field">
          承办部门
          <select
            disabled={!canAdjust}
            value={draft.department}
            onChange={(e) => {
              const id = e.target.value as DepartmentId;
              setDraft({
                ...draft,
                department: id,
                assignee: w.assignments[id] || '',
                assigneeMemberId: w.assignmentMembers?.[id] || '',
              });
            }}
          >
            {!DEPARTMENTS.some((d) => d.id === draft.department) && (
              <option value={draft.department}>
                {departmentName(draft.department)}
              </option>
            )}
            {DEPARTMENTS.map((d) => (
              <option value={d.id} key={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          承办人 <em>*</em>
          <select
            disabled={!canAdjust}
            required
            value={draft.assigneeMemberId || ''}
            onChange={(e) =>
              setDraft({
                ...draft,
                assigneeMemberId: e.target.value,
                assignee:
                  members.find((m) => m.id === e.target.value)?.name || '',
              })
            }
          >
            <option value="">请选择已登记成员</option>
            {members
              .filter(
                (m) =>
                  m.status === 'active' &&
                  hasDesk(m, departmentDesk(draft.department)),
              )
              .map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          完成期限 <em>*</em>
          <input
            disabled={!canAdjust}
            type="date"
            required
            value={draft.dueDate}
            onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
          />
        </label>
        <label className="field">
          处理状态
          <select
            disabled={!canHandle}
            value={draft.status}
            onChange={(e) =>
              setDraft({
                ...draft,
                status: e.target.value as Collaboration['status'],
              })
            }
          >
            {['待处理', '处理中', '待反馈', '已完成'].map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
        </label>
      </div>
      <label className="field">
        交接内容与期望结果 <em>*</em>
        <textarea
          disabled={!canAdjust}
          required
          rows={3}
          maxLength={4000}
          placeholder="说明已知情况、需要处理的问题、输出资料和反馈对象。"
          value={draft.request}
          onChange={(e) => setDraft({ ...draft, request: e.target.value })}
        />
      </label>
      <label className="field">
        处理结果与反馈 {draft.status === '已完成' && <em>*</em>}
        <textarea
          disabled={!canHandle}
          rows={3}
          required={draft.status === '已完成'}
          maxLength={4000}
          placeholder="做了什么、结果如何、已反馈给谁；完成事项必须填写。"
          value={draft.result}
          onChange={(e) => setDraft({ ...draft, result: e.target.value })}
        />
      </label>
      <div className="form-actions">
        <span>用于工作区登记与督办，不会自动发送外部通知。</span>
        <button
          type="button"
          className="button"
          disabled={busy}
          onClick={onCancel}
        >
          取消
        </button>
        <button className="button primary" disabled={busy}>
          保存协作事项
        </button>
      </div>
    </form>
  );
}
export function DepartmentCenter({
  projects,
  department,
  onDepartment,
  onOpen,
  onEditTask,
  onFollowup,
}: {
  projects: Project[];
  department: string;
  onDepartment: (id: string) => void;
  onOpen: (p: Project) => void;
  onEditTask: (p: Project, t?: Collaboration) => void;
  onFollowup: (p: Project) => void;
}) {
  const [mode, setMode] = useState('部门协作'),
    [status, setStatus] = useState('待闭环');
  const active = projects.filter(isActive);
  const items = projects
    .flatMap((project) =>
      workflowOf(project).tasks.map((task) => ({ project, task })),
    )
    .filter(
      (x) =>
        (department === '全部部门' || x.task.department === department) &&
        (status === '全部状态' ||
          (status === '已完成' && x.task.status === '已完成') ||
          (status === '待闭环' &&
            x.task.status !== '已完成' &&
            isActive(x.project)) ||
          (status === '已逾期' &&
            x.task.status !== '已完成' &&
            x.task.dueDate < today() &&
            isActive(x.project))),
    )
    .sort((a, b) => a.task.dueDate.localeCompare(b.task.dueDate));
  const dept = DEPARTMENTS.find((d) => d.id === department);
  return (
    <>
      <div className="work-mode-tabs">
        <button
          className={mode === '部门协作' ? 'active' : ''}
          onClick={() => setMode('部门协作')}
        >
          <GitBranch size={16} />
          部门协作
        </button>
        <button
          className={mode === '销售行动' ? 'active' : ''}
          onClick={() => setMode('销售行动')}
        >
          <BriefcaseBusiness size={16} />
          销售行动
        </button>
      </div>
      {mode === '部门协作' ? (
        <>
          <div className="dept-filter">
            <select
              aria-label="按承办部门筛选"
              value={department}
              onChange={(e) => onDepartment(e.target.value)}
            >
              <option>全部部门</option>
              {DEPARTMENTS.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
            <select
              aria-label="按协作状态筛选"
              value={status}
              onChange={(e) => setStatus(e.target.value)}
            >
              {['待闭环', '已逾期', '已完成', '全部状态'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
            <span>共 {items.length} 项协作</span>
          </div>
          {dept && (
            <div className="department-brief">
              <strong>
                {dept.name} · {dept.purpose}
              </strong>
              <p>{dept.duties.join('；')}。</p>
            </div>
          )}
          <section className="panel">
            <Heading
              title="交接、处理与结果反馈"
              description="已结项、已丢单及暂停项目的未完成事项不计入当前待办。"
            />
            {items.length ? (
              items.map(({ project: p, task: t }) => (
                <div className="department-task-row" key={t.id}>
                  <span className={'task-status-icon ' + taskTone(t)}>
                    <MessageSquare size={18} />
                  </span>
                  <div>
                    <button
                      className="project-link"
                      onClick={() => onEditTask(p, t)}
                    >
                      {t.title}
                    </button>
                    <p>
                      {departmentName(t.department)} ·{' '}
                      {t.assignee || '待落实对接人'} · 期限 {t.dueDate}
                    </p>
                    <button
                      className="task-project-link"
                      onClick={() => onOpen(p)}
                    >
                      {p.name}
                      <ChevronRight size={13} />
                    </button>
                    {t.result && <small>最近反馈：{t.result}</small>}
                  </div>
                  <Badge tone={taskTone(t)}>{t.status}</Badge>
                  <button
                    className="button small-button"
                    onClick={() => onEditTask(p, t)}
                  >
                    处理 / 反馈
                  </button>
                </div>
              ))
            ) : (
              <div className="small-empty">
                当前筛选下没有协作事项，可在项目详情中新增。
              </div>
            )}
          </section>
        </>
      ) : (
        <section className="panel">
          <Heading
            title="销售下一步行动"
            description="客户推进由项目主跟负责，协作事项按承办部门单独跟踪。"
          />
          {active.length ? (
            active
              .slice()
              .sort((a, b) => a.nextDate.localeCompare(b.nextDate))
              .map((p) => (
                <div className="department-task-row" key={p.id}>
                  <span className="dept-symbol dept-sales">销</span>
                  <div>
                    <strong>{p.nextAction || '补充跟进计划'}</strong>
                    <p>
                      {p.owner} · {p.nextDate || '未安排'} ·{' '}
                      {workflowOf(p).region}
                    </p>
                    <button
                      className="task-project-link"
                      onClick={() => onOpen(p)}
                    >
                      {p.name}
                      <ChevronRight size={13} />
                    </button>
                  </div>
                  <button
                    className="button small-button"
                    onClick={() => onFollowup(p)}
                  >
                    记录结果
                  </button>
                </div>
              ))
          ) : (
            <div className="small-empty">当前没有进行中的项目。</div>
          )}
        </section>
      )}
      <p className="helper-text">
        当前仅返回此账号有权访问的项目；办理与反馈权限由服务端按成员身份检查。
      </p>
    </>
  );
}
export function FilingCenter({
  projects,
  config,
  onEdit,
  onOpen,
  canEdit,
}: {
  canEdit?: (p: Project) => boolean;
  projects: Project[];
  config: Config;
  onEdit: (p: Project) => void;
  onOpen: (p: Project) => void;
}) {
  const [filter, setFilter] = useState('需要关注'),
    [query, setQuery] = useState('');
  const alerts = filingAlerts(projects);
  const rows = projects
    .filter(isActive)
    .flatMap((p) =>
      p.opportunities.map((o) => ({
        project: p,
        opportunity: o,
        product: config.products.find((x) => x.id === o.productId),
        alert: alerts.find(
          (a) => a.project.id === p.id && a.opportunity.id === o.id,
        ),
      })),
    )
    .filter(
      (x) =>
        (filter === '全部报备' || !!x.alert) &&
        [x.project.name, x.product?.brand, x.product?.name]
          .join(' ')
          .includes(query),
    );
  return (
    <>
      <div className="filing-intro">
        <span className="guide-icon">
          <FileCheck2 size={24} />
        </span>
        <div>
          <h3>项目有进展，报备有更新</h3>
          <p>
            锁定产品后及时报备，每月至少更新一次。项目管理部统筹，销售同步业务进展，厂家反馈持续留痕。
          </p>
        </div>
        <Badge tone="green">每月更新</Badge>
      </div>
      <section className="panel">
        <div className="filterbar">
          <label className="search-field">
            <Search size={16} />
            <input
              aria-label="搜索报备"
              placeholder="搜索项目、品牌或产品"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </label>
          <select
            aria-label="报备关注筛选"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          >
            <option>需要关注</option>
            <option>全部报备</option>
          </select>
          <span className="result-count">{rows.length} 项产品报备</span>
        </div>
        <div className="table-scroll">
          <table className="filing-table">
            <thead>
              <tr>
                <th>项目 / 产品</th>
                <th>主跟 / 报备对接</th>
                <th>厂家判定</th>
                <th>最近报备</th>
                <th>下次更新参考</th>
                <th>关注事项</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((x) => (
                <tr key={x.project.id + x.opportunity.id}>
                  <td>
                    <button
                      className="project-link"
                      onClick={() => onOpen(x.project)}
                    >
                      {x.project.name}
                    </button>
                    <small>
                      {x.product?.brand} · {x.product?.name || '产品待补充'}
                    </small>
                  </td>
                  <td>
                    {x.project.owner}
                    <small>
                      {workflowOf(x.project).assignments.project ||
                        '报备对接人待落实'}
                    </small>
                  </td>
                  <td>
                    <Badge
                      tone={
                        x.opportunity.filing === '已确认'
                          ? 'green'
                          : x.opportunity.filing === '未通过'
                            ? 'red'
                            : 'gray'
                      }
                    >
                      {x.opportunity.filing}
                    </Badge>
                  </td>
                  <td>{x.opportunity.filingDate || '待补录'}</td>
                  <td>
                    {nextMonthlyDate(x.opportunity.filingDate || '') ||
                      '待补录后计算'}
                  </td>
                  <td>
                    <Badge
                      tone={
                        x.alert?.reason === '更新已逾期' ||
                        x.alert?.reason === '判定需处理'
                          ? 'red'
                          : x.alert
                            ? 'amber'
                            : 'green'
                      }
                    >
                      {x.alert?.reason || '更新正常'}
                    </Badge>
                  </td>
                  <td>
                    {!canEdit || canEdit(x.project) ? (
                      <button
                        className="button small-button"
                        onClick={() => onEdit(x.project)}
                      >
                        更新报备
                      </button>
                    ) : (
                      <button
                        className="button small-button"
                        onClick={() => onOpen(x.project)}
                      >
                        查看项目
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!rows.length && (
          <div className="small-empty">当前没有匹配的报备事项。</div>
        )}
      </section>
      <p className="helper-text">
        下次更新按最近报备日期的下一个月同日计算；月末按实际天数调整。历史日期缺失时提示补录，不推测历史记录。
      </p>
    </>
  );
}
export function TrainingGuide() {
  const [stage, setStage] = useState(GUIDES[0].stage);
  const g = guideFor(stage);
  return (
    <div className="training-layout">
      <aside className="panel training-stage-list">
        {GUIDES.map((x, i) => (
          <button
            className={x.stage === stage ? 'active' : ''}
            key={x.stage}
            onClick={() => setStage(x.stage)}
          >
            <span>{String(i + 1).padStart(2, '0')}</span>
            {x.stage}
            <ChevronRight size={14} />
          </button>
        ))}
      </aside>
      <div>
        <section className="panel training-guide-content">
          <div className="training-eyebrow">固实销售培训 · 岗位实操</div>
          <h2>{g.title}</h2>
          <p className="training-goal">{g.goal}</p>
          <div className="support-tags">
            <Badge tone="green">主责：{departmentName(g.lead)}</Badge>
            {g.support.map((d) => (
              <Badge key={d}>{departmentName(d)}协作</Badge>
            ))}
          </div>
          <h3>本阶段要落实的工作</h3>
          {g.checks.map((c, i) => (
            <div className="training-check" key={c.id}>
              <span>{i + 1}</span>
              <p>{c.label}</p>
              <Badge>{departmentName(c.department)}</Badge>
            </div>
          ))}
          <h3>沟通与项目记录</h3>
          <div className="training-fields">
            {g.fields.map((f) => (
              <div key={f.id}>
                <strong>{f.label}</strong>
                <p>{f.placeholder}</p>
              </div>
            ))}
          </div>
          <h3>阶段交接</h3>
          <p className="training-handoff">{g.handoff}</p>
          <div className="guide-tips">
            {g.tips.map((t) => (
              <p key={t}>{t}</p>
            ))}
            <small>来源：{g.source}（页码为资料内页）</small>
          </div>
        </section>
        <section className="panel training-closure">
          <MessageSquare size={21} />
          <div>
            <h3>每一次沟通，都形成闭环</h3>
            <p>
              拜访前明确对象、目的与资料；拜访后记录需求、结果和阻碍，安排下一步，并向相关方反馈过程与结论。
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
export function OrganizationMatrix() {
  return (
    <section className="panel organization-panel">
      <Heading
        title="组织分工与项目协作"
        description="销售、管理、财务三个工作台按职责协作；运营与售后在管理工作台内办理与反馈。"
      />
      <div className="organization-chain">
        <span>销售 · 管理 · 财务</span>
        <ChevronRight size={16} />
        <strong>管理工作台内：管理岗 · 运营岗 · 售后岗</strong>
      </div>
      <div className="organization-departments">
        {DEPARTMENTS.map((d) => (
          <div key={d.id}>
            <span className={'dept-symbol dept-' + d.id}>
              {d.short.slice(0, 1)}
            </span>
            <h3>{d.name}</h3>
            <p>{d.purpose}</p>
            <ul>
              {d.duties.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}
