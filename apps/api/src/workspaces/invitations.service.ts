import { Inject, Injectable } from '@nestjs/common';
import type { InvitationResponse, WorkspaceResponse } from '@ai-staff/contracts';
import {
  asSystem,
  DataSource,
  Invitation,
  IsNull,
  Membership,
  MoreThan,
  User,
  Workspace,
  withTenant,
} from '@ai-staff/db';
import { AppError } from '../common/app-error.js';
import { APP_CONFIG, type AppConfig } from '../config/config.module.js';
import { randomToken, sha256 } from '../crypto/crypto.js';
import { Mailer } from '../mail/mail.module.js';
import { invitationEmail } from '../mail/templates.js';
import { RateLimiter } from '../redis/rate-limiter.service.js';
import type { AuthUser } from '../auth/access-token.guard.js';
import type { WorkspaceContext } from './workspace.guard.js';
import { toWorkspaceResponse } from './workspaces.service.js';

const INVITATION_TTL_MS = 7 * 86_400_000;

const toResponse = (invitation: Invitation): InvitationResponse => ({
  id: invitation.id,
  email: invitation.email,
  role: invitation.role,
  expiresAt: invitation.expiresAt.toISOString(),
  createdAt: invitation.createdAt.toISOString(),
});

@Injectable()
export class InvitationsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(Mailer) private readonly mailer: Mailer,
    @Inject(RateLimiter) private readonly limiter: RateLimiter,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** A new invitation to the same address replaces any pending one. */
  async invite(
    ctx: WorkspaceContext,
    inviter: AuthUser,
    email: string,
    role: Invitation['role'],
  ): Promise<InvitationResponse> {
    await this.limiter.consume({ key: `invite:workspace:${ctx.workspaceId}`, max: 50, windowSec: 86_400 });
    const token = randomToken();
    const { invitation, workspaceName } = await withTenant(
      this.db,
      { workspaceId: ctx.workspaceId, userId: ctx.userId },
      async (m) => {
        const alreadyMember = await m
          .createQueryBuilder(Membership, 'membership')
          .innerJoin(User, 'u', 'u.id = membership.user_id')
          .where('membership.workspace_id = :workspaceId AND u.email = :email', { workspaceId: ctx.workspaceId, email })
          .getExists();
        if (alreadyMember) throw AppError.conflict('That person is already a member.');
        await m.update(
          Invitation,
          { workspaceId: ctx.workspaceId, email, acceptedAt: IsNull(), revokedAt: IsNull() },
          { revokedAt: new Date() },
        );
        const saved = await m.save(
          m.create(Invitation, {
            workspaceId: ctx.workspaceId,
            email,
            role,
            tokenHash: sha256(token),
            invitedByUserId: inviter.id,
            expiresAt: new Date(Date.now() + INVITATION_TTL_MS),
            acceptedAt: null,
            revokedAt: null,
          }),
        );
        const workspace = await m.findOneByOrFail(Workspace, { id: ctx.workspaceId });
        return { invitation: saved, workspaceName: workspace.name };
      },
    );
    await this.mailer.send(
      invitationEmail(
        email,
        inviter.name,
        workspaceName,
        `${this.config.APP_URL}/invitations/accept?token=${encodeURIComponent(token)}`,
      ),
    );
    return toResponse(invitation);
  }

  pending(ctx: WorkspaceContext): Promise<InvitationResponse[]> {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, async (m) =>
      (
        await m.find(Invitation, {
          where: {
            workspaceId: ctx.workspaceId,
            acceptedAt: IsNull(),
            revokedAt: IsNull(),
            expiresAt: MoreThan(new Date()),
          },
          order: { createdAt: 'DESC' },
        })
      ).map(toResponse),
    );
  }

  async revoke(ctx: WorkspaceContext, id: string): Promise<void> {
    const result = await withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, (m) =>
      m.update(
        Invitation,
        { id, workspaceId: ctx.workspaceId, acceptedAt: IsNull(), revokedAt: IsNull() },
        { revokedAt: new Date() },
      ),
    );
    if (!result.affected) throw AppError.notFound('Invitation not found.');
  }

  /**
   * The token says which workspace it belongs to, so lookup is a system operation. The signed-in user's email must
   * match the invited address, so a forwarded link can't be used by someone else.
   */
  accept(user: AuthUser, token: string): Promise<WorkspaceResponse> {
    return asSystem(this.db, 'accept an invitation by its token', async (m) => {
      const invitation = await m.findOne(Invitation, {
        where: { tokenHash: sha256(token) },
        lock: { mode: 'pessimistic_write' },
      });
      if (!invitation || invitation.revokedAt || invitation.acceptedAt || invitation.expiresAt <= new Date()) {
        throw new AppError(400, 'invitation_invalid', 'This invitation has expired or was already used.');
      }
      if (invitation.email.toLowerCase() !== user.email.toLowerCase()) {
        throw new AppError(
          403,
          'invitation_email_mismatch',
          `This invitation was sent to a different email address. Sign in as that address to accept it.`,
        );
      }
      const workspace = await m.findOneByOrFail(Workspace, { id: invitation.workspaceId });
      const existing = await m.findOneBy(Membership, { workspaceId: invitation.workspaceId, userId: user.id });
      const membership =
        existing ??
        (await m.save(
          m.create(Membership, { workspaceId: invitation.workspaceId, userId: user.id, role: invitation.role }),
        ));
      await m.update(Invitation, { id: invitation.id }, { acceptedAt: new Date() });
      return toWorkspaceResponse(workspace, membership.role);
    });
  }
}
