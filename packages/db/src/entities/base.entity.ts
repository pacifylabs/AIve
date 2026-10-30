import { BeforeInsert, Column, CreateDateColumn, PrimaryColumn, UpdateDateColumn } from 'typeorm';
import { v7 as uuidv7 } from 'uuid';

/** Time-ordered UUIDs keep primary-key indexes compact and make IDs sortable by creation. */
export abstract class BaseEntity {
  @PrimaryColumn({ type: 'uuid' })
  id: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @BeforeInsert()
  protected assignId(): void {
    this.id ??= uuidv7();
  }
}

/**
 * Every workspace-owned table extends this. The application scopes queries by workspaceId, and Postgres row-level
 * security enforces the same rule against the current tenant context (see tenant.ts and the migrations).
 */
export abstract class WorkspaceScopedEntity extends BaseEntity {
  @Column({ type: 'uuid' })
  workspaceId: string;
}
