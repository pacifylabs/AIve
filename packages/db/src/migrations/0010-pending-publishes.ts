import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * A publish the network has accepted and is still working on (a video being processed). The intent keeps the ticket to
 * ask about, when to ask next, and since when it has been waiting, so a worker can look again after a restart.
 */
export class PendingPublishes1794096000000 implements MigrationInterface {
  name = 'PendingPublishes1794096000000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE publish_intents DROP CONSTRAINT publish_intents_state_check;
      ALTER TABLE publish_intents ADD CONSTRAINT publish_intents_state_check CHECK (state IN
        ('pending', 'sending', 'processing', 'sent', 'failed', 'uncertain', 'cancelled'));
      ALTER TABLE publish_intents
        ADD COLUMN ticket varchar(300),
        -- What the provider asked us to keep with the ticket. Never a secret.
        ADD COLUMN ticket_data jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN processing_since timestamptz,
        -- The next look. Also the lease: a worker pushes it forward before it asks, so two never ask at once.
        ADD COLUMN check_after timestamptz,
        ADD COLUMN checks integer NOT NULL DEFAULT 0;
      CREATE INDEX publish_intents_processing_idx ON publish_intents (check_after) WHERE state = 'processing';
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
