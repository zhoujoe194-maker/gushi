import {
  Desk,
  Member,
  Portal,
  PORTAL_IDS,
  Role,
  deskOf,
  grantedDesks,
  managementCapability,
  portalOfDesk,
  realRole,
} from './team';
export { grantedDesks };
// D1-RECTIFY: only sales / management / finance are workbenches. The legacy
// granular desk grants (sales, management, finance, operations, aftersales)
// are preserved as persisted authorization/capability values so old accounts,
// default_desk rows, tasks and messages keep their original meaning. They are
// never a user-selectable scope and never promoted to manager authority.
export const hasDesk = (
  m: Pick<Member, 'role' | 'assignedDesks' | 'accountRole'>,
  desk: Desk,
) => grantedDesks(m).includes(desk);
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
// A legacy default_desk is read-adapted to its workbench: operations/aftersales
// become management. Nothing is rewritten in the database.
export const defaultPortal = (m: Member): Portal => {
  const portals = grantedPortals(m);
  if (m.defaultDesk && portals.includes(m.defaultDesk)) return m.defaultDesk;
  return portals[0] || portalOfDesk(deskOf(realRole(m)));
};
export const professionPortal = (role: Role): Portal =>
  portalOfDesk(deskOf(role));
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
// Enter one of the three workbenches. The real professional identity is never
// changed here, so a collaborator mapped into the management workbench cannot
// become a manager, and the owner cannot silently gain finance write authority
// in the management workbench.
export function inPortal(m: Member, portal: Portal): Member {
  const real = realRole(m);
  const base: Member = { ...m, role: real, accountRole: real };
  return {
    ...base,
    portal,
    capability: portal === 'management' ? managementCapability(base) : portal,
  };
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
