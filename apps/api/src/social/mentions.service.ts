import { Inject, Injectable } from '@nestjs/common';
import { AccountTokens } from '@ai-staff/core';
import { AuditEntry, ConnectedAccount, DataSource, type EntityManager, StaffMember, withTenant } from '@ai-staff/db';
import { ProviderError, type SocialNetwork, SocialProviders } from '@ai-staff/social';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

export interface Mention {
  network: SocialNetwork;
  handle: string;
  name: string;
  verified: boolean;
}

/**
 * Accounts a person saved so the staff member may tag them. They live in the Social staff's settings, where the guardrail
 * reads them. Where the network can say whether an account exists (X, Telegram) and the workspace has an account on that
 * network to ask with, it is checked and marked verified; otherwise it is saved as the person's word and marked so.
 */
@Injectable()
export class MentionsService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(SocialProviders) private readonly providers: SocialProviders,
    @Inject(AccountTokens) private readonly tokens: AccountTokens,
  ) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  private staff(m: EntityManager, ctx: WorkspaceContext) {
    return m.findOne(StaffMember, {
      where: { workspaceId: ctx.workspaceId, roleKey: 'social_media', state: 'active' },
      order: { createdAt: 'ASC' },
    });
  }

  list(ctx: WorkspaceContext): Promise<Mention[]> {
    return this.tx(ctx, async (m) => {
      const staff = await this.staff(m, ctx);
      return ((staff?.settings.mentions as Mention[] | undefined) ?? []).map((mention) => ({ ...mention }));
    });
  }

  async add(ctx: WorkspaceContext, input: { network: SocialNetwork; handle: string }) {
    const { staff, existing, asker } = await this.tx(ctx, async (m) => {
      const staff = await this.staff(m, ctx);
      if (!staff) throw AppError.conflict('Hire a Social Media Staff member first.');
      const asker = await m.findOne(ConnectedAccount, {
        where: { workspaceId: ctx.workspaceId, network: input.network },
        order: { createdAt: 'ASC' },
      });
      return { staff, existing: (staff.settings.mentions as Mention[] | undefined) ?? [], asker };
    });
    if (existing.some((m) => m.network === input.network && m.handle.toLowerCase() === input.handle.toLowerCase())) {
      throw AppError.conflict('That account is already saved.');
    }
    if (existing.length >= 50) throw AppError.conflict('You can save up to 50 accounts.');

    let name = '';
    let verified = false;
    const provider = this.providers.get(input.network);
    if (provider.lookupAccount && asker && asker.health !== 'broken') {
      try {
        const secrets = await this.tokens.fresh(asker);
        const found = await provider.lookupAccount({ accessToken: secrets.accessToken, handle: input.handle });
        if (!found) {
          throw new AppError(400, 'validation_failed', `${input.network} has no account called @${input.handle}.`, {
            errors: [{ path: 'handle', message: `${input.network} has no account called @${input.handle}.` }],
          });
        }
        name = found.name;
        verified = true;
      } catch (error) {
        if (error instanceof ProviderError) {
          throw new AppError(400, 'validation_failed', `Could not check that with ${input.network}: ${error.message}`, {
            errors: [{ path: 'handle', message: `Could not check that with ${input.network}: ${error.message}` }],
          });
        }
        throw error;
      }
    }
    const saved: Mention = { network: input.network, handle: input.handle, name, verified };
    await this.tx(ctx, async (m) => {
      await m.update(
        StaffMember,
        { id: staff.id },
        { settings: { ...staff.settings, mentions: [...existing, saved] } },
      );
      await this.audit(m, ctx, 'social.mention_saved', `${input.network}:${input.handle}`);
    });
    return saved;
  }

  remove(ctx: WorkspaceContext, network: string, handle: string) {
    return this.tx(ctx, async (m) => {
      const staff = await this.staff(m, ctx);
      const existing = (staff?.settings.mentions as Mention[] | undefined) ?? [];
      const kept = existing.filter(
        (item) => !(item.network === network && item.handle.toLowerCase() === handle.toLowerCase()),
      );
      if (!staff || kept.length === existing.length) throw AppError.notFound('That account is not saved.');
      await m.update(StaffMember, { id: staff.id }, { settings: { ...staff.settings, mentions: kept } });
      await this.audit(m, ctx, 'social.mention_removed', `${network}:${handle}`);
    });
  }

  private audit(m: EntityManager, ctx: WorkspaceContext, action: string, target: string) {
    return m.save(
      m.create(AuditEntry, { workspaceId: ctx.workspaceId, userId: ctx.userId, action, target, detail: {} }),
    );
  }
}
