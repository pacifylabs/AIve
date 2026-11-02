import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Early-access sign-ups from the marketing site. One row per address; signing up again updates the row. No IP or
 * user-agent is stored. The app role gets access through the default privileges set in migration 0001.
 */
export class EarlyAccess1793404800000 implements MigrationInterface {
  name = 'EarlyAccess1793404800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE early_access_signups (
        id uuid PRIMARY KEY,
        email citext NOT NULL,
        website varchar(200),
        role varchar(8) NOT NULL CHECK (role IN ('social', 'sales', 'both')),
        first_task varchar(200),
        invited_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX early_access_signups_email_key ON early_access_signups (email);
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
