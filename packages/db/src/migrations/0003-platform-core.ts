import type { MigrationInterface, QueryRunner } from 'typeorm';

/** Tables every role uses through the platform. Each one is workspace-scoped and gets the standard RLS policy. */
const TENANT_TABLES = [
  'company_profiles',
  'company_facts',
  'staff_members',
  'staff_task_settings',
  'promotion_offers',
  'task_runs',
  'work_items',
  'domain_events',
  'activity_events',
  'audit_log',
  'usage_reservations',
  'spend_caps',
];

/**
 * Milestone 2, platform core: the company brain, staff and their autonomy, the task engine, the approval inbox,
 * the activity and audit logs, and budgets. See docs/DATA-MODEL.md and docs/ROLE-FRAMEWORK.md.
 *
 * One addition to the data model doc: `domain_events`, an outbox that effects write to inside the run's transaction,
 * so an event is delivered to subscribed tasks only if the run that emitted it committed.
 */
export class PlatformCore1793491200000 implements MigrationInterface {
  name = 'PlatformCore1793491200000';

  async up(q: QueryRunner): Promise<void> {
    await q.query(`
      CREATE TABLE company_profiles (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        version integer NOT NULL DEFAULT 1,
        website varchar(300),
        summary text,
        voice text,
        audience text,
        escalation_email citext,
        prefill_state varchar(16) NOT NULL DEFAULT 'none'
          CHECK (prefill_state IN ('none', 'queued', 'running', 'done', 'failed')),
        prefill_error varchar(300),
        prefilled_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX company_profiles_workspace_key ON company_profiles (workspace_id);

      -- Facts are the only ground truth a model may use. A change never edits a row in place: the old row is
      -- superseded and a new one added, and the profile version moves on, so drafts can tell what they relied on.
      CREATE TABLE company_facts (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        profile_version integer NOT NULL,
        kind varchar(16) NOT NULL
          CHECK (kind IN ('offering', 'offer', 'price', 'claim', 'banned', 'link_domain', 'faq')),
        text varchar(1000) NOT NULL,
        source varchar(16) NOT NULL CHECK (source IN ('owner', 'website')),
        source_url varchar(500),
        confirmed_at timestamptz,
        superseded_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX company_facts_current_idx ON company_facts (workspace_id, kind) WHERE superseded_at IS NULL;
    `);

    await q.query(`
      CREATE TABLE staff_members (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        role_key varchar(40) NOT NULL,
        role_version integer NOT NULL,
        display_name varchar(80) NOT NULL,
        signature varchar(300),
        disclosure varchar(16) NOT NULL DEFAULT 'ai_labelled' CHECK (disclosure IN ('named_human', 'ai_labelled')),
        settings jsonb NOT NULL DEFAULT '{}',
        state varchar(16) NOT NULL DEFAULT 'active' CHECK (state IN ('active', 'paused', 'archived')),
        paused_reason varchar(300),
        daily_cap_usd numeric(12, 6),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX staff_members_workspace_idx ON staff_members (workspace_id, state);

      CREATE TABLE staff_task_settings (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        task_type varchar(80) NOT NULL,
        autonomy varchar(8) NOT NULL CHECK (autonomy IN ('off', 'draft', 'act')),
        schedule varchar(100),
        limits jsonb NOT NULL DEFAULT '{}',
        -- Last schedule slot a run was created for, so a slot is never scheduled twice.
        last_slot_at timestamptz,
        consecutive_rejections integer NOT NULL DEFAULT 0,
        demoted_at timestamptz,
        demoted_reason varchar(300),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX staff_task_settings_staff_task_key ON staff_task_settings (staff_id, task_type);
      CREATE INDEX staff_task_settings_scheduled_idx ON staff_task_settings (workspace_id) WHERE schedule IS NOT NULL;

      CREATE TABLE promotion_offers (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        task_type varchar(80) NOT NULL,
        evidence jsonb NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'offered' CHECK (state IN ('offered', 'accepted', 'declined')),
        decided_by uuid REFERENCES users(id),
        decided_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      -- At most one open offer per staff member and task.
      CREATE UNIQUE INDEX promotion_offers_open_key ON promotion_offers (staff_id, task_type) WHERE state = 'offered';
    `);

    await q.query(`
      CREATE TABLE task_runs (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        task_type varchar(80) NOT NULL,
        trigger varchar(16) NOT NULL CHECK (trigger IN ('schedule', 'event', 'person')),
        -- Makes triggers idempotent: one run per schedule slot, per event and subscription, per person request.
        idempotency_key varchar(200) NOT NULL,
        state varchar(16) NOT NULL DEFAULT 'queued'
          CHECK (state IN ('queued', 'running', 'done', 'deferred', 'cancelled', 'dead')),
        attempts integer NOT NULL DEFAULT 0,
        max_attempts integer NOT NULL DEFAULT 5,
        run_at timestamptz NOT NULL DEFAULT now(),
        lease_until timestamptz,
        input jsonb NOT NULL DEFAULT '{}',
        profile_version integer,
        outcome varchar(300),
        error varchar(1000),
        finished_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX task_runs_idempotency_key ON task_runs (workspace_id, idempotency_key);
      CREATE INDEX task_runs_due_idx ON task_runs (run_at) WHERE state IN ('queued', 'deferred');
      CREATE INDEX task_runs_lease_idx ON task_runs (lease_until) WHERE state = 'running';
      CREATE INDEX task_runs_staff_idx ON task_runs (workspace_id, staff_id, created_at DESC);

      CREATE TABLE work_items (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid NOT NULL REFERENCES staff_members(id) ON DELETE CASCADE,
        task_run_id uuid REFERENCES task_runs(id) ON DELETE SET NULL,
        task_type varchar(80) NOT NULL,
        kind varchar(24) NOT NULL,
        title varchar(200) NOT NULL,
        payload jsonb NOT NULL,
        -- What the staff member first proposed, kept to measure how much a person changed it.
        original jsonb NOT NULL,
        -- Effects the platform executes if a person approves (with the approved payload substituted in).
        on_approve jsonb NOT NULL DEFAULT '[]',
        fact_ids uuid[] NOT NULL DEFAULT '{}',
        profile_version integer,
        flagged_reason varchar(300),
        state varchar(16) NOT NULL DEFAULT 'pending'
          CHECK (state IN ('pending', 'approved', 'edited', 'rejected', 'expired', 'superseded')),
        decided_by uuid REFERENCES users(id),
        decided_at timestamptz,
        edit_ratio numeric(5, 4),
        reject_reason varchar(500),
        expires_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX work_items_pending_idx ON work_items (workspace_id, created_at DESC) WHERE state = 'pending';
      CREATE INDEX work_items_staff_task_idx ON work_items (workspace_id, staff_id, task_type, decided_at);

      CREATE TABLE domain_events (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        type varchar(60) NOT NULL,
        payload jsonb NOT NULL,
        source_run_id uuid REFERENCES task_runs(id) ON DELETE SET NULL,
        dispatched_at timestamptz,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX domain_events_undispatched_idx ON domain_events (created_at) WHERE dispatched_at IS NULL;
    `);

    await q.query(`
      CREATE TABLE activity_events (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
        actor varchar(60) NOT NULL,
        type varchar(60) NOT NULL,
        summary varchar(300) NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}',
        cost_usd numeric(12, 6),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX activity_events_workspace_idx ON activity_events (workspace_id, created_at DESC);

      CREATE TABLE audit_log (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE SET NULL,
        action varchar(60) NOT NULL,
        target varchar(120) NOT NULL,
        detail jsonb NOT NULL DEFAULT '{}',
        ip varchar(45),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX audit_log_workspace_idx ON audit_log (workspace_id, created_at DESC);

      CREATE TABLE usage_reservations (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        staff_id uuid REFERENCES staff_members(id) ON DELETE SET NULL,
        task_run_id uuid REFERENCES task_runs(id) ON DELETE SET NULL,
        kind varchar(16) NOT NULL CHECK (kind IN ('model', 'research', 'connector')),
        model varchar(60),
        reserved_usd numeric(12, 6) NOT NULL,
        actual_usd numeric(12, 6) NOT NULL DEFAULT 0,
        input_tokens integer NOT NULL DEFAULT 0,
        output_tokens integer NOT NULL DEFAULT 0,
        state varchar(16) NOT NULL DEFAULT 'reserved' CHECK (state IN ('reserved', 'settled', 'released')),
        expires_at timestamptz NOT NULL,
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE INDEX usage_reservations_period_idx ON usage_reservations (workspace_id, created_at);

      CREATE TABLE spend_caps (
        id uuid PRIMARY KEY,
        workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        monthly_cap_usd numeric(12, 2) NOT NULL,
        alert_at_pct integer NOT NULL DEFAULT 80 CHECK (alert_at_pct BETWEEN 1 AND 100),
        alerted_period varchar(7),
        created_at timestamptz NOT NULL DEFAULT now(),
        updated_at timestamptz NOT NULL DEFAULT now()
      );
      CREATE UNIQUE INDEX spend_caps_workspace_key ON spend_caps (workspace_id);
    `);

    for (const table of TENANT_TABLES) {
      await q.query(`
        ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY;
        CREATE POLICY ${table}_tenant ON ${table}
          USING (app_is_system() OR workspace_id = app_workspace_id())
          WITH CHECK (app_is_system() OR workspace_id = app_workspace_id());
      `);
    }

    // Logs are append-only for the app role: it may add and read rows, never change or remove them.
    await q.query(`
      REVOKE UPDATE, DELETE ON activity_events, audit_log FROM ai_staff_app;
    `);
  }

  async down(): Promise<void> {
    throw new Error('Migrations are forward-only. Write a new migration to change the schema.');
  }
}
