import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['post_tags', 'post_templates'];

/**
 * Colour tags for posts and saved post templates. A tag is a short name with one colour from a fixed set, so every
 * screen draws it the same way and a person can filter the calendar by it. A template is the text of a post written
 * once and started from again, with the accounts, link and tag it usually goes with.
 */
export class PostTagsTemplates1794441600000 implements MigrationInterface {
  name = 'PostTagsTemplates1794441600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE post_tags (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name varchar(40) NOT NULL,
        colour varchar(10) NOT NULL
          CHECK (colour IN ('blue', 'teal', 'green', 'amber', 'red', 'pink', 'purple', 'gray')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX post_tags_name_key ON post_tags (workspace_id, lower(name));

      CREATE TABLE post_templates (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name varchar(80) NOT NULL,
        body text NOT NULL,
        first_comment varchar(1000),
        link_url varchar(500),
        media jsonb NOT NULL DEFAULT '[]',
        -- The accounts ticked when the template is started from. Chosen again each time, so a stale id is harmless.
        account_ids uuid[] NOT NULL DEFAULT '{}',
        tag_id uuid REFERENCES post_tags(id) ON DELETE SET NULL,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX post_templates_name_key ON post_templates (workspace_id, lower(name));

      ALTER TABLE social_posts ADD COLUMN tag_id uuid REFERENCES post_tags(id) ON DELETE SET NULL;
      CREATE INDEX social_posts_tag_idx ON social_posts (workspace_id, tag_id) WHERE tag_id IS NOT NULL;
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
