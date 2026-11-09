import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * The audit log now records every change a person makes, not only the ones a service wrote by hand. Two changes to fit:
 * the action holds a method and a route (longer than 60 characters), and a sign-in attempt by an address we do not know
 * has no workspace, so the workspace may be empty. Rows with no workspace are invisible to every tenant (the policy
 * compares workspace ids) and readable only by the platform.
 */
export class AuditEveryChange1794528000000 implements MigrationInterface {
  name = 'AuditEveryChange1794528000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE audit_log ALTER COLUMN workspace_id DROP NOT NULL;
      ALTER TABLE audit_log ALTER COLUMN action TYPE varchar(120);
      CREATE INDEX audit_log_user_idx ON audit_log (workspace_id, user_id, created_at DESC);
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
