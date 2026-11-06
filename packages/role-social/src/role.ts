import type { RoleDefinition } from '@ai-staff/core';
import { socialSettingsSchema } from './settings.js';
import { draftFromArticle } from './tasks/draft-from-article.js';
import { draftPost } from './tasks/draft-post.js';
import { captureMetrics, planMetrics } from './tasks/metrics.js';
import { planWeek } from './tasks/plan-week.js';
import { startDrafts } from './tasks/start-drafts.js';
import { triageEngagement } from './tasks/triage.js';
import { weeklyReport } from './tasks/weekly-report.js';

const uuid = (value: unknown): value is string => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value);

/**
 * Social Media Staff. See docs/roles/SOCIAL-MEDIA-STAFF.md. Not here yet: video tasks (Milestone 4b) and the
 * synchronous caption-suggestion endpoint (it belongs to the API).
 */
export const socialMediaRole: RoleDefinition = {
  key: 'social_media',
  version: 1,
  name: 'Social Media Staff',
  summary: 'Plans your week of posts, writes them for each network, publishes what you approve, and answers comments.',
  jobDescription: [
    'Plans a week of posts around your offers and voice.',
    'Writes each post to fit the network it goes to.',
    'Schedules and publishes the posts you approve, or publishes on its own once promoted.',
    'Drafts replies to comments and messages, and flags anything that needs you.',
    'Spots people who want to buy and passes them to your Sales Manager Staff.',
    'Sends you a weekly summary of what was posted and how it did.',
  ],
  settingsSchema: socialSettingsSchema,
  interview: [
    {
      key: 'goal',
      question: 'What should people do after seeing your posts? (visit the site, book a call, buy, follow)',
      target: { setting: 'goal' },
    },
    { key: 'pillars', question: 'Pick 3–5 topics you want to be known for.', target: { setting: 'pillars' } },
    {
      key: 'styleExamples',
      question: 'Paste 2–3 posts you liked, yours or anyone’s. They are used as style examples, never copied.',
      target: { setting: 'styleExamples' },
    },
    { key: 'neverPost', question: 'Anything you never post about?', target: { setting: 'neverPost' } },
    { key: 'cadence', question: 'How often per network?', target: { setting: 'cadence' } },
  ],
  tasks: [
    planWeek,
    startDrafts,
    draftPost,
    draftFromArticle,
    triageEngagement,
    planMetrics,
    captureMetrics,
    weeklyReport,
  ],
  subscribes: [
    {
      event: 'social.plan_approved',
      task: 'social_media.start_drafts',
      input: (payload) =>
        typeof payload.weekStart === 'string' && Array.isArray(payload.items)
          ? { weekStart: payload.weekStart, items: payload.items }
          : null,
    },
    {
      event: 'engagement.received',
      task: 'social_media.triage_engagement',
      input: (payload) => (uuid(payload.engagementId) ? { engagementId: payload.engagementId } : null),
    },
    {
      event: 'post.published',
      task: 'social_media.plan_metrics',
      input: (payload) => (uuid(payload.postId) ? { postId: payload.postId } : null),
    },
    {
      event: 'content.article_found',
      task: 'social_media.draft_from_article',
      input: (payload) =>
        uuid(payload.feedItemId) && uuid(payload.accountId) && typeof payload.network === 'string'
          ? {
              feedItemId: payload.feedItemId,
              accountId: payload.accountId,
              network: payload.network,
              handle: typeof payload.handle === 'string' ? payload.handle : null,
            }
          : null,
    },
  ],
  emits: ['social.plan_approved'],
};
