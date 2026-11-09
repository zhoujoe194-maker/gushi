import { redirect } from 'next/navigation';
import { pageContext } from '../server/page-context';
import { HttpError } from '../server/auth';
import { needsOnboarding, grantedDesks, defaultDesk } from '../access';
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
  if (grantedDesks(member).length === 1)
    redirect('/work/' + defaultDesk(member));
  return <DeskSelector member={member} />;
}
