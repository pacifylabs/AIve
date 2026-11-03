import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Answering comments and private messages: the promise to send a reply a person approved, and the sender's id on a
 * private message (a network answers a message by that id, not by name).
 */
export class SocialReplies1793836800000 implements MigrationInterface {
  name = 'SocialReplies1793836800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE social_engagements ADD COLUMN thread_id varchar(200);

      CREATE TABLE reply_intents (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        account_id uuid NOT NULL REFERENCES connected_accounts(id) ON DELETE CASCADE,
        engagement_id uuid NOT NULL REFERENCES social_engagements(id) ON DELETE CASCADE,
        message text NOT NULL,
        idempotency_key varchar(200) NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN
          ('pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled')),
        not_before timestamptz NOT NULL,
        claimed_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        error varchar(400),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX reply_intents_idempotency_key ON reply_intents (workspace_id, idempotency_key);
      CREATE INDEX reply_intents_due_idx ON reply_intents (state, not_before) WHERE state IN ('pending', 'sending');

      ALTER TABLE reply_intents ENABLE ROW LEVEL SECURITY;
      CREATE POLICY reply_intents_tenant ON reply_intents
        USING (app_is_system() OR workspace_id = app_workspace_id())
        WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
