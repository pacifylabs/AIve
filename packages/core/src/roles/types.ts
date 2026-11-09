import type {
  CompanyFact,
  CompanyProfile,
  ConversationState,
  EngagementClass,
  EntityManager,
  LeadState,
  ReplyClassification,
  StaffMember,
  SuppressionReason,
  TaskRun,
} from '@ai-staff/db';
import type { Effort } from '@ai-staff/llm';
import type { z } from 'zod';

/**
 * Types a role package implements. See docs/ROLE-FRAMEWORK.md. A role never reaches the network, the mailer or
 * billing directly: it returns effects, and the platform executes them. That rule keeps every role auditable,
 * budgeted and pausable.
 */

export type TaskRisk = 'internal' | 'drafts' | 'acts_external';
export type AutonomyLevel = 'off' | 'draft' | 'act';

export type TaskTriggerDefinition = { schedule: string } | { event: string } | { person: true };

/** What a task may ask the connected networks for. Implemented by the platform, which holds the tokens. */
export interface SocialAccess {
  /** Numbers for one published post, as the network reports them now. */
  fetchMetrics(postId: string): Promise<Record<string, number>>;
}

/** Everything a task may read while it runs. Writes go through effects, not through `db`. */
export interface TaskContext {
  workspaceId: string;
  staff: StaffMember;
  run: TaskRun;
  /** Current, confirmed facts only. Website suggestions a person has not confirmed are never shown to a model. */
  facts: CompanyFact[];
  profile: CompanyProfile | null;
  autonomy: AutonomyLevel;
  /**
   * Loads the task's own data in a short tenant-scoped transaction. Tasks never hold a transaction open while they call
   * the network, and never write: writes go through effects.
   */
  read<T>(work: (m: EntityManager) => Promise<T>): Promise<T>;
  now: Date;
  /** Read-only access to the connected networks, where the deployment has them. Tasks never hold tokens. */
  social?: SocialAccess;
  /**
   * Untrusted text the prompt showed the model (a lead's web page, their reply). `buildPrompt` adds to it. Plain
   * figures in it may be repeated back ("your team of 40"); prices and percentages must still come from facts.
   */
  evidence?: string[];
}

export interface Prompt {
  /** The rules. Never contains untrusted text. */
  system: string;
  /** The task. Untrusted text (pages, replies, comments) goes in tagged data blocks after the rules; see untrusted(). */
  user: string;
  /** Facts the prompt included, recorded on any work item so a fact change can invalidate it. */
  factIds: string[];
}

/** Payload marker in an `onApprove` effect: replaced by the payload a person approved, edits included. */
export const APPROVED_PAYLOAD = '$approved' as const;

/**
 * The closed set of things a role can ask the platform to do. External effects (`createSendIntent`, and the M4
 * `createPublishIntent`) reach outside the platform: at autonomy `draft` they may only appear inside a work item's
 * `onApprove`, which the engine enforces.
 */
export type Effect =
  | {
      type: 'createWorkItem';
      kind: string;
      title: string;
      payload: Record<string, unknown>;
      /** Run when a person approves. */
      onApprove: Effect[];
      expiresInHours?: number;
    }
  | {
      type: 'emitEvent';
      event: string;
      payload: Record<string, unknown> | typeof APPROVED_PAYLOAD;
    }
  | {
      /** Hand the work to a person: becomes a flagged work item with nothing to approve automatically. */
      type: 'escalate';
      title: string;
      reason: string;
      payload: Record<string, unknown>;
    }
  | {
      /** Something the owner should know about, shown in the activity log and logged for operators. */
      type: 'alert';
      summary: string;
      detail?: Record<string, unknown>;
    }
  | {
      /**
       * Promise to send one email to a lead from the staff member's mailbox. The dispatcher sends it later, after the
       * send policy (hours, limits, suppression) and the conversation version are checked again at that moment.
       * `subject` and `body` may be `$approved`: the approved work item's `subject` and `body`, edits included.
       */
      type: 'createSendIntent';
      leadId: string;
      kind: 'first' | 'follow_up' | 'reply';
      subject: string;
      body: string;
      /** The conversation version this was written for; the send is dropped if the conversation moved on. */
      conversationVersion: number | null;
      idempotencyKey: string;
    }
  | {
      /** Never contact this address (or `@domain`) again from this workspace. Closes its open conversations. */
      type: 'suppress';
      value: string;
      reason: SuppressionReason;
      note?: string;
    }
  | {
      /**
       * Promise to publish one post to one connected account at `scheduledFor`. The dispatcher publishes it later, after
       * the account's health and the staff member's state are checked again. `body`, `firstComment` and `scheduledFor`
       * may be `$approved`: the approved work item's values, edits included.
       */
      type: 'createPublishIntent';
      accountId: string;
      body: string;
      linkUrl?: string | null;
      firstComment?: string | null;
      /** Replies sent one after another once the post is up, or `$approved`: the approved item's `followUps`, one per `---` line. */
      followUps?: string[] | typeof APPROVED_PAYLOAD;
      tagId?: string | null;
      /** Public picture or video URLs, or `$approved`: the approved item's `mediaUrls`, one per line. */
      media: string[] | typeof APPROVED_PAYLOAD;
      /** ISO time. Work items store effects as JSON, so this is text, not a Date. */
      scheduledFor: string;
      idempotencyKey: string;
    }
  | {
      /**
       * Promise to answer one comment or private message. A person approved the wording; the sender checks the network's
       * reply window and the account again at the moment of sending. `message` may be `$approved`: the approved item's
       * `reply`, edits included.
       */
      type: 'createReplyIntent';
      engagementId: string;
      message: string;
      idempotencyKey: string;
    }
  | { type: 'updateLead'; leadId: string; state: LeadState }
  | {
      /** A person who showed buying intent on social: becomes a lead for the workspace's Sales Manager. */
      type: 'createLead';
      name: string | null;
      sourceRef: string;
      notes: string | null;
    }
  | {
      type: 'updateEngagement';
      engagementId: string;
      classification: EngagementClass;
      state: 'triaged' | 'replied' | 'dismissed';
    }
  | { type: 'recordMetrics'; postId: string; capture: '24h' | '7d'; metrics: Record<string, number> }
  | {
      type: 'recordResearch';
      leadId: string;
      items: { url: string; title: string | null; excerpt: string; kind: 'observed' | 'inferred' }[];
    }
  | {
      type: 'updateConversation';
      conversationId: string;
      /** Only applied if the conversation is still at this version. */
      expectedVersion: number;
      state?: ConversationState;
      classification?: ReplyClassification;
      reason?: string;
    }
  | {
      /** Take these tasks back to drafts (from `act`), so a person approves each one again. */
      type: 'demote';
      taskTypes: string[];
      reason: string;
    }
  | {
      /** Stop this staff member entirely until a person resumes it. */
      type: 'pauseStaff';
      reason: string;
    }
  | {
      /** Queue another task for this staff member later, once per idempotency key. */
      type: 'scheduleTask';
      taskType: string;
      input: Record<string, unknown>;
      runAt: Date;
      idempotencyKey: string;
    };

