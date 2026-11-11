import { z } from 'zod';
import {
  getContext,
  handleError,
  response,
  checkOrigin,
  HttpError,
  directory,
  Context,
} from '../../server/auth';
import { DESK_IDS, canReadProject, isManager } from '../../team';
import {
  myMessageKeys,
  endpointFor,
  ChatMessage,
  MessagePerson,
  canCreateGroup,
  personKey,
} from '../../message-model';
import { loadProject, ProjectRow, projectDTO } from '../../server/projects';
import {
  loadThread as thread,
  threadAccessSQL,
  threadAccessValues,
  ThreadRow,
} from '../../server/message-access';
import { mutateGroup } from '../../server/message-groups';
export const dynamic = 'force-dynamic';
type ItemRow = {
  kind: 'text' | 'system';
  seq: number;
  id: string;
  thread_id: string;
  actor_id: string;
  actor_name: string;
  sender_key: string;
  body: string;
  project_id: string;
  created_at: string;
};
const endpoint = z
  .string()
  .max(150)
  .refine(
    (k) =>
      /^person:[A-Za-z0-9_-]+$/.test(k) ||
      (k.startsWith('desk:') &&
        DESK_IDS.includes(k.slice(5) as (typeof DESK_IDS)[number])),
    '请选择有效的个人或工作台',
  );
