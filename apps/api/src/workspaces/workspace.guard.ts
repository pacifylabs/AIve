import {
  type CanActivate,
  createParamDecorator,
  type ExecutionContext,
  Inject,
  Injectable,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource, Membership, type MembershipRole, withTenant } from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import { isUuid } from '../common/uuid.pipe.js';
import type { AuthedRequest } from '../auth/access-token.guard.js';

export interface WorkspaceContext {
  workspaceId: string;
  userId: string;
  role: MembershipRole;
}

type WorkspaceRequest = AuthedRequest & { workspace: WorkspaceContext };

const RANK: Record<MembershipRole, number> = { member: 1, admin: 2, owner: 3 };
const MIN_ROLE = 'workspace:min-role';

/** The lowest role allowed on a route. Without it, any member may call the route. */
export const RequireRole = (role: MembershipRole) => SetMetadata(MIN_ROLE, role);

/**
 * Resolves `X-Workspace-Id` to the caller's membership. Must run after AccessTokenGuard. Unknown workspaces and
 * workspaces the caller doesn't belong to both answer 404, so IDs can't be probed for existence.
 */
@Injectable()
export class WorkspaceGuard implements CanActivate {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Reflector) private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<WorkspaceRequest>();
    const workspaceId = request.headers['x-workspace-id'];
    if (!isUuid(workspaceId)) throw AppError.notFound('Workspace not found.');
    const userId = request.user.id;
    const membership = await withTenant(this.db, { workspaceId, userId }, (m) =>
      m.findOneBy(Membership, { workspaceId, userId }),
    );
    if (!membership) throw AppError.notFound('Workspace not found.');

    const required = this.reflector.getAllAndOverride<MembershipRole | undefined>(MIN_ROLE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (required && RANK[membership.role] < RANK[required]) throw AppError.forbidden();

    request.workspace = { workspaceId, userId, role: membership.role };
    return true;
  }
}

export const CurrentWorkspace = createParamDecorator((_data: unknown, context: ExecutionContext): WorkspaceContext => {
  return context.switchToHttp().getRequest<WorkspaceRequest>().workspace;
});
