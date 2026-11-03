import { Column, Entity, type ValueTransformer } from 'typeorm';
import { BaseEntity, WorkspaceScopedEntity } from './base.entity.js';

/** IMAP UIDs are 32-bit unsigned; Postgres returns bigint as a string. */
const bigintNumber: ValueTransformer = {
  to: (value: number | null | undefined) => value,
  from: (value: string | null) => (value === null ? null : Number(value)),
};

// ---- Mailboxes -------------------------------------------------------------------------------------------------

export type MailboxProvider = 'smtp' | 'fixture';
export type MailboxStatus = 'pending' | 'verified' | 'error' | 'paused';
export type InboundMode = 'imap' | 'forward';

@Entity('mailboxes')
export class Mailbox extends WorkspaceScopedEntity {
  @Column({ type: 'citext' })
  address: string;

  @Column({ type: 'varchar', length: 120 })
  displayName: string;

  @Column({ type: 'varchar', length: 16 })
  provider: MailboxProvider;

  /** Keyring ciphertext bound to `<workspaceId>:<mailboxId>`; never returned by the API. */
  @Column({ type: 'text', nullable: true })
  credentialsEnc: string | null;

  @Column({ type: 'varchar', length: 16, default: 'forward' })
  inboundMode: InboundMode;

  /** SHA-256 of the secret in the forwarding URL. */
  @Column({ type: 'varchar', length: 64 })
  inboundSecretHash: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  status: MailboxStatus;

  @Column({ type: 'boolean', nullable: true })
  spfOk: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  dkimOk: boolean | null;

  @Column({ type: 'boolean', nullable: true })
  dmarcOk: boolean | null;

  @Column({ type: 'timestamptz', nullable: true })
  dnsCheckedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  testMessageId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  verifiedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  failures: number;

  @Column({ type: 'varchar', length: 400, nullable: true })
  lastError: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastInboundAt: Date | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  imapUidValidity: number | null;

  @Column({ type: 'bigint', nullable: true, transformer: bigintNumber })
  imapLastUid: number | null;
}

// ---- Leads -----------------------------------------------------------------------------------------------------

export type LeadSource = 'csv' | 'manual' | 'social';
export type LeadState =
  'new' | 'researching' | 'queued' | 'contacting' | 'replied' | 'needs_human' | 'won' | 'lost' | 'stopped';

@Entity('leads')
export class Lead extends WorkspaceScopedEntity {
  @Column({ type: 'varchar', length: 160, nullable: true })
  name: string | null;

  @Column({ type: 'varchar', length: 160, nullable: true })
  company: string | null;

  @Column({ type: 'citext', nullable: true })
  email: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  website: string | null;

  /** IANA zone, when known; sending hours use it before the workspace's. */
  @Column({ type: 'varchar', length: 64, nullable: true })
  timezone: string | null;

  @Column({ type: 'varchar', length: 16 })
  source: LeadSource;

  @Column({ type: 'varchar', length: 200, nullable: true })
  sourceRef: string | null;

  @Column({ type: 'uuid', nullable: true })
  ownerUserId: string | null;

  @Column({ type: 'uuid', nullable: true })
  assignedStaffId: string | null;

  @Column({ type: 'varchar', length: 16, default: 'new' })
  state: LeadState;

  @Column({ type: 'text', nullable: true })
  notes: string | null;
}

@Entity('lead_research')
export class LeadResearch extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  leadId: string;

  @Column({ type: 'varchar', length: 500 })
  url: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  title: string | null;

  @Column({ type: 'varchar', length: 2000 })
  excerpt: string;

  @Column({ type: 'varchar', length: 16 })
  kind: 'observed' | 'inferred';

  @Column({ type: 'timestamptz' })
  retrievedAt: Date;
}

// ---- Conversations ---------------------------------------------------------------------------------------------

export type ConversationState = 'active' | 'waiting' | 'needs_human' | 'closed';
export type ReplyClassification =
  'interested' | 'question' | 'objection' | 'out_of_office' | 'opt_out' | 'bounce' | 'unclear' | 'escalate';

@Entity('conversations')
export class Conversation extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  leadId: string;

  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'uuid' })
  mailboxId: string;

  @Column({ type: 'citext' })
  recipientEmail: string;

  @Column({ type: 'varchar', length: 300 })
  subject: string;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  state: ConversationState;

  @Column({ type: 'varchar', length: 8, default: 'staff' })
  handledBy: 'staff' | 'human';

  @Column({ type: 'integer', default: 1 })
  stateVersion: number;

  @Column({ type: 'varchar', length: 16, nullable: true })
  lastClassification: ReplyClassification | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  needsHumanReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastMessageAt: Date | null;
}

export type MessageKind = 'first' | 'follow_up' | 'reply' | 'human';
export type MessageDelivery =
  'queued' | 'sending' | 'accepted' | 'uncertain' | 'failed' | 'cancelled' | 'received' | 'bounced';

@Entity('messages')
export class Message extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'varchar', length: 3 })
  direction: 'in' | 'out';

  @Column({ type: 'varchar', length: 16 })
  kind: MessageKind;

  @Column({ type: 'varchar', length: 8 })
  author: 'staff' | 'human' | 'lead';

  @Column({ type: 'uuid', nullable: true })
  authorUserId: string | null;

  @Column({ type: 'varchar', length: 300 })
  subject: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 300 })
  messageIdHeader: string;

  @Column({ type: 'varchar', length: 300, nullable: true })
  inReplyTo: string | null;

  @Column({ type: 'timestamptz' })
  occurredAt: Date;

  @Column({ type: 'varchar', length: 16 })
  delivery: MessageDelivery;
}

export type SendIntentState = 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled';

@Entity('send_intents')
export class SendIntent extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'uuid' })
  mailboxId: string;

  @Column({ type: 'uuid' })
  conversationId: string;

  @Column({ type: 'uuid' })
  messageId: string;

  @Column({ type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({ type: 'integer', nullable: true })
  conversationVersion: number | null;

  @Column({ type: 'boolean', default: false })
  byHuman: boolean;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  state: SendIntentState;

  @Column({ type: 'timestamptz' })
  notBefore: Date;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 400, nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  providerMessageId: string | null;
}

// ---- Suppression -----------------------------------------------------------------------------------------------

export type SuppressionReason = 'opt_out' | 'bounce' | 'complaint' | 'manual';

@Entity('suppressions')
export class Suppression extends WorkspaceScopedEntity {
  /** An address, or `@domain` for a whole domain. */
  @Column({ type: 'citext' })
  value: string;

  @Column({ type: 'varchar', length: 16 })
  reason: SuppressionReason;

  @Column({ type: 'varchar', length: 300, nullable: true })
  note: string | null;
}

/** Hard bounces and complaints that apply to every workspace. Written only by system operations (RLS). */
@Entity('global_suppressions')
export class GlobalSuppression extends BaseEntity {
  @Column({ type: 'citext' })
  value: string;

  @Column({ type: 'varchar', length: 16 })
  reason: 'bounce' | 'complaint';
}

@Entity('inbound_events')
export class InboundEvent extends WorkspaceScopedEntity {
  @Column({ type: 'varchar', length: 16 })
  source: 'email';

  @Column({ type: 'varchar', length: 300 })
  externalId: string;

  @Column({ type: 'timestamptz' })
  receivedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  processedAt: Date | null;

  @Column({ type: 'varchar', length: 40, nullable: true })
  outcome: string | null;
}
