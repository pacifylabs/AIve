import {
  ActivityEvent,
  DomainEvent,
  type EntityManager,
  In,
  Lead,
  StaffMember,
  StaffTaskSetting,
  WorkItem,
} from '@ai-staff/db';
import { APPROVED_PAYLOAD, type AutonomyLevel, type Effect, EXTERNAL_EFFECTS } from '../roles/types.js';
import { createSendIntent, recordResearch, suppress, updateConversation } from './mail-effects.js';
import { insertRun } from './triggers.js';

/** Where effects came from: a task run, or a person approving a work item. */
export interface EffectOrigin {
  workspaceId: string;
  staffId: string;
  taskType: string;
  taskRunId: string | null;
  profileVersion: number | null;
  factIds: string[];
  /** `staff`, `system`, or `user:<id>`. */
  actor: string;
}

/** A role returned an effect it may not use at its current autonomy. The run fails rather than act. */
export class AutonomyViolationError extends Error {}

/**
 * The rule that makes approvals real: at autonomy `draft` (or `off`), anything that reaches outside the platform must
 * sit inside a work item's `onApprove`, so it only happens when a person says yes.
 */
export function assertAllowedAtAutonomy(effects: Effect[], autonomy: AutonomyLevel): void {
  if (autonomy === 'act') return;
  for (const effect of effects) {
    if (EXTERNAL_EFFECTS.has(effect.type)) {
      throw new AutonomyViolationError(
        `"${effect.type}" needs a person's approval at autonomy "${autonomy}"; put it in a work item's onApprove.`,
      );
    }
  }
}

/** Replaces the approved-payload marker in follow-up effects with what the person approved, edits included. */
export function withApprovedPayload(effects: Effect[], approved: Record<string, unknown>): Effect[] {
  const text = (key: string) => {
    const value = approved[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`The approved draft has no ${key}.`);
    return value;
  };
  return effects.map((effect) => {
    if (effect.type === 'emitEvent' && effect.payload === APPROVED_PAYLOAD) return { ...effect, payload: approved };
    if (effect.type === 'createSendIntent') {
      return {
        ...effect,
        subject: effect.subject === APPROVED_PAYLOAD ? text('subject') : effect.subject,
        body: effect.body === APPROVED_PAYLOAD ? text('body') : effect.body,
      };
    }
    return effect;
  });
}

/**
 * Executes effects inside the caller's transaction. Because a run's effects and its completion commit together, a run
 * that crashes leaves no half-applied effects behind, and retrying it cannot apply them twice.
 */
