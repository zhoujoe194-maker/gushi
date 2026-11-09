import { redirect } from 'next/navigation';
import { setupState } from '../server/setup';
import type { SetupState } from './model';
import Setup from './setup';
import './setup.css';

export const dynamic = 'force-dynamic';
export default async function SetupPage() {
  let state: SetupState;
  try {
    state = await setupState();
  } catch {
    state = { status: 'unavailable' };
  }
  if (state.status === 'initialized') redirect('/');
  return <Setup state={state} />;
}
