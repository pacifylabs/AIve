import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reach beside followers: how many times an account's posts were shown on the day before the capture. Null where the
 * network gives no account-level figure, which is not the same as zero.
 */
export class AccountReach1795046400000 implements MigrationInterface {
  name = 'AccountReach1795046400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE account_stats ADD COLUMN reach integer CHECK (reach >= 0)`);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
