import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Bluesky and Mastodon are gone; Threads and TikTok are in. The check refuses any account of a removed network, so a
 * database that still holds one fails here, loudly, and a person decides what to do with it. Nothing is deleted.
 */
export class NetworksThreadsTikTok1794268800000 implements MigrationInterface {
  name = 'NetworksThreadsTikTok1794268800000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE connected_accounts DROP CONSTRAINT connected_accounts_network_check;
      ALTER TABLE connected_accounts ADD CONSTRAINT connected_accounts_network_check CHECK (network IN
        ('facebook', 'instagram', 'threads', 'tiktok', 'linkedin', 'x', 'telegram', 'discord'));
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
