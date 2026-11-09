import { redirect } from 'next/navigation';
import { pageContext } from '../../server/page-context';
import { HttpError } from '../../server/auth';
import Security from './security';
export const dynamic = 'force-dynamic';
export default async function Page() {
  let ctx;
  try {
    ctx = await pageContext(true);
  } catch (e) {
    if (e instanceof HttpError) redirect('/');
    throw e;
  }
  return <Security member={ctx.member} />;
}
