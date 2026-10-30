import { Column, Entity, Index } from 'typeorm';
import { BaseEntity, WorkspaceScopedEntity } from './base.entity.js';

export type WorkspaceState = 'active' | 'suspended' | 'closed';
export type MembershipRole = 'owner' | 'admin' | 'member';
export const MEMBERSHIP_ROLES: readonly MembershipRole[] = ['owner', 'admin', 'member'];

@Entity('workspaces')
export class Workspace extends BaseEntity {
  @Column({ type: 'varchar', length: 120 })
  name: string;

  @Index({ unique: true })
  @Column({ type: 'varchar', length: 80 })
  slug: string;

  @Column({ type: 'varchar', length: 64, default: 'UTC' })
  timezone: string;

  @Column({ type: 'char', length: 2, nullable: true })
  country: string | null;

  @Column({ type: 'varchar', length: 16, default: 'active' })
  state: WorkspaceState;
}

@Entity('memberships')
@Index(['workspaceId', 'userId'], { unique: true })
export class Membership extends WorkspaceScopedEntity {
  @Index()
  @Column({ type: 'uuid' })
  userId: string;

  @Column({ type: 'varchar', length: 16 })
  role: MembershipRole;
}

@Entity('invitations')
@Index(['workspaceId', 'email'])
export class Invitation extends WorkspaceScopedEntity {
  @Column({ type: 'citext' })
  email: string;

  @Column({ type: 'varchar', length: 16 })
  role: Exclude<MembershipRole, 'owner'>;

  @Index({ unique: true })
  @Column({ type: 'char', length: 64 })
  tokenHash: string;

  @Column({ type: 'uuid' })
  invitedByUserId: string;

  @Column({ type: 'timestamptz' })
  expiresAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  acceptedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  revokedAt: Date | null;
}
