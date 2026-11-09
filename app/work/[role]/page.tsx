import { redirect, notFound } from 'next/navigation';
import Workspace from '../../workspace';
import Entry from '../../entry';
import { Role, ROLE_IDS, deskOf } from '../../team';
import { pageContext } from '../../server/page-context';
import { HttpError } from '../../server/auth';
export const dynamic = 'force-dynamic';
export default async function Portal({
  params,
}: {
  params: Promise<{ role: string }>;
}) {
  const { role } = await params;
  if (!ROLE_IDS.includes(role as Role)) notFound();
  const desk = deskOf(role as Role);
  if (role !== desk) redirect('/work/' + desk);
  let ctx;
  let error = '';
  try {
    ctx = await pageContext(false, desk);
  } catch (e) {
    if (!(e instanceof HttpError)) throw e;
    if (e.status === 401) redirect('/');
    if (e.status === 423) redirect('/account/security');
    error = e.message;
  }
  return ctx ? (
    <Workspace portalRole={desk} initialMember={ctx.member} />
  ) : (
    <Entry error={error} />
  );
}
