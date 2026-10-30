import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';

@Entity('users')
export class User extends BaseEntity {
  /** Stored lower-cased; the column is citext so lookups are case-insensitive either way. */
  @Index({ unique: true })
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Column({ type: 'text' })
  passwordHash: string;

  @Column({ type: 'timestamptz', nullable: true })
  emailVerifiedAt: Date | null;

  /** TOTP secret, encrypted with the platform keyring. Set while enrolling; mfaEnabledAt marks it as confirmed. */
  @Column({ type: 'text', nullable: true })
  mfaSecretEnc: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  mfaEnabledAt: Date | null;

  /** Bumped on password reset so outstanding access tokens can be rejected. */
  @Column({ type: 'integer', default: 0 })
  tokenVersion: number;
}

export type EmailTokenPurpose = 'verify_email' | 'reset_password';

/** One-time codes and links sent by email. Only a hash is stored. */
@Entity('email_tokens')
@Index(['userId', 'purpose'])
export class EmailToken extends BaseEntity {
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 32 })
  purpose: EmailTokenPurpose;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'integer', default: 0 })
  attempts: number;

  @Column({ type: 'timestamptz', nullable: true })
  usedAt: Date | null;
}

/**
 * Refresh tokens rotate on every use. All tokens descended from one login share a familyId; presenting a token that
 * was already rotated revokes the whole family, because it means the token was copied.
 */
@Entity('refresh_tokens')
export class RefreshToken extends BaseEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Index()
  @Column({ type: 'uuid' })
  familyId: string;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  rotatedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;

  @Column({ type: 'varchar', length: 300, nullable: true })
  userAgent: string | null;
}
