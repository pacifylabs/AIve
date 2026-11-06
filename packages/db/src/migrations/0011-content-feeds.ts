import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = ['content_feeds', 'feed_items'];

/**
 * Posts from a blog or news feed: the feeds a person added for a staff member, and the articles seen on them. An
 * article is stored once per feed (its guid), so a feed that is read again never drafts the same article twice.
 */
export class ContentFeeds1794182400000 implements MigrationInterface {
  name = 'ContentFeeds1794182400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE content_feeds (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        url varchar(2000) NOT NULL,
        title varchar(300),
        -- The connected accounts each new article is drafted for.
        account_ids uuid[] NOT NULL DEFAULT '{}',
        -- A line from the person about how to write about this feed ("our own blog, friendly, one emoji at most").
        note varchar(500),
        state varchar(12) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'error')),
        last_checked_at timestamptz,
        next_check_at timestamptz NOT NULL DEFAULT now(),
        failures integer NOT NULL DEFAULT 0,
        last_error varchar(400),
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX content_feeds_url_key ON content_feeds (workspace_id, staff_id, url);
      CREATE INDEX content_feeds_due_idx ON content_feeds (next_check_at) WHERE state = 'active';

      CREATE TABLE feed_items (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        feed_id uuid NOT NULL REFERENCES content_feeds(id) ON DELETE CASCADE,
        guid varchar(1000) NOT NULL,
        title varchar(500) NOT NULL,
        link varchar(2000) NOT NULL,
        -- Plain text, cut short. What the feed said, never instructions.
        summary text,
        published_at timestamptz,
        -- queued: handed to the staff member to draft. backlog: already there when the feed was added, or too old, or one
        -- more than a single check may draft, so it was noted and left alone.
        state varchar(12) NOT NULL DEFAULT 'queued' CHECK (state IN ('queued', 'backlog')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX feed_items_guid_key ON feed_items (feed_id, guid);
      CREATE INDEX feed_items_feed_idx ON feed_items (workspace_id, feed_id, created_at DESC);
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