async function projectNames(ctx: Context) {
  const ps = await ctx.db
    .prepare('SELECT * FROM projects WHERE user_id=?')
    .bind(ctx.workspaceId)
    .all<ProjectRow>();
  return new Map(
    ps.results
      .map(projectDTO)
      .filter((p) => canReadProject(p, ctx.member))
      .map((p) => [p.id, p.name]),
  );
}
function message(r: ItemRow, names: Map<string, string>): ChatMessage {
  return {
    id: r.id,
    seq: r.seq,
    threadId: r.thread_id,
    actorId: r.actor_id,
    actorName: r.actor_name,
    senderKey: r.sender_key,
    kind: r.kind,
    body: r.body,
    createdAt: r.created_at,
    projectId: r.project_id
      ? names.has(r.project_id)
        ? r.project_id
        : 'restricted'
      : '',
    projectName: names.get(r.project_id) || '',
  };
}
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req),
      url = new URL(req.url),
      id = url.searchParams.get('threadId');
    if (id) {
      await thread(ctx, z.string().min(1).max(100).parse(id));
      const rawBefore = url.searchParams.get('before');
      const before =
        rawBefore === null
          ? Number.MAX_SAFE_INTEGER
          : z.coerce.number().int().positive().safe().parse(rawBefore);
      const names = await projectNames(ctx);
      const rows = await ctx.db
        .prepare(
          "SELECT * FROM message_items WHERE thread_id=? AND workspace_id=? AND seq<? AND (project_id='' OR project_id IN (SELECT value FROM json_each(?))) ORDER BY seq DESC LIMIT 51",
        )
        .bind(id, ctx.workspaceId, before, JSON.stringify([...names.keys()]))
        .all<ItemRow>();
      return response({
        messages: rows.results
          .slice(0, 50)
          .filter(r => !r.project_id || names.has(r.project_id))
          .reverse()
          .map((r) => message(r, names)),
        hasMore: rows.results.length > 50,
      });
    }
    const [members, names] = await Promise.all([
        directory(ctx),
        projectNames(ctx),
      ]),
      people: MessagePerson[] = members.map(
        ({ id, name, role, region, status, assignedDesks, accountRole }) => ({
          id,
          name,
          role,
          region,
          status,
          assignedDesks,
          accountRole,
        }),
      );
    const rows = await ctx.db
      .prepare(
        `SELECT t.*,i.seq,i.id AS item_id,i.actor_id,i.actor_name,i.sender_key,i.body,i.project_id AS item_project_id,i.kind AS item_kind,i.created_at,
 (SELECT COUNT(*) FROM message_items u WHERE u.thread_id=t.id AND u.seq>COALESCE(r.last_seq,0) AND u.actor_id<>? AND (u.project_id='' OR u.project_id IN (SELECT value FROM json_each(?)))) AS unread
 FROM message_threads t JOIN message_items i ON i.seq=(SELECT MAX(seq) FROM message_items WHERE thread_id=t.id AND (project_id='' OR project_id IN (SELECT value FROM json_each(?))))
 LEFT JOIN message_reads r ON r.thread_id=t.id AND r.member_id=?
 WHERE t.workspace_id=? AND ${threadAccessSQL(myMessageKeys(ctx.member))} ORDER BY i.seq DESC`,
      )
      .bind(
        ctx.member.id,
        JSON.stringify([...names.keys()]),
        JSON.stringify([...names.keys()]),
        ctx.member.id,
        ctx.workspaceId,
        ...threadAccessValues(ctx),
      )
      .all<
        ThreadRow &
          Omit<ItemRow, 'kind' | 'project_id'> & {
            item_id: string;
            item_project_id: string;
            item_kind: ItemRow['kind'];
            unread: number;
          }
      >();
    const participants = await ctx.db
      .prepare(
        `SELECT p.thread_id,p.member_id FROM message_participants p JOIN message_threads t ON t.id=p.thread_id WHERE t.workspace_id=? AND ${threadAccessSQL(myMessageKeys(ctx.member))}`,
      )
      .bind(ctx.workspaceId, ...threadAccessValues(ctx))
      .all<{ thread_id: string; member_id: string }>();
    const threads = rows.results.filter(r => (!r.project_id || names.has(r.project_id)) && (!r.item_project_id || names.has(r.item_project_id))).map((r) => ({
      id: r.id,
      a: endpointFor(r.endpoint_a, people),
      b: endpointFor(r.endpoint_b, people),
      lastMessage: message(
        {
          ...r,
          id: r.item_id,
          thread_id: r.id,
          project_id: r.item_project_id,
          kind: r.item_kind,
        },
        names,
      ),
      unread: r.unread,
      ...(r.kind === 'group'
        ? {
            group: {
              name: r.name,
              projectId: names.has(r.project_id) ? r.project_id : 'restricted',
              projectName: names.get(r.project_id) || '',
              createdBy: r.created_by,
              version: r.version,
              members: people.filter((p) =>
                participants.results.some(
                  (row) => row.thread_id === r.id && row.member_id === p.id,
                ),
              ),
              canManage:
                canCreateGroup(ctx.member) &&
                names.has(r.project_id) &&
                (r.created_by === ctx.member.id || isManager(ctx.member)),
            },
          }
        : {}),
    }));
    return response({
      threads,
      people: people.filter((p) => p.status === 'active'),
      unreadCount: threads.reduce((n, t) => n + t.unread, 0),
    });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req);
    const raw = await req.text();
    if (raw.length > 16000) throw new HttpError(413, '消息过长');
    const input = JSON.parse(raw);
    const action = z
      .enum(['send', 'read', 'group-create', 'group-update'])
      .parse(input.action);
    if (action === 'group-create' || action === 'group-update')
      return await mutateGroup(ctx, action, input);
    if (action === 'read') {
      const id = z.string().min(1).max(100).parse(input.threadId);
      await thread(ctx, id);
      const seq = z.number().int().positive().safe().parse(input.upTo);
      const exists = await ctx.db
        .prepare(
          'SELECT seq FROM message_items WHERE thread_id=? AND workspace_id=? AND seq=?',
        )
        .bind(id, ctx.workspaceId, seq)
        .first();
      if (!exists) throw new HttpError(400, '已读位置不正确');
      const r = await ctx.db
        .prepare(
          `INSERT INTO message_reads(workspace_id,thread_id,member_id,last_seq) SELECT ?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?) AND EXISTS(SELECT 1 FROM message_threads t WHERE t.id=? AND t.workspace_id=? AND ${threadAccessSQL(myMessageKeys(ctx.member))}) ON CONFLICT(thread_id,member_id) DO UPDATE SET last_seq=MAX(message_reads.last_seq,excluded.last_seq)`,
        )
        .bind(
          ctx.workspaceId,
          id,
          ctx.member.id,
          seq,
          ctx.member.id,
          ctx.member.version,
          id,
          ctx.workspaceId,
          ...threadAccessValues(ctx),
        )
        .run();
      if (!r.meta.changes) throw new HttpError(409, '账号权限已变更，请刷新');
      return response({ ok: true });
    }
    const data = z
      .object({
        threadId: z.string().max(100).optional(),
        fromKey: endpoint,
        toKey: endpoint.optional(),
        body: z
          .string()
          .trim()
          .min(1, '请填写消息内容')
          .max(4000, '消息最多 4000 字'),
        projectId: z.string().max(100).default(''),
        clientId: z.string().uuid(),
      })
      .parse(input);
    if (!myMessageKeys(ctx.member).includes(data.fromKey))
      throw new HttpError(403, '只能以本人或所属工作台发送消息');
    const from = data.fromKey;
    let to = data.toKey;
    if (data.threadId) {
      const t = await thread(ctx, data.threadId);
      if (t.kind === 'group') return await sendGroup(ctx, t, data);
      if (![t.endpoint_a, t.endpoint_b].includes(from))
        throw new HttpError(403, '不能代表此会话中的发送方');
      to = t.endpoint_a === from ? t.endpoint_b : t.endpoint_a;
    }
    if (!to || to === from) throw new HttpError(400, '请选择不同的接收方');
    const people = await directory(ctx);
    for (const key of [from, to])
      if (
        key.startsWith('person:') &&
        !people.some((m) => m.id === key.slice(7) && m.status === 'active')
      )
        throw new HttpError(400, '该成员已停用或不属于本公司');
    if (data.projectId) await loadProject(ctx, data.projectId);
    const [a, b] = [from, to].sort();
    const old = await ctx.db
      .prepare(
        'SELECT i.*,t.endpoint_a,t.endpoint_b FROM message_items i JOIN message_threads t ON t.id=i.thread_id WHERE i.id=? AND i.workspace_id=?',
      )
      .bind(data.clientId, ctx.workspaceId)
      .first<ItemRow & { endpoint_a: string; endpoint_b: string }>();
    if (old) {
      if (
        old.actor_id !== ctx.member.id ||
        old.endpoint_a !== a ||
        old.endpoint_b !== b ||
        old.sender_key !== from ||
        old.body !== data.body ||
        old.project_id !== data.projectId
      )
        throw new HttpError(409, '消息标识已使用，请重新发送');
      return response({
        threadId: old.thread_id,
        message: message(old, await projectNames(ctx)),
      });
    }
    const now = new Date().toISOString(),
      id = crypto.randomUUID();
    const result = await ctx.db.batch([
      ctx.db
        .prepare(
          `INSERT INTO message_threads(id,workspace_id,endpoint_a,endpoint_b,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?) ON CONFLICT(workspace_id,endpoint_a,endpoint_b) DO NOTHING`,
        )
        .bind(
          id,
          ctx.workspaceId,
          a,
          b,
          now,
          ctx.member.id,
          ctx.member.version,
        ),
      ctx.db
        .prepare(
          `INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,body,project_id,created_at) SELECT ?,t.id,?,?,?,?,?,?,? FROM message_threads t WHERE t.workspace_id=? AND t.endpoint_a=? AND t.endpoint_b=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?) ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          data.clientId,
          ctx.workspaceId,
          ctx.member.id,
          ctx.member.name,
          from,
          data.body,
          data.projectId,
          now,
          ctx.workspaceId,
          a,
          b,
          ctx.member.id,
          ctx.member.version,
        ),
    ]);
    const saved = await ctx.db
      .prepare(
        'SELECT i.* FROM message_items i JOIN message_threads t ON t.id=i.thread_id WHERE i.id=? AND i.workspace_id=? AND i.actor_id=? AND t.endpoint_a=? AND t.endpoint_b=?',
      )
      .bind(data.clientId, ctx.workspaceId, ctx.member.id, a, b)
      .first<ItemRow>();
    if (!saved) throw new HttpError(409, '账号或消息已更新，请刷新重试');
    if (
      !result[1].meta.changes &&
      (saved.body !== data.body ||
        saved.sender_key !== from ||
        saved.project_id !== data.projectId)
    )
      throw new HttpError(409, '消息标识冲突');
    return response({
      threadId: saved.thread_id,
      message: message(saved, await projectNames(ctx)),
    });
  } catch (e) {
    return handleError(e);
  }
}

async function sendGroup(
  ctx: Context,
  t: ThreadRow,
  data: { fromKey: string; body: string; projectId: string; clientId: string },
) {
  if (data.fromKey !== personKey(ctx.member.id))
    throw new HttpError(403, '群聊请以本人身份发送');
  if (data.projectId) await loadProject(ctx, data.projectId);
  const old = await ctx.db
    .prepare('SELECT * FROM message_items WHERE id=?')
    .bind(data.clientId)
    .first<ItemRow>();
  const matches = (r: ItemRow) =>
    r.thread_id === t.id &&
    r.actor_id === ctx.member.id &&
    r.sender_key === data.fromKey &&
    r.body === data.body &&
    r.project_id === data.projectId &&
    r.kind === 'text';
  if (old) {
    if (!matches(old)) throw new HttpError(409, '消息标识已使用，请重新发送');
    return response({
      threadId: t.id,
      message: message(old, await projectNames(ctx)),
    });
  }
  const savedResult = await ctx.db
    .prepare(
      `INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,body,project_id,created_at)
 SELECT ?,?,?,?,?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active' AND version=?)
 AND EXISTS(SELECT 1 FROM message_participants WHERE thread_id=? AND member_id=?) ON CONFLICT(id) DO NOTHING`,
    )
    .bind(
      data.clientId,
      t.id,
      ctx.workspaceId,
      ctx.member.id,
      ctx.member.name,
      data.fromKey,
      data.body,
      data.projectId,
      new Date().toISOString(),
      ctx.member.id,
      ctx.workspaceId,
      ctx.member.version,
      t.id,
      ctx.member.id,
    )
    .run();
  const saved = await ctx.db
    .prepare('SELECT * FROM message_items WHERE id=?')
    .bind(data.clientId)
    .first<ItemRow>();
  if (!saved || !matches(saved))
    throw new HttpError(409, '群成员或账号权限已更新，请刷新后重试');
  if (!savedResult.meta.changes) await thread(ctx, t.id);
  return response({
    threadId: t.id,
    message: message(saved, await projectNames(ctx)),
  });
}
