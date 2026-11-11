import { z } from 'zod';
import {
  getContext,
  handleError,
  response,
  checkOrigin,
  requireManager,
  directory,
  HttpError,
  RawMember,
  memberDTO,
  Context,
} from '../../server/auth';
import {
  DESK_IDS,
  MANAGEMENT_CAPABILITY_DESKS,
  Member,
  ROLE_IDS,
  Role,
  deskOf,
  isScopedManager,
  portalOfDesk,
  realRole,
} from '../../team';
import {
  defaultPortal,
  grantedDesks,
  grantedPortals,
  professionPortal,
} from '../../access';
import {
  hashPassword,
  passwordProblem,
  normalizePhone,
  validPhone,
  internalEmail,
} from '../../server/password';
export const dynamic = 'force-dynamic';
const schema = z.object({
  id: z.string().max(100).optional(),
  version: z.number().int().optional(),
  email: z.string().trim().max(200).default(''),
  phone: z.string().trim().max(30).default(''),
  password: z.string().max(128).optional(),
  name: z.string().trim().max(50).default(''),
  // Explicit real professional identity. Legacy `role` is accepted as an alias
  // for old clients/tests but is never inferred from a portal/desk checkbox.
  professionRole: z.enum(ROLE_IDS).optional(),
  role: z.enum(DESK_IDS).optional(),
  assignedDesks: z.array(z.enum(DESK_IDS)).min(1, '至少选择一个工作台').max(5).optional(),
  defaultDesk: z.enum(DESK_IDS).optional(),
  region: z.enum(['全部分部', '广州总部', '湖南分部']),
  status: z.enum(['active', 'disabled']),
});
const MANAGER_ROLES: Role[] = ['management', 'general', 'director', 'branch_manager'];
const isManagerProfession = (role: Role) => MANAGER_ROLES.includes(role);
// Inference is only for legacy callers that do not send an explicit
// professionRole. It never upgrades an operations/aftersales grant to manager:
// the management role requires its own explicit role input or an explicit
// management-only grant.
function inferProfession(desks: string[]): Role {
  if (desks.includes('sales')) return 'sales';
  if (desks.includes('finance')) return 'finance';
  if (desks.includes('management')) return 'management';
  if (desks.includes('aftersales') && !desks.includes('operations')) return 'aftersales';
  return 'operations';
}
const visible = (ctx: Context, ms: Member[]) =>
  ms.filter((m) => !isScopedManager(ctx.member) || m.region === ctx.member.region);
