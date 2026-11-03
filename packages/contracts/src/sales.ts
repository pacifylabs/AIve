import { z } from 'zod';

/** Request bodies for Sales Manager Staff: mailboxes, leads, conversations, suppressions and hiring. */

const host = z.string().trim().min(1).max(253);
const login = z.object({
  host,
  port: z.number().int().min(1).max(65535),
  /** Implicit TLS. Left out, port 465 is implicit TLS and anything else must offer STARTTLS. */
  secure: z.boolean().optional(),
  user: z.string().trim().min(1).max(320),
  pass: z.string().min(1).max(500),
});

export const connectMailboxRequest = z.object({
  address: z.email().max(320),
  displayName: z.string().trim().min(1).max(120),
  /** `fixture` records mail instead of sending it and is refused in production. */
  provider: z.enum(['smtp', 'fixture']).default('smtp'),
  smtp: login.optional(),
  imap: login.optional(),
  /** `forward`: the customer forwards replies to the mailbox's URL. `imap`: we poll the inbox. */
  inboundMode: z.enum(['forward', 'imap']).default('forward'),
});

export const sendTestRequest = z.object({ to: z.email().max(320) });

export const createLeadRequest = z.object({
  name: z.string().trim().max(160).nullish(),
  company: z.string().trim().max(160).nullish(),
  email: z.email().max(320),
  website: z.string().trim().max(300).nullish(),
  timezone: z.string().trim().max(64).nullish(),
  notes: z.string().trim().max(2000).nullish(),
});

export const importLeadsRequest = z.object({
  /** CSV text with a header row. Columns: email (required), name, company, website, timezone. */
  csv: z.string().min(1).max(1_000_000),
  /** `false` only previews: nothing is saved until the person confirms. */
  commit: z.boolean().default(false),
});

export const updateLeadRequest = z.object({
  state: z.enum(['won', 'lost']).optional(),
  notes: z.string().trim().max(2000).nullish(),
});

export const humanReplyRequest = z.object({
  subject: z.string().trim().min(1).max(200).optional(),
  body: z.string().trim().min(1).max(4000),
});

export const resolveSendRequest = z.object({ outcome: z.enum(['sent', 'retry']) });

export const addSuppressionRequest = z.object({
  /** An email address, or `@domain` for a whole domain. */
  value: z
    .string()
    .trim()
    .toLowerCase()
    .max(320)
    .regex(/^(@[a-z0-9.-]+\.[a-z]{2,}|[^\s@]+@[^\s@]+\.[^\s@]+)$/, 'Enter an email address or @domain.com'),
  note: z.string().trim().max(300).optional(),
});

export const hireStaffRequest = z.object({
  roleKey: z.string().trim().min(1).max(40),
  displayName: z.string().trim().min(1).max(80),
  signature: z.string().trim().max(300).nullish(),
  settings: z.record(z.string(), z.unknown()).default({}),
});

export const updateStaffSettingsRequest = z.object({
  settings: z.record(z.string(), z.unknown()),
});

// ---- Social Media Staff ------------------------------------------------------------------------------------

export const selectAccountsRequest = z.object({
  externalIds: z.array(z.string().min(1).max(200)).min(1).max(50),
});

export const resolvePostRequest = z.object({
  /** `published`: it is on the network after all. `retry`: queue it again. */
  outcome: z.enum(['published', 'retry']),
  permalink: z.url({ protocol: /^https$/ }).max(500).optional(),
});
