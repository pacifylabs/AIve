import { ConnectedAccount, DomainEvent, type EntityManager, SocialPost } from '@ai-staff/db';

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
