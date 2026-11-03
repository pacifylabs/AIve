import { Inject, Injectable } from '@nestjs/common';
import type { createLeadRequest, updateLeadRequest } from '@ai-staff/contracts';
import { isSuppressed } from '@ai-staff/core';
import {
  DataSource,
  DomainEvent,
  type EntityManager,
  Lead,
  type LeadState,
  StaffMember,
  withTenant,
} from '@ai-staff/db';
import { isFreeMail, looksLikeEmail, normaliseEmail } from '@ai-staff/mail';
import { parse } from 'csv-parse/sync';
import type { z } from 'zod';
import { AppError } from '../common/app-error.js';
import type { WorkspaceContext } from '../workspaces/workspace.guard.js';

const MAX_ROWS = 1000;

export interface ImportRow {
  line: number;
  email: string;
  name: string | null;
  company: string | null;
  website: string | null;
  timezone: string | null;
  /** `ok` rows are saved on commit; the rest say why they are not. */
  status: 'ok' | 'invalid' | 'duplicate' | 'suppressed' | 'repeated';
}

const clean = (value: unknown, max: number): string | null => {
  const text = typeof value === 'string' ? value.trim() : '';
  return text ? text.slice(0, max) : null;
};

@Injectable()
export class LeadsService {
  constructor(@Inject(DataSource) private readonly db: DataSource) {}

  private tx<T>(ctx: WorkspaceContext, work: (m: EntityManager) => Promise<T>) {
    return withTenant(this.db, { workspaceId: ctx.workspaceId, userId: ctx.userId }, work);
  }

  /** The Sales Manager who works new leads: the longest-serving active one. */
  private async salesStaff(m: EntityManager, workspaceId: string): Promise<StaffMember> {
    const staff = await m.findOne(StaffMember, {
      where: { workspaceId, roleKey: 'sales_manager', state: 'active' },
      order: { createdAt: 'ASC' },
    });
    if (!staff) throw AppError.conflict('Hire a Sales Manager before adding leads.');
    return staff;
  }

  list(ctx: WorkspaceContext, state?: LeadState) {
    return this.tx(ctx, (m) =>
      m.find(Lead, {
        where: { workspaceId: ctx.workspaceId, ...(state ? { state } : {}) },
        order: { createdAt: 'DESC' },
        take: 200,
      }),
    );
  }

  create(ctx: WorkspaceContext, input: z.output<typeof createLeadRequest>) {
    return this.tx(ctx, async (m) => {
      const staff = await this.salesStaff(m, ctx.workspaceId);
      const email = normaliseEmail(input.email);
      if (await m.existsBy(Lead, { workspaceId: ctx.workspaceId, email })) {
        throw AppError.conflict('You already have a lead with that email.');
      }
      if (await isSuppressed(m, ctx.workspaceId, email)) {
        throw AppError.conflict('That address asked not to be contacted, or bounced.');
      }
      return this.insert(m, ctx, staff, { ...input, email });
    });
  }

  private async insert(
    m: EntityManager,
    ctx: WorkspaceContext,
    staff: StaffMember,
    input: {
      name?: string | null;
      company?: string | null;
      email: string;
      website?: string | null;
      timezone?: string | null;
      notes?: string | null;
    },
    source: 'manual' | 'csv' = 'manual',
  ) {
    const lead = await m.save(
      m.create(Lead, {
        workspaceId: ctx.workspaceId,
        name: input.name ?? null,
        company: input.company ?? null,
        email: input.email,
        website: input.website ?? null,
        timezone: input.timezone ?? null,
        source,
        sourceRef: null,
        ownerUserId: ctx.userId,
        assignedStaffId: staff.id,
        state: 'new',
        notes: input.notes ?? null,
      }),
    );
    await m.save(
      m.create(DomainEvent, {
        workspaceId: ctx.workspaceId,
        type: 'lead.created',
        payload: { staffId: staff.id, leadId: lead.id, source },
        sourceRunId: null,
        dispatchedAt: null,
      }),
    );
    return lead;
  }

  /** Reads CSV into rows with a verdict each. Never saves; `import` saves the `ok` rows. */
  private async review(m: EntityManager, workspaceId: string, csv: string): Promise<ImportRow[]> {
    let records: Record<string, unknown>[];
    try {
      records = parse(csv, {
        columns: (header: string[]) => header.map((name) => name.trim().toLowerCase()),
        skip_empty_lines: true,
        relax_column_count: true,
        bom: true,
        trim: true,
      }) as Record<string, unknown>[];
    } catch (error) {
      throw new AppError(
        400,
        'validation_failed',
        `That file could not be read as CSV: ${(error as Error).message}`.slice(0, 300),
        {
          errors: [{ path: 'csv', message: 'Not a valid CSV file.' }],
        },
      );
    }
    if (records.length > MAX_ROWS) {
      throw new AppError(400, 'validation_failed', `Import at most ${MAX_ROWS} leads at a time.`, {
        errors: [{ path: 'csv', message: `More than ${MAX_ROWS} rows.` }],
      });
    }
    if (records.length && !('email' in records[0]!)) {
      throw new AppError(400, 'validation_failed', 'The file needs an "email" column.', {
        errors: [{ path: 'csv', message: 'No email column.' }],
      });
    }
    const existing = new Set(
      (await m.find(Lead, { where: { workspaceId }, select: { email: true } })).map((lead) => lead.email),
    );
    const seen = new Set<string>();
    const rows: ImportRow[] = [];
    for (const [index, record] of records.entries()) {
      const email = normaliseEmail(clean(record.email, 320) ?? '');
      const row: ImportRow = {
        line: index + 2,
        email,
        name: clean(record.name, 160),
        company: clean(record.company, 160),
        website: clean(record.website, 300),
        timezone: clean(record.timezone, 64),
        status: 'ok',
      };
      if (!looksLikeEmail(email)) row.status = 'invalid';
      else if (existing.has(email)) row.status = 'duplicate';
      else if (seen.has(email)) row.status = 'repeated';
      else if (await isSuppressed(m, workspaceId, email)) row.status = 'suppressed';
      seen.add(email);
      rows.push(row);
    }
    return rows;
  }

  async import(ctx: WorkspaceContext, csv: string, commit: boolean) {
    return this.tx(ctx, async (m) => {
      const staff = commit ? await this.salesStaff(m, ctx.workspaceId) : null;
      const rows = await this.review(m, ctx.workspaceId, csv);
      const importable = rows.filter((row) => row.status === 'ok');
      if (commit && staff) {
        for (const row of importable) await this.insert(m, ctx, staff, row, 'csv');
      }
      return {
        committed: commit,
        imported: commit ? importable.length : 0,
        ready: importable.length,
        skipped: rows.length - importable.length,
        // Rows with a company email and no website can still be researched; free-mail ones are written from the record alone.
        withoutResearch: importable.filter((row) => !row.website && isFreeMail(row.email)).length,
        rows: rows.slice(0, 200),
      };
    });
  }

  update(ctx: WorkspaceContext, id: string, input: z.output<typeof updateLeadRequest>) {
    return this.tx(ctx, async (m) => {
      const lead = await m.findOneBy(Lead, { workspaceId: ctx.workspaceId, id });
      if (!lead) throw AppError.notFound('Lead not found.');
      await m.update(
        Lead,
        { id },
        {
          ...(input.state ? { state: input.state } : {}),
          ...(input.notes !== undefined ? { notes: input.notes ?? null } : {}),
        },
      );
      return m.findOneByOrFail(Lead, { id });
    });
  }
}
