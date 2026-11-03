import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['social_engagements', 'social_metrics'];

/**
 * Milestone 4, second half of the data: what people say to a connected account (comments and private messages) and
 * how published posts perform. See docs/DATA-MODEL.md.
 */
export class SocialEngagement1793750400000 implements MigrationInterface {
  name = 'SocialEngagement1793750400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE social_engagements (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
        post_id uuid REFERENCES social_posts(id) ON DELETE SET NULL,
        kind varchar(8) NOT NULL CHECK (kind IN ('comment', 'dm')),
        external_id varchar(300) NOT NULL,
        author_name varchar(200),
        text text NOT NULL,
        received_at timestamptz NOT NULL,
        -- Networks only let an account answer a private message for a short while; null for comments.
        reply_window_ends_at timestamptz,
        classification varchar(16),
        state varchar(16) NOT NULL DEFAULT 'new' CHECK (state IN ('new', 'triaged', 'replied', 'dismissed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- The same comment seen twice (two polls, a webhook and a poll) is one row.
      CREATE UNIQUE INDEX social_engagements_external_key ON social_engagements (workspace_id, account_id, external_id);
      CREATE INDEX social_engagements_state_idx ON social_engagements (workspace_id, state, received_at);

      CREATE TABLE social_metrics (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        -- '24h' and '7d' after publishing.
        capture varchar(8) NOT NULL,
        captured_at timestamptz NOT NULL,
        metrics jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX social_metrics_capture_key ON social_metrics (workspace_id, post_id, capture);
    `);
    for (const table of TENANT_TABLES) {
      await q.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${table}_tenant ON ${table}
          USING (app_is_system() OR workspace_id = app_workspace_id())
          WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
      `);
    }
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
