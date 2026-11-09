import { env } from '../../server/node-env';

export const dynamic = 'force-dynamic';
export async function GET() {
  try {
    const migration = await env.DB.prepare(
      'SELECT 1 AS ready FROM __app_migrations WHERE name=?',
    )
      .bind('0011_management_meetings.sql')
      .first();
    if (!migration) throw new Error('Database migrations incomplete');
    await env.DB.prepare('SELECT id FROM members LIMIT 0').all();
    return Response.json(
      { status: 'ok' },
      { headers: { 'Cache-Control': 'no-store' } },
    );
  } catch {
    return Response.json(
      { status: 'unavailable' },
      {
        status: 503,
        headers: { 'Cache-Control': 'no-store' },
      },
    );
  }
}
