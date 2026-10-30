import { Inject, Injectable } from '@nestjs/common';
import type { MemberResponse, WorkspaceResponse } from '@ai-staff/contracts';
import {
  asSystem,
  DataSource,
  type EntityManager,
  Membership,
  type MembershipRole,
  User,
  Workspace,
  withTenant,
} from '@ai-staff/db';
import { randomBytes } from 'node:crypto';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from './workspace.guard.js';

export const toWorkspaceResponse = (workspace: Workspace, role: MembershipRole): WorkspaceResponse => ({
  id: workspace.id,
  name: workspace.name,
  slug: workspace.slug,
  timezone: workspace.timezone,
  country: workspace.country,
  role,
});

function slugFor(name: string): string {
  const base =
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'workspace';
  return `${base}-${randomBytes(3).toString('hex')}`;
}

@Injectable()
export class WorkspacesService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private inWorkspace<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>): Promise<T> {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  /** The creator becomes the owner. Runs as a system operation because the workspace has no tenant context yet. */
  async create(
    userId: string,
    input: { name: string; timezone: string; country?: string | undefined },
  ): Promise<WorkspaceResponse> {
    return asSystem(this.db, 'create a workspace and its first owner', async (m) => {
      const workspace = await m.save(
        m.create(Workspace, {
          name: input.name,
          slug: slugFor(input.name),
          timezone: input.timezone,
          country: input.country ?? null,
          state: 'active',
        }),
      );
      await m.save(m.create(Membership, { workspaceId: workspace.id, userId, role: 'owner' }));
      return toWorkspaceResponse(workspace, 'owner');
    });
  }

  get(ctx: WorkspaceContext): Promise<WorkspaceResponse> {
    return this.inWorkspace(ctx, async (m) =>
      toWorkspaceResponse(await m.findOneByOrFail(Workspace, { id: ctx.workspaceId }), ctx.role),
    );
  }

  update(
    ctx: WorkspaceContext,
    changes: { name?: string | undefined; timezone?: string | undefined; country?: string | null | undefined },
  ): Promise<WorkspaceResponse> {
    return this.inWorkspace(ctx, async (m) => {
      const patch = Object.fromEntries(Object.entries(changes).filter(([, value]) => value !== undefined));
      await m.update(Workspace, { id: ctx.workspaceId }, patch);
      return toWorkspaceResponse(await m.findOneByOrFail(Workspace, { id: ctx.workspaceId }), ctx.role);
    });
  }

  members(ctx: WorkspaceContext): Promise<MemberResponse[]> {
    return this.inWorkspace(ctx, async (m) => {
      const rows = await m
        .createQueryBuilder(Membership, 'membership')
        .innerJoin(User, 'u', 'u.id = membership.user_id')
        .select([
          'membership.user_id AS "userId"',
          'u.name AS name',
          'u.email AS email',
          'membership.role AS role',
          'membership.created_at AS "joinedAt"',
        ])
        .where('membership.workspace_id = :workspaceId', { workspaceId: ctx.workspaceId })
        .orderBy('membership.created_at', 'ASC')
        .getRawMany<Omit<MemberResponse, 'joinedAt'> & { joinedAt: Date }>();
      return rows.map((row) => ({ ...row, joinedAt: new Date(row.joinedAt).toISOString() }));
    });
  }

  async changeRole(ctx: WorkspaceContext, userId: string, role: MembershipRole): Promise<void> {
    await this.inWorkspace(ctx, async (m) => {
      const membership = await this.lockedMembership(m, ctx.workspaceId, userId);
      if (membership.role === 'owner' && role !== 'owner') await this.assertAnotherOwner(m, ctx.workspaceId);
      await m.update(Membership, { id: membership.id }, { role });
    });
  }

  async remove(ctx: WorkspaceContext, userId: string): Promise<void> {
    await this.inWorkspace(ctx, async (m) => {
      const membership = await this.lockedMembership(m, ctx.workspaceId, userId);
      if (membership.role === 'owner') await this.assertAnotherOwner(m, ctx.workspaceId);
      await m.delete(Membership, { id: membership.id });
    });
  }

  private async lockedMembership(m: EntityManager, workspaceId: string, userId: string): Promise<Membership> {
    // Lock every membership row of the workspace so two owners can't demote each other at the same moment.
    await m.query(`SELECT id FROM memberships WHERE workspace_id = $1 FOR UPDATE`, [workspaceId]);
    const membership = await m.findOneBy(Membership, { workspaceId, userId });
    if (!membership) throw AppError.notFound('Member not found.');
    return membership;
  }

  private async assertAnotherOwner(m: EntityManager, workspaceId: string): Promise<void> {
    const owners = await m.countBy(Membership, { workspaceId, role: 'owner' });
    if (owners <= 1)
      throw new AppError(409, 'last_owner', 'A workspace needs at least one owner. Make someone else an owner first.');
  }
}
