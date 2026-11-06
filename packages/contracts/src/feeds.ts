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
