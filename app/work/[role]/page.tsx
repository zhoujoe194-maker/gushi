import { permanentRedirect, redirect, notFound } from 'next/navigation';
import Workspace from '../../workspace';
import Entry from '../../entry';
import {
  DESK_IDS,
  Desk,
  PORTAL_IDS,
  Portal,
  ROLE_IDS,
  Role,
  SCOPES_IN_PORTAL,
  deskOf,
  portalOfDesk,
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
  const scopeIn = (portal: Portal) =>
    DESK_IDS.includes(scope as Desk) && SCOPES_IN_PORTAL[portal].includes(scope as Desk)
      ? (scope as Desk)
      : undefined;
  let portal: Portal;
  let initialScope: Desk | undefined;
  if ((PORTAL_IDS as readonly string[]).includes(role)) {
    portal = role as Portal;
    initialScope = scopeIn(portal);
  } else if (ROLE_IDS.includes(role as Role)) {
    // D1: granular desks and legacy role identities are not workbench
    // entrances any more. They keep their meaning by redirecting to the
    // matching workbench and pinning the same granular scope inside it.
    const desk = deskOf(role as Role);
    portal = portalOfDesk(desk);
    const pinned = scopeIn(portal) || (desk === portal ? undefined : desk);
    permanentRedirect('/work/' + portal + (pinned ? '?scope=' + pinned : ''));
  } else {
    notFound();
  }
  let ctx: Context | undefined;
  let error = '';
  try {
    ctx = await pageContext(false, portal, initialScope);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 401) redirect('/');
    if (e.status === 423) redirect('/account/security');
    // D1: a sales-only account opening /work/finance goes back to the
    // selector of its granted workbenches; the server still denies the data.
    if (e.status === 403) redirect('/workspaces');
    error = e.message;
  }
  return ctx ? (
    <Workspace
      portal={portal}
      initialScope={initialScope}
      initialMember={ctx.member}
    />
  ) : (
    <Entry error={error} />
  );
}
