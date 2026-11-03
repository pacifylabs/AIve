import { Column, Entity, Index, type ValueTransformer } from 'typeorm';
import { WorkspaceScopedEntity } from './base.entity.js';

/** Postgres returns `numeric` as a string to keep precision; amounts here are small enough for a JS number. */
const numeric: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// ---- Company brain ---------------------------------------------------------------------------------------------

export type PrefillState = 'none' | 'queued' | 'running' | 'done' | 'failed';

@Entity('company_profiles')
export class CompanyProfile extends WorkspaceScopedEntity {
  /** Moves on whenever a fact changes, so drafts can record which version of the truth they used. */
  @Column({ type: 'integer', default: 1 })
  version: number;

  @Column({ type: 'varchar', length: 300, nullable: true })
  website: string | null;

  @Column({ type: 'text', nullable: true })
  summary: string | null;

  @Column({ type: 'text', nullable: true })
  voice: string | null;

  @Column({ type: 'text', nullable: true })
  audience: string | null;

  @Column({ type: 'citext', nullable: true })
  escalationEmail: string | null;

  @Column({ type: 'varchar', length: 16, default: 'none' })
  prefillState: PrefillState;

  @Column({ type: 'varchar', length: 300, nullable: true })
  prefillError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  prefilledAt: Date | null;
}

export type FactKind = 'offering' | 'offer' | 'price' | 'claim' | 'banned' | 'link_domain' | 'faq';
export const FACT_KINDS: readonly FactKind[] = ['offering', 'offer', 'price', 'claim', 'banned', 'link_domain', 'faq'];

@Entity('company_facts')
export class CompanyFact extends WorkspaceScopedEntity {
  @Column({ type: 'integer' })
  profileVersion: number;

  @Column({ type: 'varchar', length: 16 })
  kind: FactKind;

  @Column({ type: 'varchar', length: 1000 })
  text: string;

  @Column({ type: 'varchar', length: 16 })
  source: 'owner' | 'website';

  @Column({ type: 'varchar', length: 500, nullable: true })
  sourceUrl: string | null;

  /** Facts read from the website are suggestions until a person confirms them; models only use confirmed facts. */
  @Column({ type: 'timestamptz', nullable: true })
  confirmedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  supersededAt: Date | null;
}

// ---- Staff -----------------------------------------------------------------------------------------------------

export type StaffState = 'active' | 'paused' | 'archived';
export type Autonomy = 'off' | 'draft' | 'act';

@Entity('staff_members')
export class StaffMember extends WorkspaceScopedEntity {
  @Column({ type: 'varchar', length: 40 })
  roleKey: string;

  @Column({ type: 'integer' })
  roleVersion: number;

  @Column({ type: 'varchar', length: 80 })
  displayName: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  signature: string | null;

  @Column({ type: 'varchar', length: 16, default: 'ai_labelled' })
  disclosure: 'named_human' | 'ai_labelled';

  @Column({ type: 'jsonb', default: {} })
  settings: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  state: StaffState;

  @Column({ type: 'varchar', length: 300, nullable: true })
  pausedReason: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: numeric })
  dailyCapUsd: number | null;
}

@Entity('staff_task_settings')
@Index(['staffId', 'taskType'], { unique: true })
export class StaffTaskSetting extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'varchar', length: 80 })
  taskType: string;

  @Column({ type: 'varchar', length: 8 })
  autonomy: Autonomy;

  /** Five-field cron in the workspace's timezone, or null for tasks that only run on events or on request. */
  @Column({ type: 'varchar', length: 100, nullable: true })
  schedule: string | null;

  @Column({ type: 'jsonb', default: {} })
  limits: Record<string, number>;

  @Column({ type: 'timestamptz', nullable: true })
  lastSlotAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  consecutiveRejections: number;

  @Column({ type: 'timestamptz', nullable: true })
  demotedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  demotedReason: string | null;
}

@Entity('promotion_offers')
export class PromotionOffer extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'varchar', length: 80 })
  taskType: string;

  @Column({ type: 'jsonb' })
  evidence: Record<string, unknown>;

  @Column({ type: 'varchar', length: 16, default: 'offered' })
  state: 'offered' | 'accepted' | 'declined';

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}

// ---- Work ------------------------------------------------------------------------------------------------------

export type TaskTrigger = 'schedule' | 'event' | 'person';
export type TaskRunState = 'queued' | 'running' | 'done' | 'deferred' | 'cancelled' | 'dead';

