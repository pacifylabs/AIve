import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['connected_accounts', 'social_posts', 'publish_intents'];

/**
 * Milestone 4, Social Media Staff, first half: connected network accounts, the posts a staff member makes, and the
 * promises to publish them. Engagements, metrics and the media library follow in the next migration, with the tasks
 * that use them. See docs/DATA-MODEL.md and docs/roles/SOCIAL-MEDIA-STAFF.md.
 *
 * Deviation from the data model doc: media is a list of URLs on the post for now; the signed-upload library arrives
 * with the composer.
 */
export class SocialPublishing1793664000000 implements MigrationInterface {
  name = 'SocialPublishing1793664000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE connected_accounts (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        network varchar(16) NOT NULL CHECK (network IN ('facebook', 'instagram', 'linkedin', 'x')),
        external_id varchar(200) NOT NULL,
        name varchar(200) NOT NULL,
        username varchar(200),
        parent_external_id varchar(200),
        -- Access and refresh tokens, encrypted with the keyring and bound to this row; never returned by the API.
        secret_enc text NOT NULL,
        token_expires_at timestamptz,
        scopes text[] NOT NULL DEFAULT '{}',
        health varchar(16) NOT NULL DEFAULT 'ok' CHECK (health IN ('ok', 'degraded', 'broken')),
        health_reason varchar(400),
        last_checked_at timestamptz,
        metadata jsonb NOT NULL DEFAULT '{}',
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX connected_accounts_external_key ON connected_accounts (workspace_id, network, external_id);

      CREATE TABLE social_posts (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
        body text NOT NULL,
        link_url varchar(500),
        first_comment text,
        media jsonb NOT NULL DEFAULT '[]',
        state varchar(16) NOT NULL DEFAULT 'scheduled'
          CHECK (state IN ('scheduled', 'published', 'failed', 'cancelled')),
        scheduled_for timestamptz NOT NULL,
        published_at timestamptz,
        external_post_id varchar(300),
        permalink varchar(500),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX social_posts_account_idx ON social_posts (workspace_id, account_id, scheduled_for);

      CREATE TABLE publish_intents (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
        post_id uuid NOT NULL REFERENCES social_posts(id) ON DELETE CASCADE,
        idempotency_key varchar(200) NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN
          ('pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled')),
        not_before timestamptz NOT NULL,
        claimed_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        error varchar(400),
        external_post_id varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX publish_intents_idempotency_key ON publish_intents (workspace_id, idempotency_key);
      CREATE INDEX publish_intents_due_idx ON publish_intents (state, not_before) WHERE state IN ('pending', 'sending', 'uncertain');
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
