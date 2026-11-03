import {
  AuditEntry,
  CompanyFact,
  CompanyProfile,
  type DataSource,
  DomainEvent,
  type EntityManager,
  type FactKind,
  IsNull,
  StaffMember,
  StaffTaskSetting,
  withTenant,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';
import type { RoleRegistry } from '../roles/registry.js';

export class NotFoundError extends Error {}

interface Actor {
  workspaceId: string;
  userId: string;
}

export interface ProfileChanges {
  website?: string | null;
  summary?: string | null;
  voice?: string | null;
  audience?: string | null;
  escalationEmail?: string | null;
}

/**
 * The company brain: the profile and the facts every staff member works from. Facts are never edited in place. A change
 * supersedes the old row, adds a new one and moves the profile version on, then (in the same transaction) withdraws
 * pending drafts that relied on the changed facts and emits `company.facts_changed` for roles that keep their own state.
 */
export class CompanyBrain {
  constructor(
    private readonly db: DataSource,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async profile(workspaceId: string, userId: string | null) {
    return withTenant(this.db, { workspaceId, userId }, async (m) => {
      const profile = await this.ensureProfile(m, workspaceId);
      const facts = await m.find(CompanyFact, {
        where: { workspaceId, supersededAt: IsNull() },
        order: { kind: 'ASC', createdAt: 'ASC' },
      });
      return { profile, facts };
    });
  }

  async updateProfile(actor: Actor, changes: ProfileChanges) {
    return withTenant(this.db, actor, async (m) => {
      const profile = await this.ensureProfile(m, actor.workspaceId);
      await m.update(CompanyProfile, { id: profile.id, workspaceId: actor.workspaceId }, changes);
      await this.audit(m, actor, 'company.profile_updated', profile.id, { fields: Object.keys(changes) });
      return m.findOneByOrFail(CompanyProfile, { id: profile.id });
    });
  }

  /** A fact a person typed in: confirmed from the start. */
  async addFact(actor: Actor, kind: FactKind, text: string) {
    return this.change(actor, 'company.fact_added', async (m, version) => {
      const fact = await m.save(
        m.create(CompanyFact, {
          workspaceId: actor.workspaceId,
          profileVersion: version,
          kind,
          text: text.trim(),
          source: 'owner',
          sourceUrl: null,
          confirmedAt: this.now(),
          supersededAt: null,
        }),
      );
      return { fact, changed: [fact.id] };
    });
  }

  /** Edit = supersede + add, so drafts that used the old wording can tell. Confirms the fact as a person wrote it. */
  async updateFact(actor: Actor, factId: string, text: string) {
    return this.change(actor, 'company.fact_updated', async (m, version) => {
      const old = await this.currentFact(m, actor.workspaceId, factId);
      await m.update(CompanyFact, { id: old.id, workspaceId: actor.workspaceId }, { supersededAt: this.now() });
      const fact = await m.save(
        m.create(CompanyFact, {
          workspaceId: actor.workspaceId,
          profileVersion: version,
          kind: old.kind,
          text: text.trim(),
          source: old.source,
          sourceUrl: old.sourceUrl,
          confirmedAt: this.now(),
          supersededAt: null,
        }),
      );
      return { fact, changed: [old.id, fact.id] };
    });
  }

  /** A website suggestion becomes usable only when a person confirms it. */
  async confirmFact(actor: Actor, factId: string) {
    return this.change(actor, 'company.fact_confirmed', async (m) => {
      const fact = await this.currentFact(m, actor.workspaceId, factId);
      await m.update(CompanyFact, { id: fact.id, workspaceId: actor.workspaceId }, { confirmedAt: this.now() });
      return { fact: { ...fact, confirmedAt: this.now() }, changed: [fact.id] };
    });
  }

  async removeFact(actor: Actor, factId: string) {
    return this.change(actor, 'company.fact_removed', async (m) => {
      const fact = await this.currentFact(m, actor.workspaceId, factId);
      await m.update(CompanyFact, { id: fact.id, workspaceId: actor.workspaceId }, { supersededAt: this.now() });
      return { fact, changed: [fact.id] };
    });
  }

  private async change<T extends { changed: string[] }>(
    actor: Actor,
    action: string,
    work: (m: EntityManager, nextVersion: number) => Promise<T>,
  ): Promise<T> {
    return withTenant(this.db, actor, async (m) => {
      const profile = await this.ensureProfile(m, actor.workspaceId, true);
      const nextVersion = profile.version + 1;
      const result = await work(m, nextVersion);
      await m.update(CompanyProfile, { id: profile.id, workspaceId: actor.workspaceId }, { version: nextVersion });

      // Drafts written from facts that just changed are withdrawn rather than approved on stale ground.
      await m.query(
        `UPDATE work_items SET state = 'superseded', updated_at = now()
          WHERE workspace_id = $1 AND state = 'pending' AND fact_ids && $2::uuid[]`,
        [actor.workspaceId, result.changed],
      );
      await m.save(
        m.create(DomainEvent, {
          workspaceId: actor.workspaceId,
          type: 'company.facts_changed',
          payload: { factIds: result.changed, profileVersion: nextVersion },
          sourceRunId: null,
          dispatchedAt: null,
        }),
      );
      await this.audit(m, actor, action, result.changed.join(','), { profileVersion: nextVersion });
      return result;
    });
  }

  private async ensureProfile(m: EntityManager, workspaceId: string, lock = false): Promise<CompanyProfile> {
    const query = m.getRepository(CompanyProfile).createQueryBuilder('p').where('p.workspaceId = :workspaceId', {
      workspaceId,
    });
    const existing = await (lock ? query.setLock('pessimistic_write') : query).getOne();
    if (existing) return existing;
    await m.query(
      `INSERT INTO company_profiles (id, workspace_id) VALUES ($1, $2)
       ON CONFLICT (workspace_id) DO NOTHING`,
      [uuidv7(), workspaceId],
    );
    return m.findOneByOrFail(CompanyProfile, { workspaceId });
  }

  private async currentFact(m: EntityManager, workspaceId: string, id: string): Promise<CompanyFact> {
    const fact = await m.findOneBy(CompanyFact, { id, workspaceId, supersededAt: IsNull() });
    if (!fact) throw new NotFoundError('That fact does not exist or was already changed.');
    return fact;
  }

  private async audit(m: EntityManager, actor: Actor, action: string, target: string, detail: Record<string, unknown>) {
    await m.save(m.create(AuditEntry, { ...actor, action, target: target.slice(0, 120), detail, ip: null }));
  }
}

/** Hires a staff member: creates it with the role's version and one autonomy-and-schedule setting per task. */
export async function hireStaff(
  db: DataSource,
  registry: RoleRegistry,
  actor: Actor,
  input: { roleKey: string; displayName: string; settings: Record<string, unknown>; signature?: string | null },
) {
  const role = registry.role(input.roleKey);
  const settings = role.settingsSchema.parse(input.settings);
  return withTenant(db, actor, async (m) => {
    const staff = await m.save(
      m.create(StaffMember, {
        workspaceId: actor.workspaceId,
        roleKey: role.key,
        roleVersion: role.version,
        displayName: input.displayName,
        signature: input.signature ?? null,
        disclosure: 'ai_labelled',
        settings,
        state: 'active',
        pausedReason: null,
        dailyCapUsd: null,
      }),
    );
    for (const task of role.tasks) {
      const schedule = task.triggers.find((trigger): trigger is { schedule: string } => 'schedule' in trigger);
      await m.save(
        m.create(StaffTaskSetting, {
          workspaceId: actor.workspaceId,
          staffId: staff.id,
          taskType: task.type,
          autonomy: task.defaultAutonomy,
          schedule: schedule?.schedule ?? null,
          limits: {},
          lastSlotAt: null,
        }),
      );
    }
    await m.save(
      m.create(AuditEntry, {
        ...actor,
        action: 'staff.hired',
        target: staff.id,
        detail: { roleKey: role.key },
        ip: null,
      }),
    );
    return staff;
  });
}
