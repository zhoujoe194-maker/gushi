import Entry from '../../entry';
import { PORTAL_IDS, Portal, ROLE_IDS, Role, portalOfRole } from '../../team';
import { notFound } from 'next/navigation';
export default async function Login({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  // D1: login links accept a workbench id; legacy role ids still land on the
  // same login page (the workbench is resolved after login).
  const portal = (PORTAL_IDS as readonly string[]).includes(role)
    ? (role as Portal)
    : ROLE_IDS.includes(role as Role)
      ? portalOfRole(role as Role)
      : null;
  if (!portal) notFound();
  return <Entry />;
}
