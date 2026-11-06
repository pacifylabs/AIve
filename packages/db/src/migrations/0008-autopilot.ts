import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Autopilot: the owner's choice of when a task that acts outside the platform may stop waiting for approval, and the
 * rules that must be met first. `autonomy` stays the level a run actually uses; these columns hold the owner's intent.
 */
export class Autopilot1793923200000 implements MigrationInterface {
  name = 'Autopilot1793923200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      ALTER TABLE staff_task_settings
        -- off: never offer it. ask: offer it when the rules are met and let a person accept. auto: switch it on by itself
        -- when the rules are met. Demotion always puts a task back to ask.
        ADD COLUMN autopilot_mode varchar(8) NOT NULL DEFAULT 'ask' CHECK (autopilot_mode IN ('off', 'ask', 'auto')),
        -- The owner's overrides of the role's promotion rule: approvals, maxMedianEditRatio, windowDays, maxPerDay.
        -- Missing keys use the role's defaults. Values are clamped to platform limits when read.
        ADD COLUMN autopilot_rules jsonb NOT NULL DEFAULT '{}',
        ADD COLUMN autopilot_changed_by uuid,
        ADD COLUMN autopilot_changed_at timestamptz;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
