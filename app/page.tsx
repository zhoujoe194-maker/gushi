import Entry from './entry';
import { redirect } from 'next/navigation';
import { setupState } from './server/setup';
import { pageContext } from './server/page-context';
import { HttpError } from './server/auth';
import type { Session } from './team';
export const dynamic = 'force-dynamic';
export default async function Home() {
  let initialized = false;
  let setupReady = false;
  try {
    const state = await setupState();
    initialized = state.status === 'initialized';
    setupReady = state.status === 'ready';
  } catch {}
  if (setupReady) redirect('/setup');
  let session: Session | undefined;
  let error: string | undefined;
  try {
    const ctx = await pageContext(true);
    session = { member: ctx.member, isOwner: ctx.member.role === 'owner' };
  } catch (e) {
    error = e instanceof HttpError && e.status !== 401 ? e.message : undefined;
  }
  return <Entry initialized={initialized} session={session} error={error} />;
}
