import { Cancel, type TaskDefinition } from '@ai-staff/core';
import { SocialPost } from '@ai-staff/db';
import { z } from 'zod';

const HOUR = 3_600_000;

const planInput = z.object({ postId: z.uuid() });

/** After a post goes up, schedules the two readings of how it did: a day later and a week later. */
export const planMetrics: TaskDefinition<z.infer<typeof planInput>, { postId: string; publishedAt: string }> = {
  type: 'social_media.plan_metrics',
  name: 'Schedule metrics for a published post',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [{ event: 'post.published' }],
  inputSchema: planInput,
  async execute(ctx, { postId }) {
    const post = await ctx.read((m) => m.findOneBy(SocialPost, { workspaceId: ctx.workspaceId, id: postId }));
    if (!post?.publishedAt) throw new Cancel('That post is not published.');
    return { postId, publishedAt: post.publishedAt.toISOString() };
  },
  toEffects(_ctx, { postId, publishedAt }) {
    const base = new Date(publishedAt).getTime();
    return (
      [
        ['24h', 24],
        ['7d', 24 * 7],
      ] as const
    ).map(([capture, hours]) => ({
      type: 'scheduleTask' as const,
      taskType: 'social_media.capture_metrics',
      input: { postId, capture },
      runAt: new Date(base + hours * HOUR),
      idempotencyKey: `metrics:${postId}:${capture}`,
    }));
  },
};

const captureInput = z.object({ postId: z.uuid(), capture: z.enum(['24h', '7d']) });
type CaptureInput = z.infer<typeof captureInput>;

/** Reads a post's numbers from its network and stores them. No model: every figure is the network's. */
export const captureMetrics: TaskDefinition<CaptureInput, CaptureInput & { metrics: Record<string, number> }> = {
  type: 'social_media.capture_metrics',
  name: 'Capture post metrics',
  risk: 'internal',
  defaultAutonomy: 'act',
  triggers: [],
  inputSchema: captureInput,
  maxAttempts: 4,
  async execute(ctx, { postId, capture }) {
    if (!ctx.social) throw new Cancel('This deployment is not connected to any network.');
    return { postId, capture, metrics: await ctx.social.fetchMetrics(postId) };
  },
  toEffects: (_ctx, { postId, capture, metrics }) => [{ type: 'recordMetrics', postId, capture, metrics }],
};
