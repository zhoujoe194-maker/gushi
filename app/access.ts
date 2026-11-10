import {
  DESK_IDS,
  Desk,
  Member,
  Role,
  deskOf,
  Portal,
  PORTAL_IDS,
  portalOfDesk,
  SCOPES_IN_PORTAL,
} from './team';
// D1: an account's granular desk grants are unchanged. They are the only
// authorization source; the three workbench entrances are derived from them,
// never granted directly. Operations/aftersales keep their own desk identity
// inside the management workbench.
export function grantedDesks(
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
): Desk[] {
  if (m.assignedDesks)
    return [...new Set(m.assignedDesks.filter((d) => DESK_IDS.includes(d)))];
  return (m.accountRole || m.role) === 'owner'
    ? [...DESK_IDS]
    : [deskOf(m.accountRole || m.role)];
}
export const hasDesk = (
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
  desk: Desk,
) => grantedDesks(m).includes(desk);
export function scopesInPortal(
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
  portal: Portal,
): Desk[] {
  const allowed = new Set<Desk>(SCOPES_IN_PORTAL[portal]);
  return grantedDesks(m).filter((d) => allowed.has(d));
}
export function grantedPortals(
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
): Portal[] {
  const found = new Set(grantedDesks(m).map(portalOfDesk));
  return PORTAL_IDS.filter((p) => found.has(p));
}
export const hasPortal = (
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
  portal: Portal,
) => grantedPortals(m).includes(portal);
export const defaultDesk = (m: Member): Desk =>
  m.defaultDesk && hasDesk(m, m.defaultDesk)
    ? m.defaultDesk
    : grantedDesks(m)[0] || deskOf(m.role);
// The scope used inside a workbench. Management scope is only ever entered
// through an explicit management desk grant; an ordinary operations or
// aftersales account can never fall back into it.
export function preferredScope(
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
  portal: Portal,
  requested?: string,
): Desk {
  const scopes = scopesInPortal(m, portal);
  if (requested && scopes.includes(requested as Desk))
    return requested as Desk;
  if (portal === 'management' && scopes.includes('management'))
    return 'management';
  const own = deskOf(m.accountRole || m.role);
  if (scopes.includes(own)) return own;
  return scopes[0] || own;
}
export const defaultPortal = (m: Member): Portal =>
  portalOfDesk(defaultDesk(m));
// Persist a sensible primary identity when grants change. An existing role is
// kept whenever its granular desk is still granted, so technical/logistics and
// other specialist identities survive account edits.
export function roleForScopes(
  scopes: Desk[],
  preferred?: Role | null,
): Role {
  if (preferred && scopes.includes(deskOf(preferred))) return preferred;
  const priority: Desk[] = [
    'management',
    'sales',
    'finance',
    'operations',
    'aftersales',
  ];
  return (priority.find((d) => scopes.includes(d)) || 'operations') as Role;
}
export const needsOnboarding = (m: Member) =>
  !!m.mustChangePassword || m.profileCompleted === false;
export const entryDestination = (m: Member) => {
  const portals = grantedPortals(m);
  return needsOnboarding(m)
    ? '/account/security'
    : portals.length > 1
      ? '/workspaces'
      : '/work/' + (portals[0] || defaultPortal(m));
};
// Enter a workbench without changing the account's real role beyond the
// granular scope selected inside that workbench. The effective role below is
// always derived from the granular scope, exactly like the five-desk phase.
export function inPortal(m: Member, portal: Portal, scope?: string): Member {
  const scopes = scopesInPortal(m, portal);
  const chosen = preferredScope(m, portal, scope);
  const base = m.accountRole || m.role;
  return {
    ...m,
    portal,
    scope: chosen,
    scopes: scopes.length ? scopes : [chosen],
    role: deskOf(base) === chosen ? base : chosen,
  };
}
export function inDesk(m: Member, desk: Desk): Member {
  return inPortal(m, portalOfDesk(desk), desk);
}
export function realNameProblem(value: string) {
  const name = value.trim();
  return name.length < 2 ||
    name.length > 50 ||
    !/^\p{L}[\p{L}\p{M} .·'’-]*\p{L}$/u.test(name)
    ? '请填写 2–50 个字的真实姓名，可使用中文或英文'
    : /^(待完善成员|公司管理员|未命名|管理员|测试用户|员工)$/.test(name)
      ? '请填写你本人的真实姓名'
      : '';
}
export type AccessRole = Role;
