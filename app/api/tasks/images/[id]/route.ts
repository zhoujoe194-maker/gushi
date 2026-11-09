import { getContext, handleError, HttpError } from '../../../../server/auth';
import { inTaskScope, type DeskTask } from '../../../../task-model';
import { requireTaskProject } from '../../../../server/resource-access';
export const dynamic = 'force-dynamic';

export async function GET(
  req: Request,
  route: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await getContext(req, {
      desk: new URL(req.url).searchParams.get('desk') || undefined,
    });
    const { id } = await route.params;
    const row = await ctx.db
      .prepare(
        'SELECT i.content_base64,t.data FROM task_images i JOIN desk_tasks t ON t.id=i.task_id AND t.workspace_id=i.workspace_id WHERE i.id=? AND i.workspace_id=?',
      )
      .bind(id, ctx.workspaceId)
      .first<{ content_base64: string; data: string }>();
    if (!row || !inTaskScope(JSON.parse(row.data) as DeskTask, ctx.member))
      throw new HttpError(404, '图片不存在或无权查看');
    await requireTaskProject(ctx, JSON.parse(row.data) as DeskTask);
    return new Response(Buffer.from(row.content_base64, 'base64'), {
      headers: {
        'Content-Type': 'image/webp',
        'Cache-Control': 'private, no-store',
        'X-Content-Type-Options': 'nosniff',
        'Content-Disposition': `inline; filename="task-image-${id}.webp"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'Cross-Origin-Resource-Policy': 'same-origin',
      },
    });
  } catch (e) {
    return handleError(e);
  }
}
