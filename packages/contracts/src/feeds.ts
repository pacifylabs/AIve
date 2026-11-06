import { z } from 'zod';

/** Request bodies for feeds: blogs or news pages a Social Media Staff member writes posts about. */

const accountIds = z.array(z.uuid()).min(1, 'Pick at least one account.').max(10);

export const addFeedRequest = z.object({
  /** The address of an RSS, Atom or RDF feed. Checked by reading it before it is saved. */
  url: z.url({ protocol: /^https?$/ }).max(2000),
  accountIds,
  note: z.string().trim().max(500).optional(),
});

export const updateFeedRequest = z
  .object({
    accountIds: accountIds.optional(),
    note: z.string().trim().max(500).nullable().optional(),
    paused: z.boolean().optional(),
  })
  .refine((body) => Object.keys(body).length > 0, 'Nothing to change.');

/** A post a person writes by hand. `scheduledLocal` is the workspace's wall clock; left out, the post goes out now. */
export const composePostRequest = z.object({
  /** Stays the same if the form is sent twice, so one click never makes two posts. */
  requestId: z.uuid(),
  accountIds: z.array(z.uuid()).min(1, 'Pick at least one account.').max(10),
  body: z.string().trim().min(1, 'Write something to post.').max(5000),
  firstComment: z.string().trim().max(1000).optional(),
  mediaUrls: z
    .array(z.url({ protocol: /^https$/ }))
    .max(10)
    .default([]),
  linkUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .optional(),
  scheduledLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a date and time.')
    .optional(),
});
