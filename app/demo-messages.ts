import { Member, isManager } from './team';
import {
  ChatMessage,
  ChatThread,
  MessageInbox,
  endpointFor,
  myMessageKeys,
  MessagePerson,
  GroupInput,
  GroupUpdate,
  canCreateGroup,
  personKey,
} from './message-model';
import { Project } from './model';
const STORE = 'gushi.demo.messages.v1';
type DemoGroup = {
  name: string;
  projectId: string;
  createdBy: string;
  memberIds: string[];
  version: number;
};
type DemoState = {
  threads: { id: string; a: string; b: string; group?: DemoGroup }[];
  messages: ChatMessage[];
  reads: Record<string, number>;
};
function initial(): DemoState {
  const s: DemoState = { threads: [], messages: [], reads: {} };
  function add(a: string, b: string, actor: string, body: string) {
    const pair = [a, b].sort();
    let t = s.threads.find((t) => t.a === pair[0] && t.b === pair[1]);
    if (!t) {
      t = { id: 'demo-chat-' + (s.threads.length + 1), a: pair[0], b: pair[1] };
      s.threads.push(t);
    }
    s.messages.push({
      id: 'demo-message-' + (s.messages.length + 1),
      seq: s.messages.length + 1,
      threadId: t.id,
      actorId: 'demo-' + actor,
      actorName:
        (
          {
            sales: '销售',
            finance: '财务',
            operations: '运营',
            management: '管理',
            aftersales: '售后',
          } as Record<string, string>
        )[actor] + '（演示）',
      senderKey: a,
      body,
      createdAt: new Date(
        Date.now() - (20 - s.messages.length) * 60000,
      ).toISOString(),
      projectId: '',
      projectName: '',
    });
  }
  add(
    'person:demo-sales',
    'person:demo-finance',
    'sales',
    '你好，客户希望本周确认合同付款节点，方便帮我核对一下吗？',
  );
  add(
    'person:demo-finance',
    'person:demo-sales',
    'finance',
    '可以，请在项目里提交合同，我会在财务台审核，并把需要补充的资料反馈给你。',
  );
  add(
    'person:demo-sales',
    'desk:operations',
    'sales',
    '运营同事好，请帮忙确认保温材料参数与厂家交期，拿到反馈后在这里回复即可。',
  );
  add(
    'desk:operations',
    'person:demo-sales',
    'operations',
    '已联系厂家核对，预计今天下午反馈参数依据和交货安排。',
  );
  add(
    'desk:sales',
    'desk:finance',
    'sales',
    '财务台好，本周合同和待开票资料已整理，请核对后在本会话反馈。',
  );
  add(
    'desk:finance',
    'desk:sales',
    'finance',
    '收到。正式开票申请请通过项目的“合同与票款”提交，这里可以沟通补充事项。',
  );
  add(
    'desk:operations',
    'desk:aftersales',
    'operations',
    '售后同事好，客户的交付资料已准备好，请协助安排回访。',
  );
  add(
    'desk:management',
    'desk:sales',
    'management',
    '本周请优先跟进逾期项目。需要明确责任人与完成期限的事项，仍通过管理派单。',
  );
  return s;
}
function state(): DemoState {
  try {
    const raw = localStorage.getItem(STORE);
    if (raw) return JSON.parse(raw);
  } catch {}
  const s = initial();
  localStorage.setItem(STORE, JSON.stringify(s));
  return s;
}
function save(s: DemoState) {
  localStorage.setItem(STORE, JSON.stringify(s));
  window.dispatchEvent(new Event('demo-messages-updated'));
}
export function demoInbox(
  m: Member,
  people: MessagePerson[],
  projects: Project[] = [],
): MessageInbox {
  const s = state(),
    keys = myMessageKeys(m);
  const threads: ChatThread[] = s.threads
    .filter((t) =>
      t.group
        ? t.group.memberIds.includes(m.id)
        : keys.includes(t.a) || keys.includes(t.b),
    )
    .map((t) => ({
      id: t.id,
      a: endpointFor(t.a, people),
      b: endpointFor(t.b, people),
      ...(t.group
        ? {
            group: {
              ...t.group,
              members: people.filter((p) => t.group!.memberIds.includes(p.id)),
              projectId: projects.some((p) => p.id === t.group!.projectId)
                ? t.group.projectId
                : 'restricted',
              projectName:
                projects.find((p) => p.id === t.group!.projectId)?.name || '',
              canManage:
                canCreateGroup(m) &&
                projects.some((p) => p.id === t.group!.projectId) &&
                (t.group.createdBy === m.id || isManager(m)),
            },
          }
        : {}),
      lastMessage: s.messages.filter((i) => i.threadId === t.id).at(-1)!,
      unread: s.messages.filter(
        (i) =>
          i.threadId === t.id &&
          i.actorId !== m.id &&
          i.seq > (s.reads[t.id + ':' + m.id] || 0),
      ).length,
    }))
    .sort((a, b) => b.lastMessage.seq - a.lastMessage.seq);
  return {
    threads,
    people,
    unreadCount: threads.reduce((n, t) => n + t.unread, 0),
  };
}
export function demoMessages(
  m: Member,
  id: string,
  before = Number.MAX_SAFE_INTEGER,
) {
  const s = state();
  requireDemoThread(s, m, id);
  const items = s.messages.filter((i) => i.threadId === id && i.seq < before);
  return { messages: items.slice(-50), hasMore: items.length > 50 };
}
export function demoRead(m: Member, id: string, upTo: number) {
  const s = state();
  requireDemoThread(s, m, id);
  s.reads[id + ':' + m.id] = Math.max(s.reads[id + ':' + m.id] || 0, upTo);
  save(s);
}
export function demoSend(
  m: Member,
  input: {
    threadId?: string;
    fromKey: string;
    toKey?: string;
    body: string;
    projectId: string;
    clientId: string;
  },
  projectName: string,
) {
  const s = state();
  if (!myMessageKeys(m).includes(input.fromKey))
    throw Error('只能代表本人或本台发送');
  const old = input.threadId
    ? requireDemoThread(s, m, input.threadId)
    : undefined;
  if (old?.group) {
    if (input.fromKey !== personKey(m.id)) throw Error('群聊请以本人身份发送');
    const duplicate = s.messages.find((i) => i.id === input.clientId);
    if (duplicate) return { threadId: old.id, message: duplicate };
    const message = append(
      s,
      m,
      old.id,
      input.body.trim(),
      input.clientId,
      'text',
      input.projectId,
      projectName,
    );
    save(s);
    return { threadId: old.id, message };
  }
  const to = old ? (old.a === input.fromKey ? old.b : old.a) : input.toKey;
  if (!to || to === input.fromKey) throw Error('请选择不同的接收方');
  const pair = [input.fromKey, to].sort();
  let t = s.threads.find((t) => t.a === pair[0] && t.b === pair[1]);
  if (!t) {
    t = { id: crypto.randomUUID(), a: pair[0], b: pair[1] };
    s.threads.push(t);
  }
  let msg = s.messages.find((i) => i.id === input.clientId);
  if (!msg) {
    msg = {
      id: input.clientId,
      seq: (s.messages.at(-1)?.seq || 0) + 1,
      threadId: t.id,
      actorId: m.id,
      actorName: m.name,
      senderKey: input.fromKey,
      body: input.body.trim(),
      projectId: input.projectId,
      projectName,
      createdAt: new Date().toISOString(),
    };
    s.messages.push(msg);
    save(s);
  }
  return { threadId: t.id, message: msg };
}

