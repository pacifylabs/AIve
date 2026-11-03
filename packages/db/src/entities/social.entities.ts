import { Column, Entity } from 'typeorm';
import { WorkspaceScopedEntity } from './base.entity.js';

export type SocialNetworkKey = 'facebook' | 'instagram' | 'linkedin' | 'x';
export type AccountHealth = 'ok' | 'degraded' | 'broken';

@Entity('connected_accounts')
export class ConnectedAccount extends WorkspaceScopedEntity {
  @Column({ type: 'varchar', length: 16 })
  network: SocialNetworkKey;

  @Column({ type: 'varchar', length: 200 })
  externalId: string;

  @Column({ type: 'varchar', length: 200 })
  name: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  username: string | null;

  @Column({ type: 'varchar', length: 200, nullable: true })
  parentExternalId: string | null;

  /** Keyring ciphertext of `{ accessToken, refreshToken }`, bound to `<workspaceId>:<accountId>`. */
  @Column({ type: 'text' })
  secretEnc: string;

  @Column({ type: 'timestamptz', nullable: true })
  tokenExpiresAt: Date | null;

  @Column({ type: 'text', array: true, default: [] })
  scopes: string[];

  @Column({ type: 'varchar', length: 16, default: 'ok' })
  health: AccountHealth;

  @Column({ type: 'varchar', length: 400, nullable: true })
  healthReason: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  lastCheckedAt: Date | null;

  @Column({ type: 'jsonb', default: {} })
  metadata: Record<string, unknown>;
}

export type PostState = 'scheduled' | 'published' | 'failed' | 'cancelled';

@Entity('social_posts')
export class SocialPost extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'text' })
  body: string;

  @Column({ type: 'varchar', length: 500, nullable: true })
  linkUrl: string | null;

  @Column({ type: 'text', nullable: true })
  firstComment: string | null;

  /** Public URLs of pictures or videos to attach, in order. */
  @Column({ type: 'jsonb', default: [] })
  media: string[];

  @Column({ type: 'varchar', length: 16, default: 'scheduled' })
  state: PostState;

  @Column({ type: 'timestamptz' })
  scheduledFor: Date;

  @Column({ type: 'timestamptz', nullable: true })
  publishedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  externalPostId: string | null;

  @Column({ type: 'varchar', length: 500, nullable: true })
  permalink: string | null;
}

export type PublishIntentState = 'pending' | 'sending' | 'sent' | 'failed' | 'uncertain' | 'cancelled';

@Entity('publish_intents')
export class PublishIntent extends WorkspaceScopedEntity {
  @Column({ type: 'uuid' })
  staffId: string;

  @Column({ type: 'uuid' })
  accountId: string;

  @Column({ type: 'uuid' })
  postId: string;

  @Column({ type: 'varchar', length: 200 })
  idempotencyKey: string;

  @Column({ type: 'varchar', length: 16, default: 'pending' })
  state: PublishIntentState;

  @Column({ type: 'timestamptz' })
  notBefore: Date;

  @Column({ type: 'timestamptz', nullable: true })
  claimedAt: Date | null;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'varchar', length: 400, nullable: true })
  error: string | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  externalPostId: string | null;
}
