import Workspace from '../workspace';
import {
  DESK_IDS,
  Desk,
  PORTAL_IDS,
  Portal,
  ROLE_IDS,
  Role,
  SCOPES_IN_PORTAL,
  deskOf,
  portalOfRole,
} from '../team';
import { grantedPortals } from '../access';
import { demoMultiMember } from '../demo-team';
import Security from '../account/security/security';
import DeskSelector from '../workspaces/selector';
import { redirect } from 'next/navigation';
// D1: demo URLs address one of the three workbenches and, optionally, the
// granular scope inside it: /demo?role=management&scope=operations.
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
    scope?: string;
    view?: string;
    account?: string;
  }>;
}) {
  const query = await searchParams;
  if (query.view === 'onboarding')
    return (
      <Security
        demo
        member={{
          ...demoMultiMember,
          mustChangePassword: true,
          profileCompleted: false,
        }}
      />
    );
  if (query.view === 'workspaces')
    return <DeskSelector demo member={demoMultiMember} />;
  const roleParam = query.role || '';
  const isPortal = (PORTAL_IDS as readonly string[]).includes(roleParam);
  const isRole = ROLE_IDS.includes(roleParam as Role);
  const portal: Portal = isPortal
    ? (roleParam as Portal)
    : isRole
      ? portalOfRole(roleParam as Role)
      : 'management';
  const requestedScope =
    DESK_IDS.includes(query.scope as Desk) &&
    SCOPES_IN_PORTAL[portal].includes(query.scope as Desk)
      ? (query.scope as Desk)
      : undefined;
  // Legacy demo links such as /demo?role=operations keep their granular scale.
  const legacyScope =
    isRole && !isPortal && deskOf(roleParam as Role) !== portal
      ? deskOf(roleParam as Role)
      : undefined;
  const scope = requestedScope || legacyScope;
  const multi = query.account === 'multi';
  if (multi && !grantedPortals(demoMultiMember).includes(portal))
    redirect('/demo?role=sales&account=multi');
  return (
    <Workspace
      portal={portal}
      initialScope={scope}
      demoEnabled
      demoAccount={multi}
      demoScope={scope}
    />
  );
}
