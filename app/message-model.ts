import { Desk, Member, deskOf, roleInfo, canCreateProject } from './team';
export type MessagePerson = Pick<
  Member,
  'id' | 'name' | 'role' | 'region' | 'status' | 'assignedDesks' | 'accountRole'
>;
export type MessageEndpoint = {
  key: string;
  label: string;
  kind: 'person' | 'desk' | 'group';
  active: boolean;
};
export type ChatMessage = {
  id: string;
  seq: number;
  threadId: string;
  actorId: string;
  actorName: string;
  senderKey: string;
  body: string;
  createdAt: string;
  projectId: string;
  projectName: string;
  kind?: 'text' | 'system';
};
export type ChatGroup = {
  name: string;
  projectId: string;
  projectName: string;
  createdBy: string;
  version: number;
  members: MessagePerson[];
  canManage: boolean;
};
export type ChatThread = {
  id: string;
  a: MessageEndpoint;
  b: MessageEndpoint;
  lastMessage: ChatMessage;
  unread: number;
  group?: ChatGroup;
};
export type MessageInbox = {
  threads: ChatThread[];
  people: MessagePerson[];
  unreadCount: number;
};
type ThreadIdentity = Pick<ChatThread, 'a' | 'b' | 'group'>;
export type GroupInput = {
  name: string;
  projectId: string;
  memberIds: string[];
  clientId: string;
};
export type GroupUpdate = {
  threadId: string;
  name: string;
  memberIds: string[];
  version: number;
};
export const canCreateGroup = canCreateProject;
export const personKey = (id: string) => 'person:' + id;
export const deskKey = (desk: Desk) => 'desk:' + desk;
export const myMessageKeys = (m: Pick<Member, 'id' | 'role'>) => [
  personKey(m.id),
  deskKey(deskOf(m.role)),
];
export const belongsToThread = (
  t: ThreadIdentity,
  m: Pick<Member, 'id' | 'role'>,
) =>
  t.group
    ? t.group.members.some((p) => p.id === m.id)
    : [t.a.key, t.b.key].some((k) => myMessageKeys(m).includes(k));
export const threadKind = (t: ThreadIdentity) =>
  t.group
    ? '项目群聊'
    : t.a.kind === 'person' && t.b.kind === 'person'
      ? '个人对个人'
      : t.a.kind === 'desk' && t.b.kind === 'desk'
        ? '台对台'
        : '个人对台';
export function threadPartner(
  t: ThreadIdentity,
  m: Pick<Member, 'id' | 'role'>,
): MessageEndpoint {
  if (t.group)
    return { key: 'group', label: t.group.name, kind: 'group', active: true };
  const personal = personKey(m.id);
  if (t.a.key === personal) return t.b;
  if (t.b.key === personal) return t.a;
  return t.a.key === deskKey(deskOf(m.role)) ? t.b : t.a;
}
export const senderFor = (t: ThreadIdentity, m: Pick<Member, 'id' | 'role'>) =>
  t.group || [t.a.key, t.b.key].includes(personKey(m.id))
    ? personKey(m.id)
    : deskKey(deskOf(m.role));
export const threadTitle = (
  t: ThreadIdentity,
  m: Pick<Member, 'id' | 'role'>,
) => threadPartner(t, m).label;
export function endpointFor(
  key: string,
  people: MessagePerson[],
): MessageEndpoint {
  if (key.startsWith('group:'))
    return { key, label: '项目群聊', kind: 'group', active: true };
  if (key.startsWith('desk:')) {
    const d = key.slice(5) as Desk;
    return { key, label: roleInfo(d).name + '台', kind: 'desk', active: true };
  }
  const p = people.find((p) => personKey(p.id) === key);
  return {
    key,
    label: p?.name || '已移除成员',
    kind: 'person',
    active: p?.status === 'active',
  };
}
