import { timingSafeEqual } from 'node:crypto';
import { env } from './node-env';
import { digestToken } from './password';
import { HttpError } from './auth';
import type { SetupState } from '../setup/model';

export function setupConfiguration() {
  const email = (process.env.INITIAL_ADMIN_EMAIL || '').trim().toLowerCase();
  const token = (process.env.INITIAL_SETUP_TOKEN || '').trim();
  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 200 ||
    !/^[A-Za-z0-9_-]{24,128}$/.test(token) ||
    new Set(token).size < 8
  )
    return null;
  return { email, token };
}

export async function setupState(): Promise<SetupState> {
  // Any existing account closes bootstrap, including disabled owners and legacy members.
  // Recovery is an explicit administrator operation, never public re-registration.
  if (await env.DB.prepare('SELECT id FROM members LIMIT 1').first())
    return { status: 'initialized' };
  const config = setupConfiguration();
  if (!config) return { status: 'configuration_needed' };
  const [local, domain] = config.email.split('@');
  return { status: 'ready', emailHint: local.slice(0, 1) + '***@' + domain };
}

export async function verifySetupToken(value: string, expected: string) {
  return timingSafeEqual(
    Buffer.from(await digestToken(value), 'hex'),
    Buffer.from(await digestToken(expected), 'hex'),
  );
}

export async function reserveSetupAttempt(req: Request) {
  const now = Date.now(),
    windowMs = 15 * 60 * 1000;
  const ip = env.TRUST_PROXY
    ? req.headers.get('x-real-ip') || 'unknown'
    : 'local';
  const key = await digestToken('setup-ip:' + ip);
  const result = await env.DB.prepare(
    'INSERT INTO login_attempts(key,attempts,window_start,locked_until) VALUES(?,1,?,0) ON CONFLICT(key) DO UPDATE SET attempts=CASE WHEN window_start<? THEN 1 ELSE attempts+1 END,window_start=CASE WHEN window_start<? THEN ? ELSE window_start END RETURNING attempts',
  )
    .bind(key, now, now - windowMs, now - windowMs, now)
    .first<{ attempts: number }>();
  if (!result || result.attempts > 10)
    throw new HttpError(429, '启用尝试次数过多，请在 15 分钟后重试');
}
