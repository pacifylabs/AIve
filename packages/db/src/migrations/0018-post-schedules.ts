import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Recurring posts: a rule and the post it repeats. The worker turns a rule into ordinary scheduled posts four weeks ahead,
 * each with its own idempotency key (`recur:<rule>:<date>:<account>`), so running it again never makes a second copy and a
 * post a person cancelled is not made again.
 */
export class PostSchedules1794787200000 implements MigrationInterface {
  name = 'PostSchedules1794787200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE post_schedules (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by uuid,
        account_ids uuid[] NOT NULL DEFAULT '{}',
        body text NOT NULL,
        first_comment varchar(1000),
        link_url varchar(500),
        media jsonb NOT NULL DEFAULT '[]',
        follow_ups jsonb NOT NULL DEFAULT '[]',
        tag_id uuid REFERENCES post_tags(id) ON DELETE SET NULL,
        rule jsonb NOT NULL,
        at_time varchar(5) NOT NULL CHECK (at_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
        starts_on date NOT NULL,
        ends_on date,
        state varchar(8) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX post_schedules_workspace_idx ON post_schedules (workspace_id, state);
      ALTER TABLE post_schedules ENABLE ROW LEVEL SECURITY;
      CREATE POLICY post_schedules_tenant ON post_schedules
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
