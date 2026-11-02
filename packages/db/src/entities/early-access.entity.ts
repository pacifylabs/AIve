import { Column, Entity, Index } from 'typeorm';
import { BaseEntity } from './base.entity.js';

export type EarlyAccessRole = 'social' | 'sales' | 'both';

/** Someone who asked for an invite from the marketing site. Not workspace-owned: they have no account yet. */
@Entity('early_access_signups')
export class EarlyAccessSignup extends BaseEntity {
  @Index({ unique: true })
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'varchar', length: 200, nullable: true })
  website: string | null;

  @Column({ type: 'varchar', length: 8 })
  role: EarlyAccessRole;

  @Column({ type: 'varchar', length: 200, nullable: true })
  firstTask: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  invitedAt: Date | null;
}
