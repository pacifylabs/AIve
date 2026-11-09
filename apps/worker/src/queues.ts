/** Queue names, shared with the API, which enqueues platform jobs (website prefill) for the worker. */
export const SYSTEM_QUEUE = 'system';
/** Task runs. Postgres holds each run's state; a job here only says "execute this run now". */
export const TASKS_QUEUE = 'tasks';
/** Platform jobs that are not task runs: website prefill and the nightly promotion evaluation. */
export const PLATFORM_QUEUE = 'platform';

/** Outgoing email: one job per send intent. Postgres holds the intent's state; a job only says "try this one now". */
export const MAIL_QUEUE = 'mail';

/** Social posts: one job per publish intent, plus checks on posts whose outcome was unclear. */
export const PUBLISH_QUEUE = 'publish';

export type PublishJob =
  | { kind: 'publish'; workspaceId: string; intentId: string }
  | { kind: 'reconcile'; workspaceId: string; intentId: string }
  | { kind: 'check'; workspaceId: string; intentId: string }
  | { kind: 'reply'; workspaceId: string; intentId: string };

export interface HeartbeatJob {
  requestedAt: string;
}

export interface TaskJob {
  workspaceId: string;
  runId: string;
}

export interface MailJob {
  workspaceId: string;
  intentId: string;
}

export type PlatformJob =
  | { kind: 'prefill'; workspaceId: string }
  | { kind: 'evaluate_promotions' }
  | { kind: 'recheck_dns' }
  | { kind: 'sync_comments' }
  | { kind: 'poll_feeds' }
  | { kind: 'check_accounts' }
  | { kind: 'capture_stats' }
  | { kind: 'generate_recurring' };
