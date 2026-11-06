import type { EntityManager, StaffTaskSetting } from '@ai-staff/db';
import type { PromotionRule } from '../roles/types.js';

/**
 * Autopilot lets a task that acts outside the platform (publish, send) stop waiting for a person, once the owner's
 * rules are met. The guardrails never switch off: a draft that fails one still goes to the inbox. These limits keep
 * "automatic" from meaning "without evidence", whatever the owner types.
 */
export const AUTOPILOT_LIMITS = {
  approvals: { min: 5, max: 200 },
  windowDays: { min: 7, max: 90 },
  maxMedianEditRatio: { min: 0, max: 0.3 },
  maxPerDay: { min: 1, max: 50, fallback: 10 },
} as const;

export interface AutopilotRules {
  /** Approvals needed inside the window. */
  approvals: number;
  /** Median share of the text a person changed (0 = untouched) at or below which the record counts as clean. */
  maxMedianEditRatio: number;
  windowDays: number;
  /** Most actions the task takes without approval in 24 hours. Past it, drafts wait in the inbox again. */
  maxPerDay: number;
}

function clamp(value: unknown, min: number, max: number, fallback: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.min(max, Math.max(min, value));
}

/**
 * The role's rule with the owner's overrides on top. The platform limits bind the owner's numbers; the role's own rule
 * is trusted code and is used as written.
 */
export function resolveAutopilotRules(role: PromotionRule, stored: Record<string, unknown> | null): AutopilotRules {
  const own = stored ?? {};
  const limits = AUTOPILOT_LIMITS;
  return {
    approvals: Math.round(clamp(own.approvals, limits.approvals.min, limits.approvals.max, role.approvals)),
    windowDays: Math.round(clamp(own.windowDays, limits.windowDays.min, limits.windowDays.max, role.windowDays)),
    maxMedianEditRatio: clamp(
      own.maxMedianEditRatio,
      limits.maxMedianEditRatio.min,
      limits.maxMedianEditRatio.max,
      role.maxMedianEditRatio,
    ),
    maxPerDay: Math.round(clamp(own.maxPerDay, limits.maxPerDay.min, limits.maxPerDay.max, limits.maxPerDay.fallback)),
  };
}

export interface DecisionRow {
  state: string;
  ratio: number | null;
}

export interface AutopilotProgress {
  approvals: number;
  rejections: number;
  medianEditRatio: number;
  met: boolean;
  /** What is still in the way, in words for the owner. Empty when `met`. */
  missing: string[];
}

/** How a task's recent decisions measure up against the rules. Any rejection inside the window blocks autopilot. */
export function autopilotProgress(rows: DecisionRow[], rules: AutopilotRules): AutopilotProgress {
  const approved = rows.filter((row) => row.state !== 'rejected');
  const rejections = rows.length - approved.length;
  const ratios = approved.map((row) => row.ratio ?? 0).sort((a, b) => a - b);
  const medianEditRatio = ratios[Math.floor(ratios.length / 2)] ?? 0;

  const missing: string[] = [];
  if (approved.length < rules.approvals) {
    const need = rules.approvals - approved.length;
    missing.push(`${need} more approval${need === 1 ? '' : 's'} needed`);
  }
  if (rejections > 0) {
    missing.push(`${rejections} rejection${rejections === 1 ? '' : 's'} in the last ${rules.windowDays} days`);
  }
  if (approved.length && medianEditRatio > rules.maxMedianEditRatio) {
    missing.push(
      `edits are too heavy: ${Math.round(medianEditRatio * 100)}% of the text is changed, the limit is ${Math.round(
        rules.maxMedianEditRatio * 100,
      )}%`,
    );
  }
  return { approvals: approved.length, rejections, medianEditRatio, met: missing.length === 0, missing };
}

/**
 * The approvals and rejections that count toward the rules: decided inside the window, and after the last demotion
 * where that is more recent, so a task that was just pulled back starts again from a clean record.
 */
export async function recentDecisions(
  m: EntityManager,
  setting: Pick<StaffTaskSetting, 'workspaceId' | 'staffId' | 'taskType' | 'demotedAt'>,
  rules: AutopilotRules,
  now: Date,
): Promise<DecisionRow[]> {
  const since = new Date(now.getTime() - rules.windowDays * 86_400_000);
  const from = setting.demotedAt && setting.demotedAt > since ? setting.demotedAt : since;
  return (await m.query(
    `SELECT state, edit_ratio::float AS ratio FROM work_items
      WHERE workspace_id = $1 AND staff_id = $2 AND task_type = $3 AND decided_at >= $4
        AND state IN ('approved', 'edited', 'rejected')`,
    [setting.workspaceId, setting.staffId, setting.taskType, from],
  )) as DecisionRow[];
}

/**
 * Runs of this task in the last 24 hours that finished without needing a person: what autopilot did on its own. The
 * engine compares it with the daily limit before each run.
 */
export async function autoActionsInLastDay(
  m: EntityManager,
  setting: Pick<StaffTaskSetting, 'workspaceId' | 'staffId' | 'taskType'>,
  now: Date,
): Promise<number> {
  const rows = (await m.query(
    `SELECT count(*)::int AS done FROM task_runs
      WHERE workspace_id = $1 AND staff_id = $2 AND task_type = $3
        AND state = 'done' AND outcome = 'completed' AND finished_at >= $4`,
    [setting.workspaceId, setting.staffId, setting.taskType, new Date(now.getTime() - 86_400_000)],
  )) as { done: number }[];
  return rows[0]?.done ?? 0;
}
