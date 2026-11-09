import { Controller, Get, Inject, ParseUUIDPipe, Query, UseGuards } from '@nestjs/common';
import { DataSource, withTenant } from '@ai-staff/db';
import { AccessTokenGuard } from '../auth/access-token.guard.js';
import { CurrentWorkspace, RequireRole, type WorkspaceContext, WorkspaceGuard } from '../workspaces/workspace.guard.js';

const date = (value?: string) => {
  const parsed = value ? new Date(value) : undefined;
  return parsed && !Number.isNaN(parsed.getTime()) ? parsed : undefined;
};

/** The audit log of one workspace: every change its people made, newest first. Owners and admins only. */
@Controller('audit')
@UseGuards(AccessTokenGuard, WorkspaceGuard)
@RequireRole('admin')
export class AuditController {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  @Get()
  list(
    @CurrentWorkspace() ctx: WorkspaceContext,
    @Query('user', new ParseUUIDPipe({ optional: true })) userId?: string,
    @Query('q') q?: string,
    @Query('from') from?: string,
    @Query('before') before?: string,
    @Query('limit') limit?: string,
  ) {
    const size = Math.min(Math.max(Number(limit) || 50, 1), 100);
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, async (m) => {
      const rows = (await m.query(
        `SELECT a.id, a.created_at, a.action, a.target, a.detail, a.ip, a.user_id, u.name, u.email
           FROM audit_log a LEFT JOIN users u ON u.id = a.user_id
          WHERE a.workspace_id = $1
            AND ($2::uuid IS NULL OR a.user_id = $2)
            AND ($3::text IS NULL OR a.action ILIKE '%' || $3 || '%' OR a.target ILIKE '%' || $3 || '%')
            AND ($4::timestamptz IS NULL OR a.created_at >= $4)
            AND ($5::timestamptz IS NULL OR a.created_at < $5)
          ORDER BY a.created_at DESC, a.id DESC LIMIT $6`,
        [
          ctx.workspaceId,
          userId ?? null,
          q
            ?.trim()
            .slice(0, 80)
            .replace(/[%_\\]/g, '\\$&') || null,
          date(from) ?? null,
          date(before) ?? null,
          size + 1,
        ],
      )) as {
        id: string;
        created_at: Date;
        action: string;
        target: string;
        detail: Record<string, unknown>;
        ip: string | null;
        user_id: string | null;
        name: string | null;
        email: string | null;
      }[];
      const page = rows.slice(0, size);
      return {
        items: page.map((row) => ({
          id: row.id,
          at: row.created_at,
          action: row.action,
          target: row.target,
          detail: row.detail,
          ip: row.ip,
          user: row.user_id ? { id: row.user_id, name: row.name, email: row.email } : null,
        })),
        // The time of the last row shown: ask for entries before it to see the next page.
        next: rows.length > size ? page[page.length - 1]!.created_at : null,
      };
    });
  }
}
