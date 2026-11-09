import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Reply chains. A post can carry follow-up posts, sent one after another as replies once the first is up. The row keeps
 * how many went out and why the rest did not, so a person can see a half-sent chain and carry on from it.
 */
export class PostFollowUps1794614400000 implements MigrationInterface {
  name = 'PostFollowUps1794614400000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE social_posts
        ADD COLUMN follow_ups jsonb NOT NULL DEFAULT '[]',
        ADD COLUMN follow_ups_sent integer NOT NULL DEFAULT 0,
        ADD COLUMN follow_up_error varchar(300);
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
