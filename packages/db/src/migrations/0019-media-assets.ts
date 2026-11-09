import type { MigrationInterface, QueryRunner } from 'typeorm';

/** The media library: pictures and videos a workspace uploaded to Cloudinary, so a post can reuse them. */
export class MediaAssets1794873600000 implements MigrationInterface {
  name = 'MediaAssets1794873600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE media_assets (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        kind varchar(5) NOT NULL CHECK (kind IN ('image', 'video')),
        -- Cloudinary's id for the file. It starts with the workspace's own folder, which is how an upload is tied to it.
        public_id varchar(300) NOT NULL,
        url varchar(1000) NOT NULL,
        name varchar(200) NOT NULL,
        width integer,
        height integer,
        bytes bigint,
        created_by uuid,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX media_assets_public_id_key ON media_assets (public_id);
      CREATE INDEX media_assets_workspace_idx ON media_assets (workspace_id, created_at DESC);
      ALTER TABLE media_assets ENABLE ROW LEVEL SECURITY;
      CREATE POLICY media_assets_tenant ON media_assets
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
