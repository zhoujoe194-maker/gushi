import { redirect } from 'next/navigation';
import { pageContext } from '../server/page-context';
import { HttpError } from '../server/auth';
import { needsOnboarding, grantedPortals } from '../access';
import DeskSelector from './selector';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let ctx;
  try {
    ctx = await pageContext(true);
  } catch (e) {
    if (e instanceof HttpError) redirect('/');
    throw e;
  }
  const { member } = ctx;
  if (needsOnboarding(member)) redirect('/account/security');
  const portals = grantedPortals(member);
  // D1: one workbench means a direct entrance; several means show the three
  // workbench cards.
  if (portals.length === 1) redirect('/work/' + portals[0]);
  return <DeskSelector member={member} />;
}