@Entity('task_runs')
export class TaskRun extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'varchar', length: 80 })
  taskType: string;

  @Column({ type: 'varchar', length: 16 })
  trigger: TaskTrigger;

  @Column({ type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 16, default: 'queued' })
  state: TaskRunState;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'integer', default: 5 })
  maxAttempts: number;

  @Column({ type: 'timestamptz' })
  runAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  leaseUntil: Date | null;

  @Column({ type: 'jsonb', default: {} })
  input: Record<string, unknown>;

  @Column({ type: 'integer', nullable: true })
  profileVersion: number | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  outcome: string | null;

  @Column({ type: 'varchar', length: 1000, nullable: true })
  error: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  finishedAt: Date | null;
}

export type WorkItemState = 'pending' | 'approved' | 'edited' | 'rejected' | 'expired' | 'superseded';

@Entity('work_items')
export class WorkItem extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'uuid', nullable: true })
  taskRunId: string | null;

  @Column({ type: 'varchar', length: 80 })
  taskType: string;

  @Column({ type: 'varchar', length: 24 })
  kind: string;

  @Column({ type: 'varchar', length: 200 })
  title: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'jsonb' })
  original: Record<string, unknown>;

  /** Serialized platform effects, run with the approved payload when a person approves. */
  @Column({ type: 'jsonb', default: [] })
  onApprove: unknown[];

  @Column({ type: 'uuid', array: true, default: [] })
  factIds: string[];

  @Column({ type: 'integer', nullable: true })
  profileVersion: number | null;

  /** Set when a guardrail or a refusal sent this to a person instead of acting. */
  @Column({ type: 'varchar', length: 300, nullable: true })
  flaggedReason: string | null;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  state: WorkItemState;

  @Column({ type: 'uuid', nullable: true })
  decidedBy: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;

  @Column({ type: 'numeric', precision: 5, scale: 4, nullable: true, transformer: numeric })
  editRatio: number | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  rejectReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  expiresAt: Date | null;
}

@Entity('domain_events')
export class DomainEvent extends WorkspaceScopedEntity {
  @Column({ type: 'varchar', length: 60 })
  type: string;

  @Column({ type: 'jsonb' })
  payload: Record<string, unknown>;

  @Column({ type: 'uuid', nullable: true })
  sourceRunId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  dispatchedAt: Date | null;
}

@Entity('activity_events')
export class ActivityEvent extends WorkspaceScopedEntity {
  @Column({ type: 'uuid', nullable: true })
  staffId: string | null;

  /** `staff`, `system`, or `user:<id>`. */
  @Column({ type: 'varchar', length: 60 })
  actor: string;

  @Column({ type: 'varchar', length: 60 })
  type: string;

  @Column({ type: 'varchar', length: 300 })
  summary: string;

  @Column({ type: 'jsonb', default: {} })
  detail: Record<string, unknown>;

  @Column({ type: 'numeric', precision: 12, scale: 6, nullable: true, transformer: numeric })
  costUsd: number | null;
}

@Entity('audit_log')
export class AuditEntry extends WorkspaceScopedEntity {
  @Column({ type: 'uuid', nullable: true })
  userId: string | null;

  @Column({ type: 'varchar', length: 60 })
  action: string;

  @Column({ type: 'varchar', length: 120 })
  target: string;

  @Column({ type: 'jsonb', default: {} })
  detail: Record<string, unknown>;

  @Column({ type: 'varchar', length: 45, nullable: true })
  ip: string | null;
}

// ---- Budgets ---------------------------------------------------------------------------------------------------

@Entity('usage_reservations')
export class UsageReservation extends WorkspaceScopedEntity {
  @Column({ type: 'uuid', nullable: true })
  staffId: string | null;

  @Column({ type: 'uuid', nullable: true })
  taskRunId: string | null;

  @Column({ type: 'varchar', length: 16 })
  kind: 'model' | 'research' | 'connector';

  @Column({ type: 'varchar', length: 60, nullable: true })
  model: string | null;

  @Column({ type: 'numeric', precision: 12, scale: 6, transformer: numeric })
  reservedUsd: number;

  @Column({ type: 'numeric', precision: 12, scale: 6, default: 0, transformer: numeric })
  actualUsd: number;

  @Column({ type: 'integer', default: 0 })
  inputTokens: number;

  @Column({ type: 'integer', default: 0 })
  outputTokens: number;

  @Column({ type: 'varchar', length: 16, default: 'reserved' })
  state: 'reserved' | 'settled' | 'released';

  @Column({ type: 'timestamptz' })
  expiresAt: Date;
}

@Entity('spend_caps')
export class SpendCap extends WorkspaceScopedEntity {
  @Column({ type: 'numeric', precision: 12, scale: 2, transformer: numeric })
  monthlyCapUsd: number;

  @Column({ type: 'integer', default: 80 })
  alertAtPct: number;

  /** `YYYY-MM` of the last month the cap alert was sent, so it is sent once per month. */
  @Column({ type: 'varchar', length: 7, nullable: true })
  alertedPeriod: string | null;
}
