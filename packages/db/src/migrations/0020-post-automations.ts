import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Rules that act on a workspace's own posts: when a post reaches a number of reactions, the staff member writes a draft
 * for the inbox. A rule starts switched off and has caps, and `automation_runs` holds one row per rule and post, so a rule
 * drafts from a post once however many times its numbers are read.
 */
export class PostAutomations1794960000000 implements MigrationInterface {
  name = 'PostAutomations1794960000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE post_automations (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        created_by uuid,
        threshold integer NOT NULL CHECK (threshold BETWEEN 1 AND 1000000),
        account_ids uuid[] NOT NULL DEFAULT '{}',
        daily_cap integer NOT NULL DEFAULT 3 CHECK (daily_cap BETWEEN 1 AND 20),
        total_cap integer NOT NULL DEFAULT 20 CHECK (total_cap BETWEEN 1 AND 200),
        enabled boolean NOT NULL DEFAULT false,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX post_automations_workspace_idx ON post_automations (workspace_id, enabled);
      ALTER TABLE post_automations ENABLE ROW LEVEL SECURITY;
      CREATE POLICY post_automations_tenant ON post_automations
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());

      CREATE TABLE automation_runs (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        automation_id uuid NOT NULL REFERENCES post_automations(id) ON DELETE CASCADE,
        post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now(),
        UNIQUE (automation_id, post_id)
      );
      CREATE INDEX automation_runs_automation_idx ON automation_runs (automation_id, created_at DESC);
      ALTER TABLE automation_runs ENABLE ROW LEVEL SECURITY;
      CREATE POLICY automation_runs_tenant ON automation_runs
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
