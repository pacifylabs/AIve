import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Four more networks that connect with a token, app password or webhook: Bluesky, Mastodon, Telegram and Discord.
 * The column only accepted the first four names.
 */
export class MoreNetworks1794009600000 implements MigrationInterface {
  name = 'MoreNetworks1794009600000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE connected_accounts DROP CONSTRAINT connected_accounts_network_check;
      ALTER TABLE connected_accounts ADD CONSTRAINT connected_accounts_network_check CHECK (network IN
        ('facebook', 'instagram', 'linkedin', 'x', 'bluesky', 'mastodon', 'telegram', 'discord'));
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