export async function GET(req: Request) {
  try {
    const ctx = await getContext(req);
    requireManager(ctx);
    return response({ members: visible(ctx, await directory(ctx)) });
  } catch (e) {
    return handleError(e);
  }
}
export async function POST(req: Request) {
  try {
    checkOrigin(req);
    const ctx = await getContext(req);
    requireManager(ctx);
    const text = await req.text();
    if (text.length > 10000) throw new HttpError(413, '提交内容过大');
    const input = schema.parse(JSON.parse(text));
    const desks = [...new Set(input.assignedDesks || (input.role ? [input.role] : []))] as (typeof DESK_IDS)[number][];
    if (!desks.length) throw new HttpError(400, '至少选择一个可进入的工作台');
    let prev: RawMember | null = null;
    if (input.id) {
      prev = await ctx.db
        .prepare('SELECT * FROM members WHERE id=? AND workspace_id=?')
        .bind(input.id, ctx.workspaceId)
        .first<RawMember>();
      if (!prev) throw new HttpError(404, '成员不存在');
      if (prev.role === 'owner') throw new HttpError(403, '系统管理员账号不能通过人员管理调整');
      if (prev.version !== input.version) throw new HttpError(409, '成员信息已更新，请刷新');
      if (prev.id === ctx.member.id) throw new HttpError(403, '自己的权限请由其他管理人员调整');
    }
    const requestedProfession =
      input.professionRole ||
      (input.role as Role | undefined) ||
      (prev?.role as Role | undefined) ||
      inferProfession(desks);
    if (requestedProfession === 'owner') throw new HttpError(403, '不能通过人员管理设置系统管理员');
    // Real management authority is an explicit professional-role change. Only
    // the owner may grant or remove it, preventing peer managers from quietly
    // promoting collaborators or demoting each other through desk checkboxes.
    const previousManager = !!prev && isManagerProfession(prev.role);
    const nextManager = isManagerProfession(requestedProfession);
    if ((previousManager || nextManager) && realRole(ctx.member) !== 'owner')
      throw new HttpError(403, '仅系统管理员可以授予、取消或调整管理岗位');
    if (!desks.includes(deskOf(requestedProfession)))
      throw new HttpError(400, `专业岗位「${requestedProfession}」对应的岗位能力必须包含在授权中`);
    const holder = { role: requestedProfession, accountRole: requestedProfession, assignedDesks: desks };
    const portals = grantedPortals(holder);
    if (!portals.length) throw new HttpError(400, '至少选择一个可进入的工作台');
    const requestedDefault = input.defaultDesk || (prev?.default_desk as (typeof DESK_IDS)[number] | undefined);
    const primary: (typeof DESK_IDS)[number] = requestedDefault
      ? (portalOfDesk(requestedDefault) as (typeof DESK_IDS)[number])
      : (professionPortal(requestedProfession) as (typeof DESK_IDS)[number]);
    if (!portals.includes(primary as never))
      throw new HttpError(400, '默认工作台必须属于已授权工作台');
    input.email = input.email.toLowerCase();
    input.phone = normalizePhone(input.phone);
    if (!input.email && !input.phone) throw new HttpError(400, '邮箱或手机号至少填写一项');
    if (
      input.email &&
      (!z.string().email().safeParse(input.email).success ||
        input.email.endsWith('@phone.internal.invalid'))
    )
      throw new HttpError(400, '请填写有效邮箱');
    if (input.phone && !validPhone(input.phone))
      throw new HttpError(400, '请填写有效的中国大陆手机号');
    if (
      desks.includes('sales') &&
      input.region === '全部分部' &&
      !desks.some((d) => MANAGEMENT_CAPABILITY_DESKS.includes(d))
    )
      throw new HttpError(400, '仅开通销售工作台的成员需选择实际区域；跨区域销售范围需同时开通管理工作台');
    if ((!input.id || input.password) && passwordProblem(input.password || ''))
      throw new HttpError(400, passwordProblem(input.password || ''));
    const now = new Date().toISOString(),
      id = input.id || crypto.randomUUID(),
      email = input.email || internalEmail(id);
    if (isScopedManager(ctx.member) && (input.region !== ctx.member.region || (prev && prev.region !== ctx.member.region)))
      throw new HttpError(403, '分部管理仅可维护本分部普通成员');
    const duplicate = await ctx.db
      .prepare("SELECT id FROM members WHERE (email=? OR (?<>'' AND phone=?)) AND id<>?")
      .bind(email, input.phone, input.phone, id)
      .first();
    if (duplicate) throw new HttpError(400, '邮箱或手机号已被其他成员使用');
    const auditId = crypto.randomUUID(),
      name = input.name || prev?.name || '待完善成员',
      roleValue = requestedProfession;
    const first = prev
      ? ctx.db
          .prepare(
            "UPDATE members SET name=?,email=?,phone=?,role=?,desks=?,default_desk=?,region=?,status=?,version=version+1,updated_at=? WHERE id=? AND workspace_id=? AND version=? AND EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(name, email, input.phone || null, roleValue, JSON.stringify(desks), primary, input.region, input.status, now, id, ctx.workspaceId, input.version, ctx.member.id, ctx.member.version)
      : ctx.db
          .prepare(
            "INSERT INTO members(id,workspace_id,email,phone,name,role,desks,default_desk,region,status,version,created_at,updated_at) SELECT ?,?,?,?,?,?,?,?,?,?,1,?,? WHERE EXISTS(SELECT 1 FROM members WHERE id=? AND status='active' AND version=?)",
          )
          .bind(id, ctx.workspaceId, email, input.phone || null, name, roleValue, JSON.stringify(desks), primary, input.region, input.status, now, now, ctx.member.id, ctx.member.version);
    const prevDTO = prev ? memberDTO(prev) : null;
    const before = prevDTO
      ? {
          role: prevDTO.role,
          desks: grantedDesks(prevDTO),
          portals: grantedPortals(prevDTO),
          defaultDesk: defaultPortal(prevDTO),
        }
      : null;
    const after = {
      role: roleValue,
      desks,
      portals,
      defaultDesk: primary,
    };
    // Audit keeps the before/after role and grants so a transfer/demotion can
    // always be reconstructed from member_audit.
    const audit = {
      action: prev ? '更新人员权限' : '开通成员',
      target: id,
      name,
      roleBefore: before?.role || null,
      roleAfter: after.role,
      desksBefore: before?.desks || [],
      desksAfter: after.desks,
      portalsBefore: before?.portals || [],
      portalsAfter: after.portals,
      defaultDeskBefore: before?.defaultDesk || null,
      defaultDeskAfter: after.defaultDesk,
      region: input.region,
      status: input.status,
      passwordReset: !!input.password,
    };
    const batch = [
      first,
      ctx.db
        .prepare('INSERT INTO member_audit(id,workspace_id,actor_id,data,created_at) SELECT ?,?,?,?,? WHERE changes()=1')
        .bind(auditId, ctx.workspaceId, ctx.member.id, JSON.stringify(audit), now),
    ];
    if (input.password)
      batch.push(
        ctx.db
          .prepare(
            'INSERT INTO credentials(member_id,password_hash,must_change,version,updated_at) SELECT ?,?,1,1,? WHERE EXISTS(SELECT 1 FROM member_audit WHERE id=?) ON CONFLICT(member_id) DO UPDATE SET password_hash=excluded.password_hash,must_change=1,version=credentials.version+1,updated_at=excluded.updated_at',
          )
          .bind(id, await hashPassword(input.password), now, auditId),
      );
    batch.push(
      ctx.db
        .prepare('DELETE FROM auth_sessions WHERE member_id=? AND EXISTS(SELECT 1 FROM member_audit WHERE id=?)')
        .bind(id, auditId),
    );
    const results = await ctx.db.batch(batch);
    if (results[0].meta.changes !== 1)
      throw new HttpError(409, '成员或当前账号权限已更新，请刷新');
    return response({ members: visible(ctx, await directory(ctx)) });
  } catch (e) {
    return handleError(e);
  }
}
