'use client';
import { useId, useRef, useState } from 'react';
import { Search, Users, X } from 'lucide-react';
import {
  ChatThread,
  GroupInput,
  GroupUpdate,
  MessagePerson,
} from './message-model';
import { Member, roleInfo } from './team';
import { grantedDesks } from './access';
import { Project } from './model';
import { useModalFocus } from './use-modal-focus';

type Props = {
  member: Member;
  people: MessagePerson[];
  projects: Project[];
  initialProjectId?: string;
  thread?: ChatThread;
  close: () => void;
  save: (input: GroupInput | GroupUpdate) => Promise<void>;
};
export default function MessageGroupDialog({
  member,
  people,
  projects,
  initialProjectId = '',
  thread,
  close,
  save,
}: Props) {
  const group = thread?.group,
    editable = !group || group.canManage;
  const [projectId, setProjectId] = useState(
    group?.projectId || initialProjectId,
  );
  const [name, setName] = useState(
    group?.name ||
      (projects.find((p) => p.id === initialProjectId)?.name
        ? projects.find((p) => p.id === initialProjectId)!.name.slice(0, 72) +
          ' · 项目群'
        : ''),
  );
  const [ids, setIds] = useState(
    group?.members.map((p) => p.id) || [member.id],
  );
  const [query, setQuery] = useState(''),
    [busy, setBusy] = useState(false),
    [error, setError] = useState('');
  const ref = useRef<HTMLDivElement>(null),
    requestId = useRef(''),
    titleId = useId(),
    noteId = useId();
  const submitLock = useRef(false);
  useModalFocus(ref, () => {
    if (!submitLock.current) close();
  });
  const contacts = [
    ...new Map(
      [...(group?.members || []), ...people].map((p) => [p.id, p]),
    ).values(),
  ];
  const shown = contacts.filter(
    (p) =>
      (editable || ids.includes(p.id)) &&
      [
        p.name,
        p.region,
        grantedDesks(p)
          .map((d) => roleInfo(d).name)
          .join(' '),
      ]
        .join(' ')
        .includes(query),
  );
  const title = group ? '群成员与设置' : '创建项目群';
  const project = projects.find((p) => p.id === projectId);
  function changeProject(id: string) {
    setProjectId(id);
    setName(
      (projects.find((p) => p.id === id)?.name || '').slice(0, 72) +
        ' · 项目群',
    );
  }
  function suggested() {
    if (!project) return;
    const related = [
      project.ownerMemberId,
      ...Object.values(project.workflow?.assignmentMembers || {}),
      ...(project.workflow?.tasks || []).map((t) => t.assigneeMemberId),
    ];
    setIds((current) => [
      ...new Set([
        ...current,
        ...contacts
          .filter((p) => p.status === 'active' && related.includes(p.id))
          .map((p) => p.id),
      ]),
    ]);
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submitLock.current || !editable) return;
    submitLock.current = true;
    setBusy(true);
    setError('');
    if (!requestId.current) requestId.current = crypto.randomUUID();
    try {
      await save(
        group
          ? {
              threadId: thread!.id,
              name,
              memberIds: ids,
              version: group.version,
            }
          : { name, projectId, memberIds: ids, clientId: requestId.current },
      );
      close();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      submitLock.current = false;
      setBusy(false);
    }
  }
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className="modal chat-start-modal group-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={noteId}
      >
        <div className="modal-heading">
          <div>
            <h2 id={titleId} tabIndex={-1} data-modal-initial-focus>
              {title}
            </h2>
            <p id={noteId}>
              {group
                ? '查看成员，保持项目沟通清晰。'
                : '选好项目和同事，把相关工作集中在一个群里。'}
            </p>
          </div>
          <button
            className="icon-button"
            disabled={busy}
            onClick={close}
            aria-label={'关闭' + title}
          >
            <X size={20} />
          </button>
        </div>
        <form className="project-form" onSubmit={submit} aria-busy={busy}>
          {error && (
            <p className="error-box" role="alert">
              {error}
            </p>
          )}
          <fieldset className="group-fields" disabled={busy}>
            <legend className="sr-only">项目群资料</legend>
            {!group ? (
              <label className="field">
                关联项目
                <select
                  required
                  value={projectId}
                  onChange={(e) => changeProject(e.target.value)}
                >
                  <option value="">请选择项目</option>
                  {projects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                    </option>
                  ))}
                </select>
              </label>
            ) : (
              <p className="group-project-caption">
                关联项目：{group.projectName || '暂无项目资料查看权限'}
              </p>
            )}
            {!group && !projects.length && (
              <p className="helper-text">
                暂无可关联的项目。请先创建项目，再发起项目群。
              </p>
            )}
            <label className="field">
              群名称
              <input
                required
                maxLength={80}
                value={name}
                readOnly={!editable}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <div className="group-members-heading">
              <h3>
                <Users size={17} aria-hidden="true" />
                群成员 <span aria-live="polite">{ids.length} / 100</span>
              </h3>
              {editable && project && (
                <button
                  className="text-button"
                  type="button"
                  onClick={suggested}
                >
                  选入项目对接人
                </button>
              )}
            </div>
            {editable && (
              <p className="helper-text">
                勾选需要参与的同事；群主与当前操作人保留在群内。
              </p>
            )}
            <label className="chat-search">
              <Search size={15} aria-hidden="true" />
              <span className="sr-only">搜索群成员</span>
              <input
                placeholder="搜索姓名、岗位或分部"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <ul className="group-member-list">
              {shown.map((p) => {
                const pinned =
                  p.id === (group?.createdBy || member.id) ||
                  p.id === member.id;
                return (
                  <li key={p.id}>
                    <label className={ids.includes(p.id) ? 'selected' : ''}>
                      {editable && (
                        <input
                          type="checkbox"
                          checked={ids.includes(p.id)}
                          disabled={
                            pinned || (!ids.includes(p.id) && ids.length >= 100)
                          }
                          onChange={(e) =>
                            setIds((old) =>
                              e.target.checked
                                ? [...old, p.id]
                                : old.filter((id) => id !== p.id),
                            )
                          }
                        />
                      )}
                      <span className="chat-avatar person" aria-hidden="true">
                        {p.name.slice(0, 1)}
                      </span>
                      <span className="group-member-copy">
                        <strong>
                          {p.name}
                          {p.id === (group?.createdBy || member.id) && (
                            <small>群主</small>
                          )}
                        </strong>
                        <small>
                          {grantedDesks(p)
                            .map((d) => roleInfo(d).name)
                            .join(' / ')}{' '}
                          · {p.region}
                          {p.status !== 'active' ? ' · 已停用' : ''}
                        </small>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
            {!shown.length && (
              <p className="helper-text">没有找到符合条件的成员。</p>
            )}
            <p className="group-history-note">
              群成员可查看全部群聊历史。新加入的同事也能看到此前消息；移出后无法继续访问。群聊权限与项目资料权限分别管理。
            </p>
          </fieldset>
          <div className="form-actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={close}
            >
              {editable ? '取消' : '关闭'}
            </button>
            {editable && (
              <button
                className="button primary"
                disabled={
                  busy ||
                  !name.trim() ||
                  !projectId ||
                  ids.length < 2 ||
                  ids.length > 100
                }
              >
                {busy ? '正在保存…' : group ? '保存群设置' : '创建项目群'}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