/** Effect types that reach outside the platform. */
export const EXTERNAL_EFFECTS: ReadonlySet<Effect['type']> = new Set<Effect['type']>([
  'createSendIntent',
  'createPublishIntent',
]);

export type GuardrailResult<O> = { ok: true; output: O } | { ok: false; reason: string };

/**
 * A deterministic check after the model. It either fixes the output (append, trim) or fails, which turns the run's
 * result into a work item flagged for a person. A run never silently drops content.
 */
export interface Guardrail<O> {
  name: string;
  check(output: O, ctx: TaskContext): GuardrailResult<O>;
}

export interface PromotionRule {
  /** Approvals needed inside the window before promotion is offered. */
  approvals: number;
  /** Median edit ratio (0 = untouched, 1 = rewritten) at or below which the record counts as clean. */
  maxMedianEditRatio: number;
  windowDays: number;
}

export interface ModelChoice {
  name: string;
  maxTokens: number;
  effort?: Effort;
}

export interface TaskDefinition<I = unknown, O = unknown> {
  /** `<role>.<task>`, stable, never renamed. */
  type: string;
  name: string;
  risk: TaskRisk;
  /** `act` is never allowed as the default for `acts_external`. */
  defaultAutonomy: AutonomyLevel;
  triggers: TaskTriggerDefinition[];
  inputSchema: z.ZodType<I>;
  maxAttempts?: number;

  /** A model task: builds a prompt, the platform calls the model with `outputSchema`. */
  model?: ModelChoice;
  outputSchema?: z.ZodType<O>;
  buildPrompt?(ctx: TaskContext, input: I): Promise<Prompt> | Prompt;

  /** A task without a model call (research, bookkeeping). Exactly one of `model` or `execute` is set. */
  execute?(ctx: TaskContext, input: I): Promise<O>;

  guardrails?: Guardrail<O>[];
  toEffects(ctx: TaskContext, output: O, input: I): Promise<Effect[]> | Effect[];
  promotion?: PromotionRule;
}

export interface EventSubscription {
  event: string;
  task: string;
  /** Turns the event payload into the task's input; returning null skips this event. */
  input(payload: Record<string, unknown>): Record<string, unknown> | null;
}

export interface InterviewQuestion {
  key: string;
  question: string;
  /** Where the answer goes: a role setting, or a company fact of this kind. */
  target: { setting: string } | { fact: CompanyFact['kind'] };
}

export interface RoleDefinition {
  key: string;
  version: number;
  name: string;
  summary: string;
  jobDescription: string[];
  settingsSchema: z.ZodType<Record<string, unknown>>;
  interview: InterviewQuestion[];
  // Each task keeps its own input and output types; the registry erases them at this boundary.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- heterogeneous task list, checked per task at runtime
  tasks: TaskDefinition<any, any>[];
  subscribes: EventSubscription[];
  emits: string[];
}

/** Wraps untrusted text so the model treats it as data. Tags inside the text are neutralised so it cannot close the block. */
export function untrusted(tag: string, text: string): string {
  const safe = text.replace(new RegExp(`</?${tag}\\b[^>]*>`, 'gi'), '');
  return `<${tag}>\n${safe}\n</${tag}>`;
}
