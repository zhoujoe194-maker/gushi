import { z } from 'zod';
import { env } from '../../server/node-env';
import {
  checkOrigin,
  handleError,
  HttpError,
  response,
  sessionCookie,
} from '../../server/auth';
import {
  digestToken,
  hashPassword,
  passwordProblem,
  randomToken,
} from '../../server/password';
import {
  reserveSetupAttempt,
  setupConfiguration,
  setupState,
  verifySetupToken,
} from '../../server/setup';
import { realNameProblem } from '../../access';
import { DESK_IDS } from '../../team';

export const dynamic = 'force-dynamic';
const fields = z.object({
  token: z.string().trim().min(1).max(128),
  name: z.string().trim().min(2).max(50),
  confirmName: z.literal(true),
  password: z.string().min(1).max(128),
  confirmPassword: z.string().min(1).max(128),
});

export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const text = await req.text();
    if (text.length > 10000) throw new HttpError(413, '提交内容过大');
    const state = await setupState();
    if (state.status === 'initialized')
      throw new HttpError(409, '公司工作区已启用，请直接登录');
    const config = setupConfiguration();
    if (!config) throw new HttpError(503, '启用信息尚未配置，请联系部署负责人');
    await reserveSetupAttempt(req);
    const data = fields.parse(JSON.parse(text));
    if (!(await verifySetupToken(data.token, config.token)))
      throw new HttpError(403, '启用码不正确，请核对部署负责人提供的启用码');
    const problem =
      realNameProblem(data.name) || passwordProblem(data.password);
    if (problem) throw new HttpError(400, problem);
    if (data.password !== data.confirmPassword)
      throw new HttpError(400, '两次新密码不一致');
    if (data.password === data.token)
      throw new HttpError(400, '个人密码不能与启用码相同');

    const id = crypto.randomUUID(),
      workspace = 'company-workspace',
      now = new Date().toISOString();
    const hash = await hashPassword(data.password),
      token = randomToken();
    const expires = new Date(Date.now() + 43200000).toISOString();
    // The first write wins inside one transaction. Dependent writes use a fresh random ID,
    // so concurrent or repeated requests cannot modify another administrator's records.
    const results = await env.DB.batch([
      env.DB.prepare(
        "INSERT INTO members(id,workspace_id,email,name,role,region,status,version,created_at,updated_at,profile_completed_at,desks,default_desk) SELECT ?,?,?,?,'owner','全部分部','active',1,?,?,?,?,'management' WHERE NOT EXISTS(SELECT 1 FROM members)",
      ).bind(
        id,
        workspace,
        config.email,
        data.name,
        now,
        now,
        now,
        JSON.stringify(DESK_IDS),
      ),
      env.DB.prepare(
        'INSERT INTO credentials(member_id,password_hash,must_change,version,updated_at) SELECT ?,?,0,1,? WHERE EXISTS(SELECT 1 FROM members WHERE id=?)',
      ).bind(id, hash, now, id),
      env.DB.prepare(
        'INSERT INTO auth_sessions(token_hash,member_id,credential_version,expires_at,created_at) SELECT ?,?,1,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=?)',
      ).bind(await digestToken(token), id, expires, now, id),
      env.DB.prepare(
        'INSERT INTO member_audit(id,workspace_id,actor_id,data,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=?)',
      ).bind(
        crypto.randomUUID(),
        workspace,
        id,
        JSON.stringify({ action: '网页首次启用公司管理员', name: data.name }),
        now,
        id,
      ),
    ]);
    if (results[0].meta.changes !== 1)
      throw new HttpError(409, '公司工作区已启用，请直接登录');
    const result = response({ ok: true, redirectTo: '/workspaces' });
    result.headers.set('Set-Cookie', sessionCookie(req, token));
    return result;
  } catch (error) {
    return handleError(error);
  }
}
