'use client';
import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  MessageSquare,
  MessagesSquare,
  Plus,
  Search,
  Send,
  Users,
  UserRound,
  ChevronLeft,
  X,
  BriefcaseBusiness,
  RefreshCw,
  ShieldCheck,
  ArrowRight,
} from 'lucide-react';
import { Member, ROLES, deskOf, roleInfo } from './team';
import { hasDesk, grantedDesks } from './access';
import { Project } from './model';
import { demoMembers } from './demo-team';
import {
  ChatMessage,
  ChatThread,
  MessageInbox,
  MessagePerson,
  personKey,
  deskKey,
  myMessageKeys,
  threadKind,
  threadPartner,
  threadTitle,
  senderFor,
  canCreateGroup,
  GroupInput,
  GroupUpdate,
} from './message-model';
import {
  demoInbox,
  demoMessages,
  demoRead,
  demoSend,
  demoGroup,
} from './demo-messages';
import MessageGroupDialog from './message-group-dialog';
import { useModalFocus } from './use-modal-focus';
const when = (s: string) =>
  new Date(s).toLocaleString('zh-CN', {
    timeZone: 'Asia/Shanghai',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
async function api<T = Record<string, unknown>>(
  path: string,
  data?: unknown,
  desk?: string,
): Promise<T> {
  const r = await fetch('/api/messages' + path, {
    cache: 'no-store',
    headers: {
      ...(desk ? { 'X-Workspace-Desk': desk } : {}),
      ...(data ? { 'Content-Type': 'application/json' } : {}),
    },
    ...(data ? { method: 'POST', body: JSON.stringify(data) } : {}),
  });
  const body = (await r.json()) as T & { error?: string };
  if (!r.ok) {
    const e = new Error(body.error || '消息暂时未能同步，请重试') as Error & {
      status: number;
    };
    e.status = r.status;
    throw e;
  }
  return body;
}
export default function MessageCenter({
  member,
  demo,
  active,
  projects,
  onOpen,
  onUnread,
  groupRequest,
}: {
  member: Member;
  demo: boolean;
  active: boolean;
  projects: Project[];
  onOpen: (p: Project) => void;
  onUnread: (n: number) => void;
  groupRequest?: { projectId: string; nonce: number };
}) {
  const request = useCallback(
    <T = Record<string, unknown>,>(path: string, data?: unknown) =>
      api<T>(path, data, deskOf(member.role)),
    [member.role],
  );
  const [inbox, setInbox] = useState<MessageInbox>({
      threads: [],
      people: [],
      unreadCount: 0,
    }),
    [selected, setSelectedState] = useState(''),
    [items, setItems] = useState<ChatMessage[]>([]),
    [more, setMore] = useState(false),
    [search, setSearch] = useState(''),
    [filter, setFilter] = useState('全部'),
    [starting, setStarting] = useState(false),
    [error, setError] = useState(''),
    [sending, setSending] = useState(false),
    [loading, setLoading] = useState(false),
    [historyLoading, setHistoryLoading] = useState(false),
    [drafts, setDrafts] = useState<Record<string, string>>({}),
    [projectIds, setProjectIds] = useState<Record<string, string>>({}),
    [preferredFromKey, setFromKey] = useState('');
  const [groupDialog, setGroupDialog] = useState<{
    projectId?: string;
    thread?: ChatThread;
  } | null>(null);
  const [handledGroupRequest, setHandledGroupRequest] = useState(groupRequest);
  if (groupRequest !== handledGroupRequest) {
    setHandledGroupRequest(groupRequest);
    if (groupRequest) setGroupDialog({ projectId: groupRequest.projectId });
  }
  const selectedRef = useRef(selected),
    loadVersion = useRef(0),
    bottom = useRef<HTMLDivElement>(null),
    readPositions = useRef<Record<string, number>>({}),
    pending = useRef<{ signature: string; id: string } | null>(null),
    draftRef = useRef<HTMLTextAreaElement>(null),
    lastSeq = useRef(0);
  const thread = inbox.threads.find((t) => t.id === selected),
    mine = myMessageKeys(member),
    fromKey = thread
      ? !thread.group &&
        [thread.a, thread.b].some(
          (e) => e.key === preferredFromKey && mine.includes(e.key),
        )
        ? preferredFromKey
        : senderFor(thread, member)
      : '';
  const setSelected = useCallback((id: string) => {
    if (id === selectedRef.current) return;
    selectedRef.current = id;
    setSelectedState(id);
    setItems([]);
    setMore(false);
    setError('');
    setLoading(!!id);
    readPositions.current = {};
    lastSeq.current = 0;
  }, []);
  const refresh = useCallback(async () => {
    try {
      const data: MessageInbox = await (demo
        ? demoInbox(member, demoMembers, projects)
        : request<MessageInbox>(''));
      setInbox(data);
      onUnread(data.unreadCount);
      if (
        selectedRef.current &&
        !data.threads.some((t) => t.id === selectedRef.current)
      ) {
        setSelected('');
        setItems([]);
        setGroupDialog(null);
      }
    } catch (e) {
      if ([401, 403, 423].includes((e as { status: number }).status)) {
        setInbox({ threads: [], people: [], unreadCount: 0 });
        setItems([]);
        setSelected('');
        onUnread(0);
      }
      if (active) setError((e as Error).message);
    }
  }, [member, demo, active, onUnread, projects, request, setSelected]);
  useEffect(() => {
    // Cancel the initial poll if this subscription is replaced before it starts.
    const initialPoll = setTimeout(() => void refresh(), 0);
    const tick = () => {
      if (document.visibilityState === 'visible') void refresh();
    };
    const timer = setInterval(tick, 8000);
    window.addEventListener('focus', tick);
    window.addEventListener('storage', tick);
    window.addEventListener('demo-messages-updated', tick);
    return () => {
      clearTimeout(initialPoll);
      clearInterval(timer);
      window.removeEventListener('focus', tick);
      window.removeEventListener('storage', tick);
      window.removeEventListener('demo-messages-updated', tick);
    };
  }, [refresh]);
  useEffect(() => {
    if (!active || !selected) return;
    let cancelled = false;
    const version = ++loadVersion.current;
    const id = selected;
    async function readLatest() {
      if (document.visibilityState !== 'visible') return;
      try {
        const data: { messages: ChatMessage[]; hasMore: boolean } = demo
          ? demoMessages(member, id)
          : await request<{ messages: ChatMessage[]; hasMore: boolean }>(
              '?threadId=' + encodeURIComponent(id),
            );
        if (
          cancelled ||
          version !== loadVersion.current ||
          id !== selectedRef.current
        )
          return;
        setItems((prev) => {
          const map = new Map(prev.map((m) => [m.id, m]));
          for (const m of data.messages) map.set(m.id, m);
          return [...map.values()].sort((a, b) => a.seq - b.seq);
        });
        if (!lastSeq.current) setMore(data.hasMore);
        lastSeq.current = data.messages.at(-1)?.seq || 0;
        setError('');
      } catch (e) {
        if (!cancelled && id === selectedRef.current) {
          setError((e as Error).message);
          if ([401, 403, 404, 423].includes((e as { status: number }).status)) {
            setItems([]);
            setSelected('');
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void readLatest();
    const timer = setInterval(readLatest, 5000);
    window.addEventListener('focus', readLatest);
    window.addEventListener('demo-messages-updated', readLatest);
    return () => {
      cancelled = true;
      clearInterval(timer);
      window.removeEventListener('focus', readLatest);
      window.removeEventListener('demo-messages-updated', readLatest);
    };
  }, [selected, active, member, demo, request, setSelected]);
  useEffect(() => {
    if (
      !active ||
      !selected ||
      loading ||
      !items.length ||
      document.visibilityState !== 'visible' ||
      !document.hasFocus()
    )
      return;
    const seq = items.at(-1)!.seq,
      id = selected;
    if ((readPositions.current[id] || 0) >= seq) return;
    let stopped = false;
    async function mark() {
      try {
        if (demo) demoRead(member, id, seq);
        else await request('', { action: 'read', threadId: id, upTo: seq });
        if (!stopped) {
          readPositions.current[id] = Math.max(
            readPositions.current[id] || 0,
            seq,
          );
          void refresh();
        }
      } catch (e) {
        if (!stopped) setError((e as Error).message);
      }
    }
    void mark();
    return () => {
      stopped = true;
    };
  }, [items, selected, active, loading, demo, member, refresh, request]);
  const latestId = items.at(-1)?.id;
  useEffect(() => {
    if (active && latestId)
      bottom.current?.scrollIntoView({ block: 'nearest' });
  }, [latestId, active]);
  async function older() {
    if (!items.length || historyLoading) return;
    setHistoryLoading(true);
    const id = selected;
    try {
      const data = demo
        ? demoMessages(member, id, items[0].seq)
        : await request<{ messages: ChatMessage[]; hasMore: boolean }>(
            '?threadId=' + encodeURIComponent(id) + '&before=' + items[0].seq,
          );
      if (selectedRef.current === id) {
        setItems((prev) =>
          [
            ...new Map(
              [...data.messages, ...prev].map((m: ChatMessage) => [m.id, m]),
            ).values(),
          ].sort((a, b) => a.seq - b.seq),
        );
        setMore(data.hasMore);
      }
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setHistoryLoading(false);
    }
  }
  async function send(input: {
    threadId?: string;
    fromKey: string;
    toKey?: string;
    body: string;
    projectId: string;
  }) {
    setSending(true);
    setError('');
    const signature = JSON.stringify(input);
    if (pending.current?.signature !== signature)
      pending.current = { signature, id: crypto.randomUUID() };
    try {
      const payload = { ...input, clientId: pending.current.id };
      const data = demo
        ? demoSend(
            member,
            payload,
            projects.find((p) => p.id === input.projectId)?.name || '',
          )
        : await request<{ threadId: string; message: ChatMessage }>('', {
            action: 'send',
            ...payload,
          });
      pending.current = null;
      await refresh();
      setFilter('全部');
      setSearch('');
      if (data.threadId !== selectedRef.current) setSelected(data.threadId);
      if (data.threadId === selectedRef.current)
        setItems((prev) =>
          [...prev.filter((i) => i.id !== data.message.id), data.message].sort(
            (a, b) => a.seq - b.seq,
          ),
        );
      return true;
    } catch (e) {
      setError((e as Error).message);
      return false;
    } finally {
      setSending(false);
    }
  }
  async function reply(e?: React.FormEvent) {
    e?.preventDefault();
    const body = (drafts[selected] || '').trim();
    if (!body || !thread || sending) return;
    const id = selected;
    if (
      await send({
        threadId: id,
        fromKey,
        body,
        projectId: projectIds[id] || '',
      })
    ) {
      setDrafts((d) => ({ ...d, [id]: '' }));
      setProjectIds((p) => ({ ...p, [id]: '' }));
      draftRef.current?.focus();
    }
  }

  async function saveGroup(input: GroupInput | GroupUpdate) {
    const data = demo
      ? demoGroup(member, input, demoMembers, projects)
      : await request<{ threadId: string }>('', {
          action: 'clientId' in input ? 'group-create' : 'group-update',
          ...input,
        });
    await refresh();
    setSearch('');
    setFilter('全部');
    setSelected(data.threadId);
  }
  const filtered = inbox.threads.filter(
    (t) =>
      (filter !== '未读' || t.unread > 0) &&
      (filter !== '私聊' || threadKind(t) === '个人对个人') &&
      (filter !== '工作台' || (!t.group && threadKind(t) !== '个人对个人')) &&
      (filter !== '群聊' || !!t.group) &&
      (!search ||
        [t.group?.name, t.a.label, t.b.label, t.lastMessage.body]
          .join(' ')
          .toLowerCase()
          .includes(search.toLowerCase())),
  );
  return (
    <div className="message-hub">
      <div className="message-hub-intro">
        <span>
          <ShieldCheck size={15} />
          {demo
            ? '演示消息仅保存在当前浏览器，可切换岗位查看。'
            : '私聊仅双方可见；项目群仅受邀成员可见。'}
        </span>
        <div className="message-hub-actions">
          {canCreateGroup(member) && (
            <button className="button" onClick={() => setGroupDialog({})}>
              <Users size={16} />
              创建项目群
            </button>
          )}
          <button
            className="button primary"
            onClick={() => {
              setError('');
              setStarting(true);
            }}
          >
            <Plus size={16} />
            发起会话
          </button>
        </div>
      </div>
      <section
        className={'message-center ' + (thread ? 'conversation-open' : '')}
        aria-label="员工消息中心"
      >
        <aside className="conversation-sidebar">
          <div className="conversation-heading">
            <div>
              <MessagesSquare size={20} />
              <h2>会话</h2>
              {inbox.unreadCount > 0 && (
                <span className="chat-count">{inbox.unreadCount}</span>
              )}
            </div>
            <button
              className="icon-button"
              aria-label="刷新消息"
              onClick={() => {
                setError('');
                void refresh();
              }}
            >
              <RefreshCw size={15} />
            </button>
          </div>
          <label className="chat-search">
            <Search size={15} />
            <input
              aria-label="搜索会话"
              placeholder="搜索同事、群名或最近消息"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </label>
          <div className="conversation-filters">
            {['全部', '私聊', '工作台', '群聊', '未读'].map((f) => (
              <button
                className={filter === f ? 'active' : ''}
                aria-pressed={filter === f}
                key={f}
                onClick={() => setFilter(f)}
              >
                {f}
              </button>
            ))}
          </div>
          <div className="conversation-list">
            {filtered.map((t) => {
              const partner = threadPartner(t, member);
              return (
                <button
                  key={t.id}
                  className={
                    'conversation-item ' + (selected === t.id ? 'active' : '')
                  }
                  onClick={() => setSelected(t.id)}
                >
                  <span className={'chat-avatar ' + partner.kind}>
                    {partner.kind !== 'person' ? (
                      <Users size={19} />
                    ) : (
                      partner.label.slice(0, 1)
                    )}
                  </span>
                  <span className="conversation-copy">
                    <span>
                      <strong>{threadTitle(t, member)}</strong>
                      <time>{when(t.lastMessage.createdAt)}</time>
                    </span>
                    <small>
                      {threadKind(t)} ·{' '}
                      {t.group
                        ? t.group.members.length + ' 位成员'
                        : t.a.kind === 'desk' && t.b.kind === 'desk'
                          ? '本台共享'
                          : mine.includes(personKey(member.id)) &&
                              [t.a.key, t.b.key].includes(personKey(member.id))
                            ? '本人参与'
                            : '本台共享'}
                    </small>
                    <p>
                      {t.lastMessage.actorName}：{t.lastMessage.body}
                    </p>
                  </span>
                  {t.unread > 0 && (
                    <b className="conversation-unread">
                      {t.unread > 99 ? '99+' : t.unread}
                    </b>
                  )}
                </button>
              );
            })}
            {!filtered.length && (
              <div className="chat-list-empty">
                <MessageSquare size={24} />
                <p>
                  {filter === '未读' ? '没有未读消息' : '还没有符合条件的会话'}
                </p>
                <button
                  className="text-button"
                  onClick={() => setStarting(true)}
                >
                  发起一段沟通
                  <ArrowRight size={13} />
                </button>
              </div>
            )}
          </div>
          <div className="conversation-identity">
            <span className="status-dot" />
            {member.name}
            <small>{roleInfo(member.role).name}台</small>
          </div>
        </aside>
        <div className="conversation-main">
          {thread ? (
            <>
              <header className="chat-header">
                <button
                  className="icon-button chat-back"
                  aria-label="返回会话列表"
                  onClick={() => setSelected('')}
                >
                  <ChevronLeft size={20} />
                </button>
                <span
                  className={
                    'chat-avatar ' + threadPartner(thread, member).kind
                  }
                >
                  {threadPartner(thread, member).kind !== 'person' ? (
                    <Users size={20} />
                  ) : (
                    threadTitle(thread, member).slice(0, 1)
                  )}
                </span>
                <div>
                  <h2>{threadTitle(thread, member)}</h2>
                  <p>
                    {thread.group ? (
                      thread.group.members.length +
                      ' 位成员 · ' +
                      (thread.group.projectName || '关联项目资料按权限查看')
                    ) : (
                      <>
                        {thread.a.label} <span>↔</span> {thread.b.label}
                      </>
                    )}
                  </p>
                </div>
                <span className="chat-kind">{threadKind(thread)}</span>
                {thread.group && (
                  <button
                    className="button group-settings-button"
                    onClick={() => setGroupDialog({ thread })}
                  >
                    <Users size={16} />
                    群成员
                  </button>
                )}
              </header>
              <div className="chat-privacy">
                <ShieldCheck size={13} />
                {thread.group
                  ? '仅群内成员可见；加入后可查看群聊历史，回复以本人身份发送。'
                  : threadKind(thread) === '个人对个人'
                    ? '仅双方本人可查看这段沟通。'
                    : '此会话涉及的工作台成员可查看，回复会注明实际发送人。'}
              </div>
              <div
                className="chat-history"
                aria-label="聊天记录"
                aria-live="polite"
              >
                {more && (
                  <button
                    className="chat-older text-button"
                    disabled={historyLoading}
                    onClick={older}
                  >
                    {historyLoading ? '正在加载…' : '查看更早消息'}
                  </button>
                )}
                {loading && <p className="chat-status">正在加载聊天记录…</p>}
                {items.map((m) =>
                  m.kind === 'system' ? (
                    <p className="chat-system-message" key={m.id}>
                      <span>
                        {m.actorName} {m.body}
                      </span>
                      <time>{when(m.createdAt)}</time>
                    </p>
                  ) : (
                    <article
                      className={
                        'chat-message ' +
                        (m.actorId === member.id || m.senderKey === fromKey
                          ? 'outgoing'
                          : 'incoming')
                      }
                      key={m.id}
                    >
                      <div className="chat-message-meta">
                        <strong>
                          {m.senderKey.startsWith('desk:')
                            ? roleInfo(m.senderKey.slice(5) as Member['role'])
                                .name + '台 · '
                            : ''}
                          {m.actorName}
                        </strong>
                        <time>{when(m.createdAt)}</time>
                      </div>
                      <div className="chat-bubble">
                        <p>{m.body}</p>
                        {m.projectId &&
                          (m.projectId === 'restricted' ? (
                            <span className="chat-project restricted">
                              <BriefcaseBusiness size={13} />
                              关联项目（暂无查看权限）
                            </span>
                          ) : (
                            <button
                              className="chat-project"
                              onClick={() => {
                                const p = projects.find(
                                  (p) => p.id === m.projectId,
                                );
                                if (p) onOpen(p);
                              }}
                            >
                              <BriefcaseBusiness size={13} />
                              {m.projectName || '关联项目'}
                              <ArrowRight size={12} />
                            </button>
                          ))}
                      </div>
                    </article>
                  ),
                )}
                <div ref={bottom} />
              </div>
              {error && !starting && (
                <div className="chat-error" role="alert">
                  {error}
                  <button
                    onClick={() => {
                      setError('');
                      void refresh();
                    }}
                  >
                    重试同步
                  </button>
                </div>
              )}
              <form className="chat-composer" onSubmit={reply}>
                <div className="chat-composer-tools">
                  <label>
                    发送身份
                    <select
                      aria-label="回复发送身份"
                      value={fromKey}
                      onChange={(e) => setFromKey(e.target.value)}
                    >
                      {(thread.group
                        ? [
                            {
                              key: personKey(member.id),
                              label: member.name,
                              kind: 'person',
                            },
                          ]
                        : [thread.a, thread.b].filter((e) =>
                            mine.includes(e.key),
                          )
                      ).map((e) => (
                        <option key={e.key} value={e.key}>
                          {e.kind === 'person'
                            ? '本人 · ' + member.name
                            : e.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <BriefcaseBusiness size={14} />
                    <select
                      aria-label="关联项目"
                      value={projectIds[selected] || ''}
                      onChange={(e) =>
                        setProjectIds((p) => ({
                          ...p,
                          [selected]: e.target.value,
                        }))
                      }
                    >
                      <option value="">不关联项目</option>
                      {projects.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.name}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <textarea
                  ref={draftRef}
                  aria-label="消息内容"
                  rows={3}
                  maxLength={4000}
                  placeholder="写下需要沟通的事项…"
                  value={drafts[selected] || ''}
                  disabled={sending || !thread.a.active || !thread.b.active}
                  onChange={(e) =>
                    setDrafts((d) => ({ ...d, [selected]: e.target.value }))
                  }
                  onKeyDown={(e) => {
                    if (
                      e.key === 'Enter' &&
                      !e.shiftKey &&
                      !e.nativeEvent.isComposing
                    ) {
                      e.preventDefault();
                      void reply();
                    }
                  }}
                />
                <div className="chat-send-row">
                  <small>
                    {!thread.a.active || !thread.b.active
                      ? '成员已停用，历史消息保留。'
                      : 'Enter 发送 · Shift + Enter 换行'}
                  </small>
                  <button
                    className="button primary"
                    type="submit"
                    disabled={
                      sending ||
                      loading ||
                      !fromKey ||
                      !(drafts[selected] || '').trim() ||
                      !thread.a.active ||
                      !thread.b.active
                    }
                  >
                    <Send size={15} />
                    {sending ? '发送中…' : '发送消息'}
                  </button>
                </div>
              </form>
            </>
          ) : (
            <div className="chat-welcome">
              <span>
                <MessagesSquare size={37} />
              </span>
              <div className="entry-eyebrow">TEAM CONVERSATIONS</div>
              <h2>把沟通放回工作里</h2>
              <p>
                找同事私聊、联系工作台，
                <br />
                或在项目群里一起推进工作。
              </p>
              <div>
                <span>
                  <UserRound size={15} />
                  个人对个人
                </span>
                <span>
                  <Users size={15} />
                  个人对台
                </span>
                <span>
                  <MessagesSquare size={15} />
                  项目群聊
                </span>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setError('');
                  setStarting(true);
                }}
              >
                <Plus size={16} />
                发起会话
              </button>
              {error && !starting && (
                <p role="alert" className="text-red">
                  {error}
                </p>
              )}
            </div>
          )}
        </div>
      </section>
      <p className="message-footnote">
        沟通用于交流和补充说明；需要责任人、截止时间与验收的事项，请继续在“
        {deskOf(member.role) === 'management'
          ? '派单与督办'
          : member.role === 'sales'
            ? '任务下发与跟进'
            : '本台任务'}
        ”中处理。
      </p>
      {groupDialog && (
        <MessageGroupDialog
          member={member}
          people={inbox.people}
          projects={projects}
          initialProjectId={groupDialog.projectId}
          thread={groupDialog.thread}
          close={() => setGroupDialog(null)}
          save={saveGroup}
        />
      )}
      {starting && (
        <StartConversation
          member={member}
          people={inbox.people}
          projects={projects}
          busy={sending}
          error={error}
          close={() => {
            if (!sending) {
              setStarting(false);
              setError('');
            }
          }}
          send={async (input) => {
            if (await send(input)) {
              setStarting(false);
              return true;
            }
            return false;
          }}
        />
      )}
    </div>
  );
}
function StartConversation({
  member,
  people,
  projects,
  busy,
  error,
  close,
  send,
}: {
  member: Member;
  people: MessagePerson[];
  projects: Project[];
  busy: boolean;
  error: string;
  close: () => void;
  send: (data: {
    fromKey: string;
    toKey: string;
    body: string;
    projectId: string;
  }) => Promise<boolean>;
}) {
  const [from, setFrom] = useState(personKey(member.id)),
    [kind, setKind] = useState('person'),
    [to, setTo] = useState(''),
    [query, setQuery] = useState(''),
    [body, setBody] = useState(''),
    [projectId, setProjectId] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  useModalFocus(ref, () => {
    if (!busy) close();
  });
  const contacts = people.filter(
    (p) =>
      p.id !== member.id &&
      p.status === 'active' &&
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
  const isShared = from.startsWith('desk:') || kind === 'desk';
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) close();
      }}
    >
      <div
        className="modal chat-start-modal"
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label="发起会话"
      >
        <div className="modal-heading">
          <div>
            <h2 tabIndex={-1} data-modal-initial-focus>
              发起会话
            </h2>
            <p>选择发送身份和接收方，开始一段工作沟通。</p>
          </div>
          <button
            className="icon-button"
            disabled={busy}
            onClick={close}
            aria-label="关闭发起会话"
          >
            <X size={19} />
          </button>
        </div>
        <form
          className="project-form"
          onSubmit={(e) => {
            e.preventDefault();
            if (to && !busy)
              void send({
                fromKey: from,
                toKey: to,
                body: body.trim(),
                projectId,
              });
          }}
        >
          {error && (
            <div className="error-box" role="alert">
              {error}
            </div>
          )}
          <label className="field">
            以谁的身份发送
            <select
              aria-label="新会话发送身份"
              value={from}
              onChange={(e) => {
                setFrom(e.target.value);
                setTo('');
              }}
            >
              <option value={personKey(member.id)}>本人 · {member.name}</option>
              <option value={deskKey(deskOf(member.role))}>
                代表{roleInfo(member.role).name}台
              </option>
            </select>
          </label>
          <label className="field">发给</label>
          <div className="chat-recipient-tabs">
            {[
              ['person', '个人'],
              ['desk', '工作台'],
            ].map(([k, v]) => (
              <button
                key={k}
                type="button"
                className={kind === k ? 'active' : ''}
                onClick={() => {
                  setKind(k);
                  setTo('');
                  setQuery('');
                }}
              >
                {k === 'person' ? <UserRound size={16} /> : <Users size={16} />}{' '}
                {v}
              </button>
            ))}
          </div>
          {kind === 'person' ? (
            <>
              <label className="chat-search">
                <Search size={15} />
                <input
                  aria-label="搜索收件人"
                  placeholder="搜索姓名、分部或岗位"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                />
              </label>
              <div className="chat-contacts">
                {contacts.map((p) => (
                  <label
                    key={p.id}
                    className={to === personKey(p.id) ? 'selected' : ''}
                  >
                    <input
                      type="radio"
                      name="recipient"
                      required
                      checked={to === personKey(p.id)}
                      onChange={() => setTo(personKey(p.id))}
                    />
                    <span className="chat-avatar person">
                      {p.name.slice(0, 1)}
                    </span>
                    <span>
                      <strong>{p.name}</strong>
                      <small>
                        {grantedDesks(p)
                          .map((d) => roleInfo(d).name)
                          .join(' / ')}{' '}
                        · {p.region}
                      </small>
                    </span>
                  </label>
                ))}
                {!contacts.length && (
                  <p className="helper-text">没有找到可接收消息的同事。</p>
                )}
              </div>
            </>
          ) : (
            <div className="chat-desk-options">
              {ROLES.filter((r) => deskKey(deskOf(r.id)) !== from).map((r) => (
                <label
                  key={r.id}
                  className={to === deskKey(deskOf(r.id)) ? 'selected' : ''}
                >
                  <input
                    type="radio"
                    name="recipient"
                    required
                    checked={to === deskKey(deskOf(r.id))}
                    onChange={() => setTo(deskKey(deskOf(r.id)))}
                  />
                  <Users size={18} />
                  <span>
                    <strong>{r.name}台</strong>
                    <small>
                      {people.filter((p) => hasDesk(p, deskOf(r.id))).length}{' '}
                      位成员 · 全公司
                    </small>
                  </span>
                </label>
              ))}
            </div>
          )}
          <div className="chat-sharing-note">
            <ShieldCheck size={13} />
            {isShared
              ? '涉及的工作台成员共享此会话，实际发送人会留名。'
              : '私聊仅双方本人可见。'}
          </div>
          <label className="field">
            第一条消息
            <textarea
              aria-label="第一条消息"
              required
              maxLength={4000}
              rows={3}
              placeholder="说明要沟通的事项和需要对方反馈的内容。"
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </label>
          <label className="field">
            关联项目（可选）
            <select
              aria-label="新会话关联项目"
              value={projectId}
              onChange={(e) => setProjectId(e.target.value)}
            >
              <option value="">不关联项目</option>
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
            <small>仅有项目权限的人可以查看关联项目。</small>
          </label>
          <div className="form-actions">
            <button
              className="button"
              type="button"
              disabled={busy}
              onClick={close}
            >
              取消
            </button>
            <button
              className="button primary"
              disabled={busy || !to || !body.trim()}
            >
              <Send size={15} />
              {busy ? '发送中…' : '发送并开始会话'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
