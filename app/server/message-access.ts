import { Context, HttpError } from './auth';
import { myMessageKeys } from '../message-model';
export type ThreadRow = {
  id: string;
  workspace_id: string;
  endpoint_a: string;
  endpoint_b: string;
  kind: 'direct' | 'group';
  name: string;
  project_id: string;
  created_by: string;
  version: number;
  last_mutation: string;
};
// Groups use explicit person membership, independently of the current desk.
export const threadAccessSQL = `(t.kind='direct' AND (t.endpoint_a IN (?,?) OR t.endpoint_b IN (?,?)) OR t.kind='group' AND EXISTS(SELECT 1 FROM message_participants p WHERE p.thread_id=t.id AND p.member_id=?))`;
export const threadAccessValues = (ctx: Context) => [
  ...myMessageKeys(ctx.member),
  ...myMessageKeys(ctx.member),
  ctx.member.id,
];
export async function loadThread(ctx: Context, id: string) {
  const t = await ctx.db
    .prepare(
      `SELECT t.* FROM message_threads t WHERE t.id=? AND t.workspace_id=? AND ${threadAccessSQL}`,
    )
    .bind(id, ctx.workspaceId, ...threadAccessValues(ctx))
    .first<ThreadRow>();
  if (!t) throw new HttpError(404, '会话不存在或无权访问');
  return t;
}
