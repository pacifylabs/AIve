import type { MigrationInterface, QueryRunner } from 'typeorm';

const TENANT_TABLES = [
  'mailboxes',
  'leads',
  'lead_research',
  'conversations',
  'messages',
  'send_intents',
  'suppressions',
  'inbound_events',
];

/**
 * Milestone 3, Sales Manager Staff: mailboxes, leads and their research, conversations and messages, send intents,
 * suppressions and inbound event de-duplication. See docs/DATA-MODEL.md and docs/roles/SALES-MANAGER-STAFF.md.
 *
 * Deviation from the data model doc: `connected_accounts` + `mailbox_settings` are one `mailboxes` table for now. Mail
 * is the only connector until Milestone 4, and splitting it then is a mechanical migration.
 */
export class SalesManager1793577600000 implements MigrationInterface {
  name = 'SalesManager1793577600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE mailboxes (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        address citext NOT NULL,
        display_name varchar(120) NOT NULL,
        -- 'fixture' records mail instead of sending it; only tests and local development create one.
        provider varchar(16) NOT NULL CHECK (provider IN ('smtp', 'fixture')),
        -- SMTP and IMAP logins, encrypted with the keyring and bound to this row.
        credentials_enc text,
        inbound_mode varchar(16) NOT NULL DEFAULT 'forward' CHECK (inbound_mode IN ('imap', 'forward')),
        inbound_secret_hash varchar(64) NOT NULL,
        status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'verified', 'error', 'paused')),
        spf_ok boolean,
        dkim_ok boolean,
        dmarc_ok boolean,
        dns_checked_at timestamptz,
        test_message_id varchar(300),
        verified_at timestamptz,
        failures integer NOT NULL DEFAULT 0,
        last_error varchar(400),
        last_inbound_at timestamptz,
        imap_uid_validity bigint,
        imap_last_uid bigint,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX mailboxes_address_key ON mailboxes (workspace_id, address);
    `);

    await q.query(`
      CREATE TABLE leads (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        name varchar(160),
        company varchar(160),
        email citext,
        website varchar(300),
        timezone varchar(64),
        source varchar(16) NOT NULL CHECK (source IN ('csv', 'manual', 'social')),
        source_ref varchar(200),
        owner_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        assigned_staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
        state varchar(16) NOT NULL DEFAULT 'new' CHECK (state IN
          ('new', 'researching', 'queued', 'contacting', 'replied', 'needs_human', 'won', 'lost', 'stopped')),
        notes text,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX leads_email_key ON leads (workspace_id, email) WHERE email IS NOT NULL;
      CREATE INDEX leads_state_idx ON leads (workspace_id, assigned_staff_id, state);

      CREATE TABLE lead_research (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        url varchar(500) NOT NULL,
        title varchar(300),
        excerpt varchar(2000) NOT NULL,
        kind varchar(16) NOT NULL CHECK (kind IN ('observed', 'inferred')),
        retrieved_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX lead_research_lead_idx ON lead_research (workspace_id, lead_id);
    `);

    await q.query(`
      CREATE TABLE conversations (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        lead_id uuid NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE RESTRICT,
        recipient_email citext NOT NULL,
        subject varchar(300) NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'waiting', 'needs_human', 'closed')),
        handled_by varchar(8) NOT NULL DEFAULT 'staff' CHECK (handled_by IN ('staff', 'human')),
        -- Moves on with every inbound message, takeover and close. Queued work records the version it was written
        -- for and is dropped if the conversation moved on.
        state_version integer NOT NULL DEFAULT 1,
        last_classification varchar(16),
        needs_human_reason varchar(300),
        last_message_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- One active conversation per lead.
      CREATE UNIQUE INDEX conversations_open_lead_key ON conversations (workspace_id, lead_id) WHERE state <> 'closed';
      CREATE INDEX conversations_recipient_idx ON conversations (workspace_id, mailbox_id, recipient_email);

      CREATE TABLE messages (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        direction varchar(3) NOT NULL CHECK (direction IN ('in', 'out')),
        kind varchar(16) NOT NULL CHECK (kind IN ('first', 'follow_up', 'reply', 'human')),
        author varchar(8) NOT NULL CHECK (author IN ('staff', 'human', 'lead')),
        author_user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        subject varchar(300) NOT NULL,
        body text NOT NULL,
        message_id_header varchar(300) NOT NULL,
        in_reply_to varchar(300),
        occurred_at timestamptz NOT NULL,
        delivery varchar(16) NOT NULL CHECK (delivery IN
          ('queued', 'sending', 'accepted', 'uncertain', 'failed', 'cancelled', 'received', 'bounced')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX messages_thread_idx ON messages (workspace_id, message_id_header);
      CREATE INDEX messages_conversation_idx ON messages (workspace_id, conversation_id, occurred_at);

      CREATE TABLE send_intents (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        mailbox_id uuid NOT NULL REFERENCES mailboxes(id) ON DELETE RESTRICT,
        conversation_id uuid NOT NULL REFERENCES conversations(id) ON DELETE CASCADE,
        message_id uuid NOT NULL REFERENCES messages(id) ON DELETE CASCADE,
        idempotency_key varchar(200) NOT NULL,
        -- The conversation version this was written for; null for a person's own reply, which always goes.
        conversation_version integer,
        by_human boolean NOT NULL DEFAULT false,
        state varchar(16) NOT NULL DEFAULT 'pending' CHECK (state IN
          ('pending', 'sending', 'sent', 'failed', 'uncertain', 'cancelled')),
        not_before timestamptz NOT NULL DEFAULT now(),
        claimed_at timestamptz,
        attempts integer NOT NULL DEFAULT 0,
        error varchar(400),
        provider_message_id varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX send_intents_idempotency_key ON send_intents (workspace_id, idempotency_key);
      CREATE INDEX send_intents_due_idx ON send_intents (state, not_before) WHERE state IN ('pending', 'sending');
    `);

    await q.query(`
      CREATE TABLE suppressions (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        -- An address, or '@domain' for a whole domain.
        value citext NOT NULL,
        reason varchar(16) NOT NULL CHECK (reason IN ('opt_out', 'bounce', 'complaint', 'manual')),
        note varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX suppressions_value_key ON suppressions (workspace_id, value);

      -- Hard bounces and complaints apply to every workspace. Not tenant data: anyone may read it, only system
      -- operations may write it (policies below).
      CREATE TABLE global_suppressions (
        id uuid PRIMARY KEY,
        value citext NOT NULL,
        reason varchar(16) NOT NULL CHECK (reason IN ('bounce', 'complaint')),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX global_suppressions_value_key ON global_suppressions (value);

      CREATE TABLE inbound_events (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        source varchar(16) NOT NULL CHECK (source IN ('email')),
        external_id varchar(300) NOT NULL,
        received_at timestamptz NOT NULL,
        processed_at timestamptz,
        outcome varchar(40),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX inbound_events_external_key ON inbound_events (workspace_id, source, external_id);
    `);

    for (const table of TENANT_TABLES) {
      await q.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${table}_tenant ON ${table}
          USING (app_is_system() OR workspace_id = app_workspace_id())
          WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
      `);
    }

    await q.query(`
      ALTER TABLE global_suppressions ENABLE ROW LEVEL SECURITY;
      CREATE POLICY global_suppressions_read ON global_suppressions FOR SELECT USING (true);
      CREATE POLICY global_suppressions_write ON global_suppressions FOR ALL
        USING (app_is_system()) WITH CHECK (app_is_system());
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
