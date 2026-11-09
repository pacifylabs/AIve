import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * One row per account per day: the follower count the network reported that day. The day is the account's capture day in
 * UTC, and a second capture the same day replaces the first, so the table never holds two for one day.
 */
export class AccountStats1794700800000 implements MigrationInterface {
  name = 'AccountStats1794700800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE account_stats (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
        day date NOT NULL,
        followers integer NOT NULL CHECK (followers >= 0),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX account_stats_day_key ON account_stats (account_id, day);
      CREATE INDEX account_stats_workspace_idx ON account_stats (workspace_id, day DESC);
      ALTER TABLE account_stats ENABLE ROW LEVEL SECURITY;
      CREATE POLICY account_stats_tenant ON account_stats
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
