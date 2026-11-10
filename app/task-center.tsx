'use client';
import { hasDesk } from './access';
import React, { useState, useRef } from 'react';
import {
  TaskImageGallery,
  TaskImagePicker,
  type PendingTaskImage,
} from './task-image-gallery';
import {
  Plus,
  Clock3,
  ClipboardCheck,
  ArrowRight,
  CheckCheck,
  Send,
  History,
  BriefcaseBusiness,
} from 'lucide-react';
import {
  Member,
  ROLES,
  Desk,
  deskOf,
  isManager,
  isScopedManager,
} from './team';
import { Project } from './model';
import {
  DeskTask,
  taskOverdue,
  canHandleTask,
  canDispatchTask,
  canManageTask,
  inReceivingTaskScope,
} from './task-model';
import { FinanceModal } from './role-panels';
export type TaskAction = (action: Record<string, unknown>) => Promise<boolean>;
const deskName = (desk: Desk) => ROLES.find((r) => r.id === desk)!.name;
export default function TaskCenter({
  member,
  members,
  projects,
  tasks,
  onAction,
  onOpen,
  compact = false,
  focusTaskId = '',
  filterDesk = '全部',
}: {
  focusTaskId?: string;
  filterDesk?: string;
  member: Member;
  members: Member[];
  projects: Project[];
  tasks: DeskTask[];
  onAction: TaskAction;
  onOpen: (p: Project) => void;
  compact?: boolean;
}) {
  const manager = isManager(member),
    dispatcher = canDispatchTask(member);
  const [scope, setScope] = useState('全部任务');
  const [filter, setFilter] = useState('待办'),
    [desk, setDesk] = useState(filterDesk),
    [query, setQuery] = useState(''),
    [editing, setEditing] = useState<DeskTask | true | null>(null),
    [selected, setSelected] = useState<DeskTask | null>(
      () => tasks.find((t) => t.id === focusTaskId) || null,
    ),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const submitting = useRef(false);
  const open = tasks.filter((t) => !['已完成', '已取消'].includes(t.status)),
    overdue = open.filter(taskOverdue),
    review = open.filter((t) => t.status === '待验收');
  const items = tasks
    .filter(
      (t) =>
        (scope === '全部任务' ||
          (scope === '我下发的' && t.createdBy === member.id) ||
          (scope === '本台收到的' && inReceivingTaskScope(t, member))) &&
        (desk === '全部' || t.desk === desk) &&
        (!query ||
          [t.title, t.projectName, t.assigneeName].join(' ').includes(query)) &&
        (filter === '全部' ||
          (filter === '待办' && !['已完成', '已取消'].includes(t.status)) ||
          (filter === '逾期' && taskOverdue(t)) ||
          (filter === '待验收' && t.status === '待验收') ||
          (filter === '已关闭' && ['已完成', '已取消'].includes(t.status))),
    )
    .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  async function act(data: Record<string, unknown>) {
    if (submitting.current) return false;
    submitting.current = true;
    setError('');
    setBusy(true);
    try {
      if (await onAction(data)) {
        setEditing(null);
        setSelected(null);
        return true;
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '操作未完成');
    } finally {
      submitting.current = false;
      setBusy(false);
    }
    return false;
  }
  const current = selected;
  return (
    <section className={'task-center ' + (compact ? 'task-center-home' : '')}>
      <div className="dispatch-heading">
        <div>
          <span className="entry-eyebrow">
            {manager ? 'TEAM TASKS' : 'MY DESK TASKS'}
          </span>
          <h2>
            {manager
              ? '任务派发与督办'
              : dispatcher
                ? '任务下发与跟进'
                : '本台任务'}
          </h2>
          <p>
            {dispatcher
              ? '可独立下发日常任务，也可关联项目；明确承办人和期限，跟踪反馈。'
              : '这里只显示发给本台岗位的任务；处理完成后提交管理工作台验收。'}
          </p>
        </div>
        {dispatcher && (
          <button
            className="button primary"
            onClick={() => {
              setError('');
              setEditing(true);
            }}
          >
            <Plus size={17} />
            下发任务
          </button>
        )}
      </div>
      <div className="dispatch-stats">
        {[
          ['待办任务', open.length, '待办'],
          ['已逾期', overdue.length, '逾期'],
          ['待管理验收', review.length, '待验收'],
          [
            '已完成',
            tasks.filter((t) => t.status === '已完成').length,
            '已关闭',
          ],
        ].map(([label, count, f]) => (
          <button
            key={String(label)}
            className={f === '逾期' && Number(count) ? 'overdue' : ''}
            onClick={() => setFilter(String(f))}
          >
            <span>{label}</span>
            <strong>
              {count}
              <small>项</small>
            </strong>
          </button>
        ))}
      </div>
      <div className="panel">
        <div className="dispatch-toolbar">
          <div className="dispatch-tabs">
            {['待办', '逾期', '待验收', '已关闭', '全部'].map((f) => (
              <button
                key={f}
                className={filter === f ? 'active' : ''}
                aria-pressed={filter === f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          {member.role === 'sales' && (
            <select
              aria-label="任务来源"
              value={scope}
              onChange={(e) => setScope(e.target.value)}
            >
              {['全部任务', '我下发的', '本台收到的'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          )}
          {dispatcher && (
            <select
              aria-label="按承办岗位筛选任务"
              value={desk}
              onChange={(e) => setDesk(e.target.value)}
            >
              <option value="全部">全部岗位</option>
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}岗
                </option>
              ))}
            </select>
          )}
          <input
            aria-label="搜索任务"
            placeholder="搜索任务、项目或承办人"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
        </div>
        {items.length ? (
          items.slice(0, compact ? 4 : items.length).map((t) => (
            <button
              className="dispatch-row"
              key={t.id}
              onClick={() => {
                setError('');
                setSelected(t);
              }}
            >
              <span
                className={
                  'dispatch-symbol ' + (taskOverdue(t) ? 'overdue' : '')
                }
              >
                <ClipboardCheck size={20} />
              </span>
              <span className="dispatch-content">
                <strong>{t.title}</strong>
                <span>
                  {deskName(t.desk)}岗 · {t.assigneeName || '本台待认领'}
                  {' · ' + (t.projectName || '独立任务')}
                  {t.createdBy === member.id ? ' · 我下发的' : ''}
                </span>
                <small className={taskOverdue(t) ? 'text-red' : ''}>
                  <Clock3 size={12} />
                  {t.dueDate} 截止{taskOverdue(t) ? ' · 已逾期' : ''}
                </small>
              </span>
              <span
                className={
                  'badge ' +
                  (t.status === '已完成'
                    ? 'green'
                    : t.status === '待验收'
                      ? 'blue'
                      : 'gray')
                }
              >
                {t.status}
              </span>
              <ArrowRight size={15} />
            </button>
          ))
        ) : (
          <div className="small-empty">
            {dispatcher
              ? '暂无符合条件的任务。点击“下发任务”开始安排工作。'
              : '暂无符合条件的本台任务。新任务会在这里同步显示。'}
          </div>
        )}
        {compact && items.length > 4 && (
          <p className="helper-text">
            还有 {items.length - 4} 项，请在“
            {manager
              ? '派单与督办'
              : dispatcher
                ? '任务下发与跟进'
                : '本台任务'}
            ”中查看。
          </p>
        )}
      </div>
      {editing && (
        <TaskEditor
          key={typeof editing === 'boolean' ? 'new' : editing.id}
          task={typeof editing === 'boolean' ? undefined : editing}
          members={members}
          projects={projects}
          error={error}
          busy={busy}
          member={member}
          close={() => !busy && setEditing(null)}
          save={(data) =>
            act({
              action: typeof editing === 'boolean' ? 'create' : 'edit',
              id: typeof editing === 'boolean' ? undefined : editing.id,
              version:
                typeof editing === 'boolean' ? undefined : editing.version,
              data,
            })
          }
        />
      )}
      {current && !editing && (
        <FinanceModal
          title="任务详情与反馈"
          close={() => !busy && setSelected(null)}
        >
          <div className="task-detail">
            <span className="badge green">
              {deskName(current.desk)}岗 · {current.status}
            </span>
            <h3>{current.title}</h3>
            <div className="task-metadata">
              <span>
                完成期限：{current.dueDate}
                {taskOverdue(current) && '（已逾期）'}
              </span>
              <span>承办人：{current.assigneeName || '本台待认领'}</span>
              <span>派发人：{current.createdByName}</span>
              <span>所属分部：{current.region}</span>
            </div>
            <h4>任务要求</h4>
            <p className="task-text">{current.request}</p>
            {current.projectName && (
              <div className="task-project-context">
                <BriefcaseBusiness size={16} />
                <span>{current.projectName}</span>
                {projects.some((p) => p.id === current.projectId) && (
                  <button
                    className="text-button"
                    onClick={() => {
                      setSelected(null);
                      onOpen(projects.find((p) => p.id === current.projectId)!);
                    }}
                  >
                    查看关联项目
                    <ArrowRight size={13} />
                  </button>
                )}
              </div>
            )}
            {current.reviewNote && (
              <div className="info-note">管理反馈：{current.reviewNote}</div>
            )}
            {error && (
              <div className="error-box" role="alert">
                {error}
              </div>
            )}
            <Feedback
              key={current.id + ':' + current.version}
              task={current}
              member={member}
              busy={busy}
              act={(data) =>
                act({ id: current.id, version: current.version, ...data })
              }
            />
            {canManageTask(current, member) &&
              !['已完成', '已取消', '待验收'].includes(current.status) && (
                <button
                  className="button"
                  onClick={() => setEditing(structuredClone(current))}
                >
                  调整要求 / 截止时间
                </button>
              )}
            <details className="task-history">
              <summary>
                <History size={15} />
                任务记录（{current.history.length}）
              </summary>
              {current.history.map((h, i) => (
                <div key={i}>
                  <strong>
                    {h.actor} · {h.status}
                  </strong>
                  <p>{h.note}</p>
                  <TaskImageGallery
                    images={h.images || []}
                    desk={deskOf(member.role)}
                  />
                  <small>
                    {new Date(h.at).toLocaleString('zh-CN', {
                      timeZone: 'Asia/Shanghai',
                    })}
                  </small>
                </div>
              ))}
            </details>
          </div>
        </FinanceModal>
      )}
    </section>
  );
}
function Feedback({
  task,
  member,
  busy,
  act,
}: {
  task: DeskTask;
  member: Member;
  busy: boolean;
  act: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [result, setResult] = useState(task.result),
    [note, setNote] = useState(''),
    [saved, setSaved] = useState(task.images || []),
    [pending, setPending] = useState<PendingTaskImage[]>([]),
    [reading, setReading] = useState(false);
  const feedback = (status: string) =>
    act({
      action: 'feedback',
      status,
      result,
      retainedImageIds: saved.map((image) => image.id),
      files: pending.map((p) => p.file),
    });
  const manager = isManager(member),
    closed = ['已完成', '已取消'].includes(task.status);
  return (
    <>
      <h4>处理结果与进展</h4>
      {!closed && task.status !== '待验收' && canHandleTask(task, member) ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!reading && !busy) feedback('待验收');
          }}
        >
          <label className="field">
            填写处理过程和具体结果
            <textarea
              rows={4}
              maxLength={4000}
              required
              value={result}
              onChange={(e) => setResult(e.target.value)}
            />
          </label>
          <TaskImagePicker
            saved={saved}
            pending={pending}
            setPending={setPending}
            removeSaved={(id) =>
              setSaved((images) => images.filter((image) => image.id !== id))
            }
            desk={deskOf(member.role)}
            busy={busy}
            reading={reading}
            setReading={setReading}
          />
          <div className="form-actions">
            <button
              type="button"
              className="button"
              disabled={busy || reading}
              onClick={() => feedback('处理中')}
            >
              保存进展
            </button>
            <button className="button primary" disabled={busy || reading}>
              <Send size={15} />
              提交验收
            </button>
          </div>
        </form>
      ) : (
        <div>
          <p className="task-text">{task.result || '尚未反馈处理结果。'}</p>
          <TaskImageGallery
            images={task.images || []}
            desk={deskOf(member.role)}
          />
        </div>
      )}
      {!closed && canManageTask(task, member) && (
        <div className="task-review">
          <label className="field">
            {manager ? '验收意见 / 退回或取消原因' : '取消任务原因'}
            <textarea
              rows={2}
              maxLength={2000}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="退回和取消时必须填写原因"
            />
          </label>
          <div className="form-actions">
            {manager && task.status === '待验收' && (
              <>
                <button
                  className="button primary"
                  disabled={busy}
                  onClick={() => act({ action: 'accept', note })}
                >
                  <CheckCheck size={15} />
                  验收通过
                </button>
                <button
                  className="button"
                  disabled={busy || !note.trim()}
                  onClick={() => act({ action: 'return', note })}
                >
                  退回补充
                </button>
              </>
            )}
            <button
              className="text-button text-red"
              disabled={busy || !note.trim()}
              onClick={() => act({ action: 'cancel', note })}
            >
              取消任务
            </button>
          </div>
        </div>
      )}
      {!closed && !manager && task.status === '待验收' && (
        <p className="helper-text">结果已提交，等待管理工作台验收。</p>
      )}
      {!closed && !manager && !canHandleTask(task, member) && (
        <p className="helper-text">
          由 {task.assigneeName || '承办岗位成员'} 负责处理，可在这里跟踪进展。
        </p>
      )}
    </>
  );
}
export function TaskEditor({
  task,
  member,
  members,
  projects,
  error,
  busy,
  close,
  save,
}: {
  task?: DeskTask;
  member: Member;
  members: Member[];
  projects: Project[];
  error: string;
  busy: boolean;
  close: () => void;
  save: (data: Record<string, unknown>) => Promise<boolean>;
}) {
  const [draft, setDraft] = useState({
    title: task?.title || '',
    request: task?.request || '',
    desk: task?.desk || 'sales',
    dueDate: task?.dueDate || '',
    region: task?.region || member.region,
    projectId: task?.projectId || '',
    assigneeId: task?.assigneeId || '',
  });
  return (
    <FinanceModal title={task ? '调整任务' : '下发任务'} close={close}>
      <form
        className="project-form"
        aria-busy={busy}
        onSubmit={(e) => {
          e.preventDefault();
          save(draft);
        }}
      >
        {error && (
          <div className="error-box" role="alert">
            {error}
          </div>
        )}
        <p className="helper-text">
          日常工作可直接下发，无需先建项目。带 * 的为必填项。
        </p>
        <label className="field">
          任务名称 *
          <input
            required
            maxLength={150}
            value={draft.title}
            onChange={(e) => setDraft({ ...draft, title: e.target.value })}
          />
        </label>
        <div className="form-grid">
          <label className="field">
            承办岗位
            <select
              value={draft.desk}
              onChange={(e) =>
                setDraft({
                  ...draft,
                  desk: e.target.value as Desk,
                  assigneeId: '',
                })
              }
            >
              {ROLES.map((r) => (
                <option key={r.id} value={r.id}>
                  {r.name}岗
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            完成期限 *
            <input
              required
              type="date"
              value={draft.dueDate}
              onChange={(e) => setDraft({ ...draft, dueDate: e.target.value })}
            />
          </label>
          <label className="field">
            指定承办人
            <select
              value={draft.assigneeId}
              onChange={(e) =>
                setDraft({ ...draft, assigneeId: e.target.value })
              }
            >
              <option value="">派给本台，由成员认领</option>
              {members
                .filter(
                  (m) =>
                    m.status === 'active' &&
                    hasDesk(m, draft.desk as Desk) &&
                    (draft.region === '全部分部' ||
                      m.region === '全部分部' ||
                      m.region === draft.region),
                )
                .map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
            </select>
          </label>
          <label className="field">
            所属分部
            <select
              disabled={
                (member.region !== '全部分部' &&
                  (isScopedManager(member) || member.role === 'sales')) ||
                !!draft.projectId
              }
              value={draft.region}
              onChange={(e) =>
                setDraft({ ...draft, region: e.target.value, assigneeId: '' })
              }
            >
              {['全部分部', '广州总部', '湖南分部'].map((r) => (
                <option key={r}>{r}</option>
              ))}
            </select>
          </label>
        </div>
        <label className="field">
          关联项目（选填）
          <select
            value={draft.projectId}
            onChange={(e) => {
              const p = projects.find((p) => p.id === e.target.value);
              setDraft({
                ...draft,
                projectId: e.target.value,
                region:
                  p?.workflow?.region && p.workflow.region !== '待分配'
                    ? p.workflow.region
                    : member.region,
                assigneeId: '',
              });
            }}
          >
            <option value="">不关联项目 · 独立任务</option>
            {projects
              .filter(
                (p) =>
                  member.region === '全部分部' ||
                  p.workflow?.region === member.region ||
                  p.workflow?.region === '待分配',
              )
              .map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
          </select>
        </label>
        <label className="field">
          任务要求与验收标准 *
          <textarea
            required
            rows={4}
            maxLength={4000}
            value={draft.request}
            onChange={(e) => setDraft({ ...draft, request: e.target.value })}
            placeholder="需要做什么，交付什么结果，达到什么标准"
          />
        </label>
        <p className="helper-text">
          截止日期由你设定。下发人、承办岗位及管理工作台可跟踪任务；承办人提交结果后，由管理工作台验收。
        </p>
        <div className="form-actions">
          <button
            type="button"
            className="button"
            disabled={busy}
            onClick={close}
          >
            取消
          </button>
          <button className="button primary" disabled={busy}>
            {busy ? '正在保存…' : task ? '保存调整' : '确认下发'}
          </button>
        </div>
      </form>
    </FinanceModal>
  );
}
