import Workspace from '../workspace';
import {
  PORTAL_IDS,
  Portal,
  ROLE_IDS,
  Role,
  portalOfRole,
} from '../team';
import { grantedPortals } from '../access';
import { demoMultiMember } from '../demo-team';
import Security from '../account/security/security';
import DeskSelector from '../workspaces/selector';
import { redirect } from 'next/navigation';
// D1-RECTIFY: demo URLs address one of the three workbenches. Retired
// operations/aftersales/role URLs map to a workbench; there is no scope switch.
export default async function Demo({
  searchParams,
}: {
  searchParams: Promise<{
    role?: string;
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
  const multi = query.account === 'multi';
  if (multi && !grantedPortals(demoMultiMember).includes(portal))
    redirect('/demo?role=sales&account=multi');
  return <Workspace portal={portal} demoEnabled demoAccount={multi} />;
}