function requireDemoThread(s: DemoState, m: Member, id: string) {
  const t = s.threads.find((t) => t.id === id);
  if (
    !t ||
    (t.group
      ? !t.group.memberIds.includes(m.id)
      : !myMessageKeys(m).some((key) => [t.a, t.b].includes(key)))
  )
    throw Object.assign(Error('会话不存在或无权访问'), { status: 404 });
  return t;
}
function append(
  s: DemoState,
  m: Member,
  id: string,
  body: string,
  clientId = crypto.randomUUID(),
  kind: 'text' | 'system' = 'system',
  projectId = '',
  projectName = '',
) {
  const message: ChatMessage = {
    id: clientId,
    seq: (s.messages.at(-1)?.seq || 0) + 1,
    threadId: id,
    actorId: m.id,
    actorName: m.name,
    senderKey: personKey(m.id),
    body,
    kind,
    projectId,
    projectName,
    createdAt: new Date().toISOString(),
  };
  s.messages.push(message);
  return message;
}
export function demoGroup(
  m: Member,
  input: GroupInput | GroupUpdate,
  people: MessagePerson[],
  projects: Project[],
) {
  const s = state(),
    creating = 'clientId' in input;
  if (!canCreateGroup(m)) throw Error('请在销售台或管理台管理项目群');
  const old = creating ? undefined : requireDemoThread(s, m, input.threadId);
  if (old && (!old.group || (old.group.createdBy !== m.id && !isManager(m))))
    throw Error('仅群主或群内管理人员可以修改群设置');
  if (old && 'version' in input && old.group!.version !== input.version)
    throw Error('群成员已变更，请重新打开设置');
  const projectId = creating ? input.projectId : old!.group!.projectId;
  if (!projects.some((p) => p.id === projectId))
    throw Error('请选择有权限的项目');
  const owner = old?.group?.createdBy || m.id;
  if (
    !input.name.trim() ||
    input.name.trim().length > 80 ||
    input.memberIds.length < 2 ||
    input.memberIds.length > 100 ||
    !input.memberIds.includes(owner) ||
    !input.memberIds.includes(m.id)
  )
    throw Error('请填写群名称、保留群主并选择同事');
  for (const id of input.memberIds)
    if (
      !people.some(
        (p) =>
          p.id === id &&
          (p.status === 'active' || old?.group?.memberIds.includes(id)),
      )
    )
      throw Error('请选择本公司启用成员');
  if (creating) {
    if (s.threads.some((t) => t.id === input.clientId))
      return { threadId: input.clientId };
    const id = input.clientId;
    s.threads.push({
      id,
      a: 'group:' + id + ':a',
      b: 'group:' + id + ':b',
      group: {
        name: input.name.trim(),
        projectId,
        createdBy: m.id,
        memberIds: input.memberIds,
        version: 1,
      },
    });
    append(
      s,
      m,
      id,
      '创建了项目群，加入成员：' +
        people
          .filter((p) => input.memberIds.includes(p.id))
          .map((p) => p.name)
          .join('、'),
    );
    save(s);
    return { threadId: id };
  }
  const group = old!.group!;
  const describe = (ids: string[]) =>
    people
      .filter((p) => ids.includes(p.id))
      .map((p) => p.name)
      .join('、');
  const added = input.memberIds.filter((id) => !group.memberIds.includes(id)),
    removed = group.memberIds.filter((id) => !input.memberIds.includes(id));
  const note = [
    group.name !== input.name.trim()
      ? '修改群名为“' + input.name.trim() + '”'
      : '',
    added.length ? '添加成员：' + describe(added) : '',
    removed.length ? '移出成员：' + describe(removed) : '',
  ]
    .filter(Boolean)
    .join('；');
  if (note) {
    old!.group = {
      ...group,
      name: input.name.trim(),
      memberIds: input.memberIds,
      version: group.version + 1,
    };
    append(s, m, old!.id, note);
    save(s);
  }
  return { threadId: old!.id };
}
