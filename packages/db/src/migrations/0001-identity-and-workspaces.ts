import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Identity, workspaces, membership and invitations, plus the row-level security plumbing every later tenant table uses.
 *
 * Tenant context lives in three transaction-local settings, set by tenant.ts:
 *   app.workspace_id  the workspace the current request or job acts in
 *   app.user_id       the signed-in user (lets "my workspaces" read across workspaces the user belongs to)
 *   app.system        'on' only inside an explicit, named system operation (sign-up, accepting an invitation)
 * The app role (ai_staff_app) is not the table owner and cannot bypass RLS, so these policies always apply to it.
 */
export class IdentityAndWorkspaces1793318400000 implements MigrationInterface {
  name = 'IdentityAndWorkspaces1793318400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`CREATE EXTENSION IF NOT EXISTS citext`);

    await q.query(`
      CREATE FUNCTION app_workspace_id() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('app.workspace_id', true), '')::uuid $$;
      CREATE FUNCTION app_user_id() RETURNS uuid LANGUAGE sql STABLE AS
        $$ SELECT NULLIF(current_setting('app.user_id', true), '')::uuid $$;
      CREATE FUNCTION app_is_system() RETURNS boolean LANGUAGE sql STABLE AS
        $$ SELECT current_setting('app.system', true) = 'on' $$;
    `);

    await q.query(`
      CREATE TABLE users (
        id uuid PRIMARY KEY,
        email citext NOT NULL,
        name varchar(120) NOT NULL,
        password_hash text NOT NULL,
        email_verified_at timestamptz,
        mfa_secret_enc text,
        mfa_enabled_at timestamptz,
        token_version integer NOT NULL DEFAULT 0,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX users_email_key ON users (email);

      CREATE TABLE email_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        purpose varchar(32) NOT NULL CHECK (purpose IN ('verify_email', 'reset_password')),
        token_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        attempts integer NOT NULL DEFAULT 0,
        used_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX email_tokens_hash_key ON email_tokens (token_hash);
      CREATE INDEX email_tokens_user_purpose_idx ON email_tokens (user_id, purpose);

      CREATE TABLE refresh_tokens (
        id uuid PRIMARY KEY,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        family_id uuid NOT NULL,
        token_hash char(64) NOT NULL,
        expires_at timestamptz NOT NULL,
        rotated_at timestamptz,
        revoked_at timestamptz,
        user_agent varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX refresh_tokens_hash_key ON refresh_tokens (token_hash);
      CREATE INDEX refresh_tokens_user_idx ON refresh_tokens (user_id);
      CREATE INDEX refresh_tokens_family_idx ON refresh_tokens (family_id);
    `);

    await q.query(`
      CREATE TABLE workspaces (
        id uuid PRIMARY KEY,
        name varchar(120) NOT NULL,
        slug varchar(80) NOT NULL,
        timezone varchar(64) NOT NULL DEFAULT 'UTC',
        country char(2),
        state varchar(16) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'suspended', 'closed')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX workspaces_slug_key ON workspaces (slug);

      CREATE TABLE memberships (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        role varchar(16) NOT NULL CHECK (role IN ('owner', 'admin', 'member')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX memberships_workspace_user_key ON memberships (workspace_id, user_id);
      CREATE INDEX memberships_user_idx ON memberships (user_id);

      CREATE TABLE invitations (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        email citext NOT NULL,
        role varchar(16) NOT NULL CHECK (role IN ('admin', 'member')),
        token_hash char(64) NOT NULL,
        invited_by_user_id uuid NOT NULL REFERENCES users(id),
        expires_at timestamptz NOT NULL,
        accepted_at timestamptz,
        revoked_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX invitations_hash_key ON invitations (token_hash);
      CREATE INDEX invitations_workspace_email_idx ON invitations (workspace_id, email);
    `);

    // Membership rows are visible inside their workspace, and to the user they belong to (for "my workspaces").
    // Workspaces are visible to their members. Invitations only inside their workspace. System operations see all.
    await q.query(`
      ALTER TABLE workspaces ENABLE ROW LEVEL SECURITY;
      ALTER TABLE memberships ENABLE ROW LEVEL SECURITY;
      ALTER TABLE invitations ENABLE ROW LEVEL SECURITY;

      CREATE POLICY memberships_tenant ON memberships
        USING (app_is_system() OR workspace_id = app_workspace_id() OR user_id = app_user_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());

      CREATE POLICY workspaces_tenant ON workspaces
        USING (
          app_is_system() OR id = app_workspace_id()
          OR id IN (SELECT workspace_id FROM memberships WHERE user_id = app_user_id())
        )
        WITH CHECK (app_is_system() OR id = app_workspace_id());

      CREATE POLICY invitations_tenant ON invitations
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);

    await q.query(`
      GRANT USAGE ON SCHEMA public TO ai_staff_app;
      GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ai_staff_app;
      ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ai_staff_app;
      REVOKE ALL ON TABLE migrations FROM ai_staff_app;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
