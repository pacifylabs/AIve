import {
  ActivityEvent,
  AutomationRun,
  ConnectedAccount,
  DomainEvent,
  type EntityManager,
  PostAutomation,
  SocialPost,
} from '@ai-staff/db';
import { v7 as uuidv7 } from 'uuid';

/** The networks name the same things differently, so each number is read from whichever name the network used. */
const first = (metrics: Record<string, number>, keys: string[]) => {
  for (const key of keys) {
    const value = metrics[key];
    if (typeof value === 'number' && Number.isFinite(value)) return value;
  }
  return 0;
};

/** Likes, comments and shares together: what people did with the post. Views are not counted, they are reach. */
export function engagementOf(metrics: Record<string, number>): number {
  return (
    first(metrics, ['reactions', 'likes', 'like_count']) +
    first(metrics, ['comments', 'replies', 'reply_count']) +
    first(metrics, ['shares', 'reposts', 'retweet_count']) +
    first(metrics, ['quotes', 'quote_count'])
  );
}

/** How many times the post was shown, where the network says. Null when it does not. */
export function reachOf(metrics: Record<string, number>): number | null {
  const keys = ['impression_count', 'post_impressions', 'reach', 'views'];
  return keys.some((key) => typeof metrics[key] === 'number') ? first(metrics, keys) : null;
}

export const REPURPOSE_REQUESTED = 'post.repurpose_requested';

export type RepurposeResult = { requested: true } | { requested: false; reason: string };

/**
 * Asks the staff member for a fresh take on a post that did well, for one account. The answer is a draft in the inbox,
 * never a post: asking twice with the same `requestId` asks once.
 */
export async function requestRepurpose(
  m: EntityManager,
  input: { workspaceId: string; staffId: string; postId: string; accountId: string; requestId: string },
): Promise<RepurposeResult> {
  const post = await m.findOneBy(SocialPost, { workspaceId: input.workspaceId, id: input.postId });
  if (post?.state !== 'published') return { requested: false, reason: 'Only a post that went out can be repurposed.' };
  const account = await m.findOneBy(ConnectedAccount, { workspaceId: input.workspaceId, id: input.accountId });
  if (!account) return { requested: false, reason: 'That account is no longer connected.' };
  if (account.health === 'broken')
    return { requested: false, reason: `${account.name} needs to be reconnected first.` };
  const asked = (await m.query(
    `SELECT 1 FROM domain_events WHERE workspace_id = $1 AND type = $2 AND payload->>'requestId' = $3 AND payload->>'accountId' = $4`,
    [input.workspaceId, REPURPOSE_REQUESTED, input.requestId, account.id],
  )) as unknown[];
  if (asked.length) return { requested: true };
  await m.save(
    m.create(DomainEvent, {
      workspaceId: input.workspaceId,
      type: REPURPOSE_REQUESTED,
      // `staffId` sends the event to this staff member only.
      payload: {
        staffId: input.staffId,
        postId: post.id,
        accountId: account.id,
        network: account.network,
        handle: account.username,
        mediaUrls: post.media,
        requestId: input.requestId,
      },
      sourceRunId: null,
      dispatchedAt: null,
    }),
  );
  return { requested: true };
}

const DAY_MS = 86_400_000;

/**
 * Runs after a post's numbers are stored. Each switched-on rule whose number the post has reached asks for a draft, once
 * per post and within its daily and total caps. The draft goes to the inbox like any other: a rule never posts.
 */
export async function applyAutomations(
  m: EntityManager,
  workspaceId: string,
  postId: string,
  metrics: Record<string, number>,
  now: Date,
): Promise<number> {
  const post = await m.findOneBy(SocialPost, { workspaceId, id: postId });
  if (post?.state !== 'published') return 0;
  const score = engagementOf(metrics);
  const rules = await m.find(PostAutomation, { where: { workspaceId, enabled: true }, order: { createdAt: 'ASC' } });
  let drafted = 0;
  for (const rule of rules) {
    if (score < rule.threshold) continue;
    if (rule.accountIds.length && !rule.accountIds.includes(post.accountId)) continue;
    const used = (await m.query(
      `SELECT count(*)::int AS total, count(*) FILTER (WHERE created_at > $2)::int AS today
         FROM automation_runs WHERE automation_id = $1`,
      [rule.id, new Date(now.getTime() - DAY_MS)],
    )) as { total: number; today: number }[];
    if ((used[0]?.total ?? 0) >= rule.totalCap || (used[0]?.today ?? 0) >= rule.dailyCap) continue;
    // The pair is claimed first, so two readings arriving together cannot both draft.
    const claimed = (await m.query(
      `INSERT INTO automation_runs (id, workspace_id, automation_id, post_id) VALUES ($1, $2, $3, $4)
       ON CONFLICT (automation_id, post_id) DO NOTHING RETURNING id`,
      [uuidv7(), workspaceId, rule.id, post.id],
    )) as unknown[];
    if (!claimed.length) continue;
    const result = await requestRepurpose(m, {
      workspaceId,
      staffId: post.staffId,
      postId: post.id,
      accountId: post.accountId,
      requestId: `auto:${rule.id}:${post.id}`,
    });
    if (!result.requested) {
      // Nothing was asked for, so the claim is given back: a later reading may find the account reconnected.
      await m.delete(AutomationRun, { automationId: rule.id, postId: post.id });
      continue;
    }
    drafted += 1;
    await m.save(
      m.create(ActivityEvent, {
        workspaceId,
        staffId: post.staffId,
        actor: 'system',
        type: 'automation.drafted',
        summary: `A post reached ${rule.threshold} reactions, so a new draft was asked for. It is in your inbox once written.`,
        detail: { automationId: rule.id, postId: post.id, score },
        costUsd: null,
      }),
    );
  }
  return drafted;
}
