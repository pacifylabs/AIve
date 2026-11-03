import { Inject, Injectable } from '@nestjs/common';
import type { hireStaffRequest } from '@ai-staff/contracts';
import { hireStaff, RoleRegistry } from '@ai-staff/core';
import { AuditEntry, DataSource, Mailbox, StaffMember, withTenant } from '@ai-staff/db';
import type { z } from 'zod';
import { ZodError } from 'zod';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const fieldErrors = (error: ZodError) =>
  error.issues.map((issue) => ({ path: ['settings', ...issue.path].join('.'), message: issue.message }));

/** Hiring and a role's settings. The role's own schema decides what a valid setting is. */
@Injectable()
export class StaffAdminService {
  constructor(
    @Inject(DataSource) private readonly db: DataSource,
    @Inject(RoleRegistry) private readonly registry: RoleRegistry,
  ) {}

  roles() {
    return this.registry.allRoles().map((role) => ({
      key: role.key,
      name: role.name,
      summary: role.summary,
      jobDescription: role.jobDescription,
      interview: role.interview.map(({ key, question }) => ({ key, question })),
    }));
  }

  async hire(ctx: WorkspaceContext, input: z.output<typeof hireStaffRequest>) {
    if (!this.registry.hasRole(input.roleKey)) throw AppError.notFound('There is no such role.');
    await this.assertMailbox(ctx, input.settings);
    try {
      const staff = await hireStaff(this.db, this.registry, ctx, {
        roleKey: input.roleKey,
        displayName: input.displayName,
        settings: input.settings,
        signature: input.signature ?? null,
      });
      return staff;
    } catch (error) {
      if (error instanceof ZodError) {
        throw new AppError(400, 'validation_failed', 'Some settings are not valid.', { errors: fieldErrors(error) });
      }
      throw error;
    }
  }

  async updateSettings(ctx: WorkspaceContext, id: string, settings: Record<string, unknown>) {
    await this.assertMailbox(ctx, settings);
    return withTenant(this.db, ctx, async (m) => {
      const staff = await m.findOneBy(StaffMember, { workspaceId: ctx.workspaceId, id });
      if (!staff || staff.state === 'archived') throw AppError.notFound('Staff member not found.');
      let parsed: Record<string, unknown>;
      try {
        // Merged over what is there, so a partial update does not reset the rest to defaults.
        parsed = this.registry.role(staff.roleKey).settingsSchema.parse({ ...staff.settings, ...settings });
      } catch (error) {
        if (error instanceof ZodError) {
          throw new AppError(400, 'validation_failed', 'Some settings are not valid.', { errors: fieldErrors(error) });
        }
        throw error;
      }
      await m.save(Object.assign(staff, { settings: parsed }));
      await m.save(
        m.create(AuditEntry, {
          workspaceId: ctx.workspaceId,
          userId: ctx.userId,
          action: 'staff.settings_updated',
          target: id,
          detail: { keys: Object.keys(settings) },
        }),
      );
      return staff;
    });
  }

  /** A staff member can only send from a mailbox of its own workspace. */
  private async assertMailbox(ctx: WorkspaceContext, settings: Record<string, unknown>) {
    const mailboxId = settings.mailboxId;
    if (typeof mailboxId !== 'string') return;
    const found = await withTenant(this.db, ctx, (m) =>
      m.existsBy(Mailbox, { workspaceId: ctx.workspaceId, id: mailboxId }),
    );
    if (!found) {
      throw new AppError(400, 'validation_failed', 'That mailbox is not connected.', {
        errors: [{ path: 'settings.mailboxId', message: 'Choose one of your connected mailboxes.' }],
      });
    }
  }
}
