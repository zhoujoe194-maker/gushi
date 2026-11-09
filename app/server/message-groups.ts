import { z } from 'zod';
import { Context, HttpError, directory, response } from './auth';
import { loadProject } from './projects';
import { canCreateGroup, personKey } from '../message-model';
import { isManager } from '../team';
import { loadThread } from './message-access';

const memberIds = z
  .array(z.string().min(1).max(150))
  .min(2, '至少选择一位同事')
  .max(100, '每个群最多 100 位成员')
  .refine((ids) => new Set(ids).size === ids.length, '群成员不能重复');
const fields = {
  name: z.string().trim().min(1, '请填写群名称').max(80, '群名称最多 80 字'),
  memberIds,
};
const sameIds = (a: string[], b: string[]) =>
  JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());
export async function mutateGroup(
  ctx: Context,
  action: string,
  input: unknown,
) {
  if (!canCreateGroup(ctx.member))
    throw new HttpError(403, '请在销售台或管理台创建和管理项目群');
  const data =
    action === 'group-create'
      ? z
          .object({
            ...fields,
            projectId: z.string().min(1, '请选择项目').max(100),
            clientId: z.string().uuid(),
          })
          .parse(input)
      : z
          .object({
            ...fields,
            threadId: z.string().min(1).max(100),
            version: z.number().int().positive(),
          })
          .parse(input);
  const creating = 'clientId' in data;
  const previous = creating ? null : await loadThread(ctx, data.threadId);
  if (
    previous &&
    (previous.kind !== 'group' ||
      (previous.created_by !== ctx.member.id && !isManager(ctx.member)))
  )
    throw new HttpError(403, '仅群主或群内管理人员可修改群设置');
  if (previous && 'version' in data && previous.version !== data.version)
    throw new HttpError(409, '群成员已变更，请关闭后重新打开群设置');
  const project = await loadProject(
    ctx,
    creating ? data.projectId : previous!.project_id,
  );
  const owner = previous?.created_by || ctx.member.id;
  if (
    !data.memberIds.includes(owner) ||
    !data.memberIds.includes(ctx.member.id)
  )
    throw new HttpError(400, '群主和当前管理人员必须保留在群内');
  const id = creating ? data.clientId : previous!.id;
  const oldRows = await ctx.db
    .prepare('SELECT member_id FROM message_participants WHERE thread_id=?')
    .bind(id)
    .all<{ member_id: string }>();
  const oldIds = oldRows.results.map((p) => p.member_id);
  const members = await directory(ctx);
  for (const memberId of data.memberIds) {
    const person = members.find((m) => m.id === memberId);
    if (!person || (person.status !== 'active' && !oldIds.includes(memberId)))
      throw new HttpError(400, '只能添加本公司启用的成员');
  }
  async function existingCreation() {
    const existing = await loadThread(ctx, id);
    const participants = await ctx.db
      .prepare('SELECT member_id FROM message_participants WHERE thread_id=?')
      .bind(id)
      .all<{ member_id: string }>();
    if (
      existing.kind !== 'group' ||
      existing.created_by !== ctx.member.id ||
      existing.project_id !== project.id ||
      existing.name !== data.name ||
      !sameIds(
        participants.results.map((p) => p.member_id),
        data.memberIds,
      )
    )
      throw new HttpError(409, '建群标识已使用，请重新发起');
    return response({ threadId: id });
  }
  if (
    creating &&
    (await ctx.db
      .prepare('SELECT id FROM message_threads WHERE id=?')
      .bind(id)
      .first())
  )
    return existingCreation();
  if (
    previous &&
    previous.name === data.name &&
    sameIds(oldIds, data.memberIds)
  )
    return response({ threadId: id });

  const now = new Date().toISOString(),
    mutation = crypto.randomUUID(),
    idsJSON = JSON.stringify(data.memberIds);
  // The mutation marker makes every statement depend on the successful version check.
  const guard = `EXISTS(SELECT 1 FROM members WHERE id=? AND workspace_id=? AND status='active' AND version=?)
    AND EXISTS(SELECT 1 FROM projects WHERE id=? AND user_id=? AND version=?)
    AND (SELECT COUNT(*) FROM members m WHERE m.workspace_id=? AND m.id IN (SELECT value FROM json_each(?))
      AND (m.status='active' OR EXISTS(SELECT 1 FROM message_participants p WHERE p.thread_id=? AND p.member_id=m.id)))=?`;
  const guardArgs = [
    ctx.member.id,
    ctx.workspaceId,
    ctx.member.version,
    project.id,
    ctx.workspaceId,
    project.version,
    ctx.workspaceId,
    idsJSON,
    creating ? '' : id,
    data.memberIds.length,
  ];
  const first = creating
    ? ctx.db
        .prepare(
          `INSERT INTO message_threads(id,workspace_id,endpoint_a,endpoint_b,created_at,kind,name,project_id,created_by,version,last_mutation)
      SELECT ?,?,?,?,?, 'group',?,?,?,1,? WHERE ${guard} ON CONFLICT(id) DO NOTHING`,
        )
        .bind(
          id,
          ctx.workspaceId,
          'group:' + id + ':a',
          'group:' + id + ':b',
          now,
          data.name,
          project.id,
          owner,
          mutation,
          ...guardArgs,
        )
    : ctx.db
        .prepare(
          `UPDATE message_threads SET name=?,version=version+1,last_mutation=? WHERE id=? AND workspace_id=? AND version=? AND ${guard}
      AND EXISTS(SELECT 1 FROM message_participants WHERE thread_id=? AND member_id=?)`,
        )
        .bind(
          data.name,
          mutation,
          id,
          ctx.workspaceId,
          data.version,
          ...guardArgs,
          id,
          ctx.member.id,
        );
  const valid =
    'EXISTS(SELECT 1 FROM message_threads WHERE id=? AND workspace_id=? AND last_mutation=?)';
  const args = [id, ctx.workspaceId, mutation];
  const statements = [first];
  if (!creating)
    statements.push(
      ctx.db
        .prepare(
          `DELETE FROM message_participants WHERE thread_id=? AND member_id NOT IN (SELECT value FROM json_each(?)) AND ${valid}`,
        )
        .bind(id, idsJSON, ...args),
    );
  statements.push(
    ctx.db
      .prepare(
        `INSERT INTO message_participants(thread_id,member_id,joined_at) SELECT ?,value,? FROM json_each(?) WHERE ${valid} ON CONFLICT(thread_id,member_id) DO NOTHING`,
      )
      .bind(id, now, idsJSON, ...args),
  );
  const names = (ids: string[]) =>
    ids.map((i) => members.find((m) => m.id === i)?.name || '成员').join('、');
  const added = data.memberIds.filter((i) => !oldIds.includes(i)),
    removed = oldIds.filter((i) => !data.memberIds.includes(i));
  const note = creating
    ? `创建了项目群，加入成员：${names(data.memberIds)}`
    : [
        previous!.name !== data.name ? '修改群名为“' + data.name + '”' : '',
        added.length ? '添加成员：' + names(added) : '',
        removed.length ? '移出成员：' + names(removed) : '',
      ]
        .filter(Boolean)
        .join('；');
  statements.push(
    ctx.db
      .prepare(
        `INSERT INTO message_items(id,thread_id,workspace_id,actor_id,actor_name,sender_key,kind,body,project_id,created_at)
    SELECT ?,?,?,?,?,?,'system',?,'',? WHERE ${valid}`,
      )
      .bind(
        crypto.randomUUID(),
        id,
        ctx.workspaceId,
        ctx.member.id,
        ctx.member.name,
        personKey(ctx.member.id),
        note,
        now,
        ...args,
      ),
  );
  const results = await ctx.db.batch(statements);
  if (!results[0].meta.changes) {
    if (creating) return existingCreation();
    throw new HttpError(409, '群成员、项目或账号权限已更新，请刷新后重试');
  }
  return response({ threadId: id });
}
