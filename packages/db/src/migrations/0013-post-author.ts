import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Who wrote a post by hand. Null for every post a staff member drafted, which is all that exist so far. */
export class PostAuthor1794355200000 implements MigrationInterface {
  name = 'PostAuthor1794355200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`ALTER TABLE social_posts ADD COLUMN created_by uuid`);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
