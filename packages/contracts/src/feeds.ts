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

/** How a post repeats. Weekdays are 0 (Sunday) to 6 (Saturday). */
export const repeatRule = z.discriminatedUnion('kind', [
  z.object({
    kind: z.literal('weekly'),
    weekdays: z.array(z.number().int().min(0).max(6)).min(1).max(7),
    everyWeeks: z.number().int().min(1).max(8).default(1),
  }),
  z.object({ kind: z.literal('monthly_day'), dayOfMonth: z.number().int().min(1).max(31) }),
  z.object({
    kind: z.literal('monthly_weekday'),
    nth: z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)]),
    weekday: z.number().int().min(0).max(6),
  }),
]);

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
  /** Replies sent one after another once the post is up, each to the one before. */
  followUps: z.array(z.string().trim().min(1).max(5000)).max(9).default([]),
  tagId: z.uuid().optional(),
  /** Makes the post repeat from the date and time in `scheduledLocal`, until `repeatEndsOn` if given. */
  repeat: repeatRule.optional(),
  repeatEndsOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
  scheduledLocal: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/, 'Use a date and time.')
    .optional(),
});

export const TAG_COLOURS = ['blue', 'teal', 'green', 'amber', 'red', 'pink', 'purple', 'gray'] as const;

/** A colour tag: a short name and one colour from a fixed set. */
export const tagRequest = z.object({
  name: z.string().trim().min(1, 'Give the tag a name.').max(40),
  colour: z.enum(TAG_COLOURS),
});

/** A post written once and started from again. Accounts are suggestions, chosen again each time. */
export const templateRequest = z.object({
  name: z.string().trim().min(1, 'Give the template a name.').max(80),
  body: z.string().trim().min(1, 'Write the text of the template.').max(5000),
  firstComment: z.string().trim().max(1000).optional(),
  mediaUrls: z
    .array(z.url({ protocol: /^https$/ }))
    .max(10)
    .default([]),
  linkUrl: z
    .url({ protocol: /^https?$/ })
    .max(500)
    .optional(),
  accountIds: z.array(z.uuid()).max(10).default([]),
  tagId: z.uuid().nullable().optional(),
});

export const setPostTagRequest = z.object({ tagId: z.uuid().nullable() });

export const scheduleStateRequest = z.object({ paused: z.boolean() });

/** A change to a post that has not gone out. Only the fields sent change. `expectedUpdatedAt` guards against a stale copy. */
export const editPostRequest = z
  .object({
    expectedUpdatedAt: z.iso.datetime(),
    body: z.string().trim().min(1).max(5000).optional(),
    firstComment: z.string().trim().max(1000).nullable().optional(),
    linkUrl: z
      .url({ protocol: /^https?$/ })
      .max(500)
      .nullable()
      .optional(),
    mediaUrls: z
      .array(z.url({ protocol: /^https$/ }))
      .max(10)
      .optional(),
    followUps: z.array(z.string().trim().min(1).max(5000)).max(9).optional(),
    /** Either an exact instant, or the workspace's wall clock (`YYYY-MM-DDTHH:mm`). */
    scheduledFor: z.iso.datetime().optional(),
    scheduledLocal: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/)
      .optional(),
  })
  .refine((body) => Object.keys(body).length > 1, 'Nothing to change.');

/** Records a file the browser uploaded to Cloudinary into the media library. Cloudinary is asked what was stored. */
export const registerMediaRequest = z.object({
  publicId: z.string().trim().min(1).max(300),
  type: z.enum(['image', 'video']),
  name: z.string().trim().min(1).max(200),
});

/** An account the staff member may tag in posts. The `@` is optional; the network confirms it where it can. */
export const mentionRequest = z.object({
  network: z.enum(['facebook', 'instagram', 'threads', 'tiktok', 'linkedin', 'x', 'telegram', 'discord']),
  handle: z
    .string()
    .trim()
    .transform((value) => value.replace(/^@/, ''))
    .pipe(
      z.string().regex(/^[A-Za-z0-9_.]{2,50}$/, 'Use the account name, letters, numbers, dots and underscores only.'),
    ),
});
