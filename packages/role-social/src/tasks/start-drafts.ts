import type { TaskDefinition } from '@ai-staff/core';
import { z } from 'zod';

const item = z.object({
  id: z.string(),
  accountId: z.uuid(),
  network: z.string(),
  handle: z.string().nullable(),
  accountName: z.string(),
  scheduledFor: z.string(),
  pillar: z.string(),
  angle: z.string(),
});
const input = z.object({ weekStart: z.string(), items: z.array(item).max(15) });
type Input = z.infer<typeof input>;

/** Turns an approved plan into one drafting run per post idea. Runs at most once per idea, however often it is replayed. */
export const startDrafts: TaskDefinition<Input, Input> = {
  type: 'social_media.start_drafts',
  name: 'Start drafting the approved plan',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ event: 'social.plan_approved' }],
  inputSchema: input,
  execute: (_ctx, planned) => Promise.resolve(planned),
  toEffects(ctx, planned) {
    return planned.items.map((idea) => ({
      type: 'scheduleTask' as const,
      taskType: 'social_media.draft_post',
      input: { ...idea, planItemId: idea.id, mediaUrls: [] },
      runAt: ctx.now,
      idempotencyKey: `draft:${idea.accountId}:${idea.scheduledFor}`,
    }));
  },
};