export class EffectExecutor {
  async execute(m: EntityManager, origin: EffectOrigin, effects: Effect[]): Promise<{ workItemIds: string[] }> {
    const workItemIds: string[] = [];
    for (const effect of effects) {
      switch (effect.type) {
        case 'createWorkItem': {
          const item = await m.save(
            m.create(WorkItem, {
              workspaceId: origin.workspaceId,
              staffId: origin.staffId,
              taskRunId: origin.taskRunId,
              taskType: origin.taskType,
              kind: effect.kind,
              title: effect.title,
              payload: effect.payload,
              original: effect.payload,
              onApprove: effect.onApprove,
              factIds: origin.factIds,
              profileVersion: origin.profileVersion,
              flaggedReason: null,
              state: 'pending',
              expiresAt: effect.expiresInHours ? new Date(Date.now() + effect.expiresInHours * 3_600_000) : null,
            }),
          );
          workItemIds.push(item.id);
          await this.activity(m, origin, 'work_item.created', `Drafted "${effect.title}" for your approval.`, {
            workItemId: item.id,
          });
          break;
        }
        case 'escalate': {
          const item = await m.save(
            m.create(WorkItem, {
              workspaceId: origin.workspaceId,
              staffId: origin.staffId,
              taskRunId: origin.taskRunId,
              taskType: origin.taskType,
              kind: 'escalation',
              title: effect.title,
              payload: effect.payload,
              original: effect.payload,
              onApprove: [],
              factIds: origin.factIds,
              profileVersion: origin.profileVersion,
              flaggedReason: effect.reason.slice(0, 300),
              state: 'pending',
              expiresAt: null,
            }),
          );
          workItemIds.push(item.id);
          await this.activity(m, origin, 'work_item.escalated', `Handed "${effect.title}" to you: ${effect.reason}`, {
            workItemId: item.id,
          });
          break;
        }
        case 'emitEvent': {
          if (effect.payload === APPROVED_PAYLOAD) {
            throw new Error(`Event "${effect.event}" uses the approved payload outside an approval.`);
          }
          await m.save(
            m.create(DomainEvent, {
              workspaceId: origin.workspaceId,
              type: effect.event,
              payload: effect.payload,
              sourceRunId: origin.taskRunId,
              dispatchedAt: null,
            }),
          );
          break;
        }
        case 'alert':
          await this.activity(m, origin, 'alert', effect.summary, effect.detail ?? {});
          break;
        case 'createSendIntent': {
          if (effect.subject === APPROVED_PAYLOAD || effect.body === APPROVED_PAYLOAD) {
            throw new Error('A send uses the approved draft outside an approval.');
          }
          const result = await createSendIntent(m, origin.workspaceId, origin.staffId, effect);
          await this.activity(
            m,
            origin,
            result.created ? 'email.queued' : 'email.not_queued',
            result.created
              ? `Queued "${effect.subject}" to send.`
              : `Did not queue "${effect.subject}": ${result.reason}`,
            { leadId: effect.leadId, ...(result.created ? { intentId: result.intentId } : {}) },
          );
          break;
        }
        case 'suppress':
          await suppress(m, origin.workspaceId, effect.value, effect.reason, effect.note);
          await this.activity(
            m,
            origin,
            'suppressed',
            `${effect.value} will not be contacted again (${effect.reason}).`,
            {},
          );
          break;
        case 'updateLead':
          await m.update(Lead, { workspaceId: origin.workspaceId, id: effect.leadId }, { state: effect.state });
          break;
        case 'recordResearch':
          await recordResearch(m, origin.workspaceId, effect);
          break;
        case 'updateConversation':
          await updateConversation(m, origin.workspaceId, effect);
          break;
        case 'demote': {
          const result = await m.update(
            StaffTaskSetting,
            {
              workspaceId: origin.workspaceId,
              staffId: origin.staffId,
              taskType: In(effect.taskTypes),
              autonomy: 'act',
            },
            { autonomy: 'draft' },
          );
          if (result.affected) {
            await this.activity(m, origin, 'autonomy.demoted', `Back to drafts for your approval: ${effect.reason}`, {
              taskTypes: effect.taskTypes,
            });
          }
          break;
        }
        case 'pauseStaff':
          await m.update(
            StaffMember,
            { workspaceId: origin.workspaceId, id: origin.staffId },
            { state: 'paused', pausedReason: effect.reason.slice(0, 300) },
          );
          await this.activity(m, origin, 'staff.paused', `Paused: ${effect.reason}`, {});
          break;
        case 'scheduleTask':
          await insertRun(m, {
            workspaceId: origin.workspaceId,
            staffId: origin.staffId,
            taskType: effect.taskType,
            trigger: 'schedule',
            idempotencyKey: effect.idempotencyKey,
            input: effect.input,
            runAt: effect.runAt,
          });
          break;
        default: {
          const unhandled: never = effect;
          throw new Error(`Unknown effect ${JSON.stringify(unhandled)}`);
        }
      }
    }
    return { workItemIds };
  }

  private async activity(
    m: EntityManager,
    origin: EffectOrigin,
    type: string,
    summary: string,
    detail: Record<string, unknown>,
  ): Promise<void> {
    await m.save(
      m.create(ActivityEvent, {
        workspaceId: origin.workspaceId,
        staffId: origin.staffId,
        actor: origin.actor,
        type,
        summary: summary.slice(0, 300),
        detail: { ...detail, taskType: origin.taskType, taskRunId: origin.taskRunId },
        costUsd: null,
      }),
    );
  }
}
