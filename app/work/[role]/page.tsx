import { permanentRedirect, redirect, notFound } from 'next/navigation';
import Workspace from '../../workspace';
import Entry from '../../entry';
import {
  PORTAL_IDS,
  Portal,
  ROLE_IDS,
  Role,
  portalOfRole,
} from '../../team';
import { pageContext } from '../../server/page-context';
import { HttpError, type Context } from '../../server/auth';
export const dynamic = 'force-dynamic';
export default async function PortalPage({
  params,
  searchParams,
}: {
  params: Promise<{ role: string }>;
  searchParams: Promise<{ scope?: string }>;
}) {
  const { role } = await params;
  const { scope } = await searchParams;
  let portal: Portal;
  if ((PORTAL_IDS as readonly string[]).includes(role)) {
    portal = role as Portal;
    // D1-RECTIFY: the granular scope switch no longer exists. Old bookmarks
    // such as /work/management?scope=operations are safely redirected to the
    // same workbench without pinning any authority.
    if (scope !== undefined) permanentRedirect('/work/' + portal);
  } else if (ROLE_IDS.includes(role as Role)) {
    // Retired entrances (operations/aftersales/technical/...) land on the real
    // three-workbench entrance; the professional identity still comes from the
    // account role, never from the URL.
    portal = portalOfRole(role as Role);
    permanentRedirect('/work/' + portal);
  } else {
    notFound();
  }
  let ctx: Context | undefined;
  let error = '';
  try {
    ctx = await pageContext(false, portal);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 401) redirect('/');
    if (e.status === 423) redirect('/account/security');
    // An account without this workbench goes back to its granted entrances;
    // the server still denies the data.
    if (e.status === 403) redirect('/workspaces');
    error = e.message;
  }
  return ctx ? (
    <Workspace portal={portal} initialMember={ctx.member} />
  ) : (
    <Entry error={error} />
  );
}
